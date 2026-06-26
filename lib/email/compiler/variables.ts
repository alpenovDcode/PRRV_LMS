import { signClickUrl } from "@/lib/email/tracking/utils";

/**
 * Подстановка переменных в скомпилированный HTML письма.
 *
 * Поддерживаемые переменные:
 *   {{firstName}}        — имя получателя (User.fullName или первое слово)
 *   {{email}}            — email получателя
 *   {{unsubscribeUrl}}   — one-click отписка с токеном
 *   {{viewInBrowserUrl}} — версия письма в браузере (Спринт 5+)
 *   {{trackingPixel}}    — 1×1 GIF для открытий (вставляется в конец body)
 *   любая кастомная из EmailDeliveryJob.variables JSON
 *
 * Также автоматически:
 *   1. Заворачивает все http(s)-ссылки в /api/email/track/click/<recipientId>?url=...&sig=...
 *      (кроме unsubscribeUrl — он сам tracking). Подпись HMAC защищает от
 *      open-redirect: атакующий не может сформировать tracking-ссылку с
 *      произвольным destination.
 *   2. Вставляет tracking-пиксель перед </body>
 */

export interface RenderVariablesParams {
  /** Скомпилированный HTML письма (из blocks-to-html). */
  html: string;
  /** Переменные для подстановки в {{var}}. */
  variables: Record<string, string | number | null | undefined>;
  /** ID получателя — для tracking-пикселя и click-redirect. */
  recipientId?: string;
  /** Токен для one-click отписки. */
  unsubscribeToken?: string;
  /** Base URL для tracking endpoint'ов. По умолчанию из EMAIL_TRACKING_BASE_URL или NEXT_PUBLIC_APP_URL. */
  trackingBaseUrl?: string;
  /** Если true — оборачивать ссылки в click-tracker. Default true. */
  enableClickTracking?: boolean;
  /** Если true — вставлять tracking-пиксель. Default true. */
  enableOpenTracking?: boolean;
}

function getTrackingBaseUrl(override?: string): string {
  return (
    override ||
    process.env.EMAIL_TRACKING_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://prrv.tech"
  );
}

/**
 * Подставляет {{var}} плейсхолдеры. Не падает на отсутствующих переменных —
 * заменяет на пустую строку. Это сознательно: одна забытая переменная не должна
 * валить отправку всей кампании.
 *
 * Также поддерживает conditional блоки (handlebars-like):
 *   {{#if tariff == "VR"}}Скидка 50%{{else}}Скидка 20%{{/if}}
 *   {{#if purchased}}Спасибо за покупку!{{/if}}
 *   {{#if !marketingOptOut}}...{{/if}}
 *   {{#if tariff in "VR,LR"}}...{{/if}}
 *
 * Conditional парсится первым проходом и заменяется на выбранную ветвь.
 * Дальше идёт обычная подстановка переменных.
 */
function substituteVariables(
  html: string,
  variables: Record<string, string | number | null | undefined>
): string {
  const withConditions = applyConditionals(html, variables);
  return withConditions.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

/**
 * Парсер conditional блоков. Обрабатывает только не-вложенные {{#if}} (для
 * подавляющего большинства маркетинговых сценариев этого хватает; нужна
 * вложенность — расширим). Не падает на синтаксических ошибках — оставляет
 * блок как есть и переходит дальше, чтобы кампания не сорвалась.
 */
function applyConditionals(
  html: string,
  variables: Record<string, string | number | null | undefined>
): string {
  // Жадный match с минимальным телом — `{{#if ...}} тело {{/if}}`.
  // `[\s\S]*?` потому что в HTML могут быть переводы строк.
  const re = /\{\{\s*#if\s+([^}]+?)\s*\}\}([\s\S]*?)\{\{\s*\/if\s*\}\}/g;
  return html.replace(re, (_match, expr: string, body: string) => {
    const parts = splitElse(body);
    const condition = evaluateConditional(expr.trim(), variables);
    if (condition) return parts.trueBranch;
    return parts.falseBranch;
  });
}

function splitElse(body: string): { trueBranch: string; falseBranch: string } {
  const elseRe = /\{\{\s*else\s*\}\}/;
  const m = body.match(elseRe);
  if (!m || m.index === undefined) {
    return { trueBranch: body, falseBranch: "" };
  }
  return {
    trueBranch: body.slice(0, m.index),
    falseBranch: body.slice(m.index + m[0].length),
  };
}

function evaluateConditional(
  expr: string,
  variables: Record<string, string | number | null | undefined>
): boolean {
  // Операторы (в порядке проверки): in, ==, !=, начальный !.
  // `var in "a,b,c"` — значение в списке (case-insensitive по trim).
  const inMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s+in\s+"([^"]*)"$/);
  if (inMatch) {
    const v = String(variables[inMatch[1]] ?? "").trim().toLowerCase();
    const list = inMatch[2]
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return list.includes(v);
  }

  // `var == "value"` или `var != "value"`.
  const cmpMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*(==|!=)\s*"([^"]*)"$/);
  if (cmpMatch) {
    const v = String(variables[cmpMatch[1]] ?? "");
    return cmpMatch[2] === "==" ? v === cmpMatch[3] : v !== cmpMatch[3];
  }

  // `!var` — falsy.
  const negMatch = expr.match(/^!\s*([a-zA-Z_][a-zA-Z0-9_.]*)$/);
  if (negMatch) {
    return !truthy(variables[negMatch[1]]);
  }

  // `var` — truthy.
  const plainMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)$/);
  if (plainMatch) {
    return truthy(variables[plainMatch[1]]);
  }

  // Невалидное выражение — не падаем, считаем false (показываем else).
  console.warn(`[email-compiler] unsupported conditional expression: "${expr}"`);
  return false;
}

function truthy(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  return s !== "" && s !== "false" && s !== "0" && s !== "null" && s !== "undefined";
}

/**
 * Оборачивает все http(s) ссылки внутри `<a href="...">` в click-tracker.
 * Пропускает:
 *   - mailto:, tel:, sms: схемы
 *   - якоря (#hash)
 *   - URL который уже на наш tracking-эндпоинт
 *   - unsubscribe-link (он на свой URL уже)
 */
function wrapClickTracking(
  html: string,
  recipientId: string,
  trackingBase: string
): string {
  const trackingPrefix = `${trackingBase}/api/email/track/click/${encodeURIComponent(recipientId)}`;

  return html.replace(/<a([^>]+)href="([^"]+)"([^>]*)>/gi, (match, before: string, url: string, after: string) => {
    // Пропускаем неотслеживаемые схемы и якоря.
    if (!/^https?:\/\//i.test(url)) return match;
    // Пропускаем уже обёрнутые ссылки.
    if (url.startsWith(trackingPrefix)) return match;
    // Пропускаем unsubscribe — он сам tracking-endpoint.
    if (url.includes("/email/unsubscribe/") || url.includes("/api/email/unsubscribe/")) {
      return match;
    }

    const sig = signClickUrl(recipientId, url);
    const wrapped = `${trackingPrefix}?url=${encodeURIComponent(url)}&sig=${sig}`;
    return `<a${before}href="${wrapped}"${after}>`;
  });
}

/**
 * Вставляет 1×1 GIF пиксель перед </body>. URL содержит recipientId,
 * чтобы при загрузке сервер записал EmailEvent type=opened.
 */
function injectOpenPixel(html: string, recipientId: string, trackingBase: string): string {
  const src = `${trackingBase}/api/email/track/open/${encodeURIComponent(recipientId)}.gif`;
  const pixel = `<img src="${src}" width="1" height="1" alt="" style="display: block; border: 0; height: 1px; width: 1px;" />`;
  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixel}\n</body>`);
  }
  return html + pixel;
}

/**
 * Конвертирует имя в «первое слово». Используется как fallback для {{firstName}}
 * когда хранится полное имя «Иван Иванов» в User.fullName.
 */
export function extractFirstName(fullName: string | null | undefined): string {
  if (!fullName) return "";
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/**
 * Главная функция: применяет ВСЕ преобразования финального HTML письма.
 * Порядок важен: variables → click tracking → open pixel.
 *   - variables раньше, чтобы tracking не натыкался на не-подставленные плейсхолдеры
 *   - click ДО pixel, чтобы пиксель не попал в click-обёртку
 */
export function applyVariablesAndTracking(params: RenderVariablesParams): string {
  let html = params.html;

  const trackingBase = getTrackingBaseUrl(params.trackingBaseUrl);

  // 1. Готовим автоматические переменные (unsubscribeUrl, viewInBrowserUrl).
  const autoVars: Record<string, string> = {};
  if (params.unsubscribeToken) {
    autoVars.unsubscribeUrl = `${trackingBase}/email/unsubscribe/${params.unsubscribeToken}`;
  } else {
    // Если токена нет (preview, test-send) — указываем placeholder.
    autoVars.unsubscribeUrl = `${trackingBase}/email/unsubscribe/preview`;
  }
  if (params.recipientId) {
    autoVars.viewInBrowserUrl = `${trackingBase}/email/view/${encodeURIComponent(params.recipientId)}`;
  }

  // 2. Подстановка переменных. Кастомные перекрывают авто (в редких случаях нужно).
  const merged: Record<string, string | number | null | undefined> = {
    ...autoVars,
    ...params.variables,
  };
  html = substituteVariables(html, merged);

  // 3. Click tracking (опционально).
  if (params.enableClickTracking !== false && params.recipientId) {
    html = wrapClickTracking(html, params.recipientId, trackingBase);
  }

  // 4. Open tracking pixel (опционально).
  if (params.enableOpenTracking !== false && params.recipientId) {
    html = injectOpenPixel(html, params.recipientId, trackingBase);
  }

  return html;
}
