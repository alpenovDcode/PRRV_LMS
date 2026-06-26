/**
 * Low-level HTTP-клиент к Unisender REST API.
 *
 * Docs: https://www.unisender.com/ru/support/category/api/
 *
 * Особенности:
 *   - Все методы POST, form-encoded body (application/x-www-form-urlencoded).
 *   - api_key обязательный параметр в каждом запросе.
 *   - Ответ: JSON. Успех = { result: ... }, ошибка = { error: "...", code: "..." }.
 *   - Rate-limit на тарифе Standard ≈ 10 RPS. Превышение → "too_many_requests".
 *
 * Внутри:
 *   - Token-bucket для local rate-limit (защита от собственного спама).
 *   - Exponential retry на 5xx, 429 (too_many_requests) и сетевые ошибки.
 *   - Type-safe wrapper unisenderRequest<T>().
 */

const DEFAULT_API_URL = "https://api.unisender.com/ru/api";
const DEFAULT_TIMEOUT_MS = 30_000;
const RATE_LIMIT_RPS = 10;
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [500, 2000, 5000];

interface UnisenderSuccess<T> {
  result: T;
}

interface UnisenderError {
  error: string;
  code?: string;
  warnings?: Array<{ index?: number; warning?: string }>;
}

type UnisenderResponse<T> = UnisenderSuccess<T> | UnisenderError;

export class UnisenderApiError extends Error {
  readonly code: string;
  readonly httpStatus?: number;
  readonly retriable: boolean;
  constructor(opts: {
    message: string;
    code?: string;
    httpStatus?: number;
    retriable?: boolean;
  }) {
    super(opts.message);
    this.name = "UnisenderApiError";
    this.code = opts.code ?? "unknown_error";
    this.httpStatus = opts.httpStatus;
    this.retriable = opts.retriable ?? false;
  }
}

// Простой token-bucket. RATE_LIMIT_RPS токенов в секунду, ёмкость = RPS.
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;

  constructor(rps: number) {
    this.capacity = rps;
    this.tokens = rps;
    this.refillPerMs = rps / 1000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
    this.lastRefill = now;
  }

  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }
    const wait = Math.ceil((1 - this.tokens) / this.refillPerMs);
    await new Promise((r) => setTimeout(r, wait));
    return this.acquire();
  }
}

const limiter = new RateLimiter(RATE_LIMIT_RPS);

function getApiUrl(): string {
  return process.env.UNISENDER_API_URL || DEFAULT_API_URL;
}

function getApiKey(): string {
  const key = process.env.UNISENDER_API_KEY;
  if (!key) {
    throw new UnisenderApiError({
      message: "UNISENDER_API_KEY не задан. Прокиньте env или переключите EMAIL_MARKETING_PROVIDER=yandex.",
      code: "missing_api_key",
    });
  }
  return key;
}

/**
 * Сериализует объект в form-encoded строку. Массивы передаются как
 * `key[0]=v0&key[1]=v1` — это формат Unisender для `field_names[]`,
 * `data[][]` и т.п.
 */
function encodeFormBody(params: Record<string, unknown>): string {
  const parts: string[] = [];
  const append = (k: string, v: unknown): void => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      v.forEach((item, idx) => append(`${k}[${idx}]`, item));
      return;
    }
    if (typeof v === "object") {
      for (const [subK, subV] of Object.entries(v as Record<string, unknown>)) {
        append(`${k}[${subK}]`, subV);
      }
      return;
    }
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  };
  for (const [k, v] of Object.entries(params)) append(k, v);
  return parts.join("&");
}

/**
 * Type-safe POST к Unisender. T — это тип `result` поля при успехе.
 *
 * @param method — имя метода API без слешей: "sendEmail", "createCampaign" и т.п.
 * @param params — параметры запроса; api_key добавим автоматически.
 */
export async function unisenderRequest<T>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const apiKey = getApiKey();
  const body = encodeFormBody({
    api_key: apiKey,
    format: "json",
    ...params,
  });

  const url = `${getApiUrl()}/${method}`;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await limiter.acquire();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        // 5xx — ретраим. 4xx — финально провалились (кроме 429).
        const retriable = response.status >= 500 || response.status === 429;
        if (retriable && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
          continue;
        }
        const text = await response.text().catch(() => "");
        throw new UnisenderApiError({
          message: `HTTP ${response.status} от Unisender: ${text.slice(0, 200)}`,
          code: `http_${response.status}`,
          httpStatus: response.status,
          retriable,
        });
      }

      const json = (await response.json()) as UnisenderResponse<T>;

      if ("error" in json) {
        // Бизнес-ошибка от Unisender — обычно не ретраим (invalid params,
        // невалидный список и т.п.). Кроме too_many_requests.
        const retriable = json.code === "too_many_requests";
        if (retriable && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
          continue;
        }
        throw new UnisenderApiError({
          message: `${method}: ${json.error}`,
          code: json.code,
          retriable,
        });
      }

      return json.result;
    } catch (e) {
      lastError = e;
      // Network / abort / timeout — ретраим.
      if (e instanceof UnisenderApiError && !e.retriable) {
        throw e;
      }
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
        continue;
      }
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new UnisenderApiError({
    message: `${method} failed after ${MAX_RETRIES + 1} attempts`,
    code: "max_retries_exceeded",
    retriable: false,
  });
}
