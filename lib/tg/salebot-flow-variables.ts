/**
 * lib/tg/salebot-flow-variables.ts
 *
 * Извлечение переменных из SaleBot-выгрузки воронки и автоматическое
 * создание соответствующих TgCustomField definitions.
 *
 * Откуда берём имена переменных:
 *   1. Шаблоны `#{var_name}` в текстах сообщений (answer), URL-кнопках,
 *      post_params HTTP-узлов.
 *   2. `compare_variable` условных узлов и переходов — выражения вида
 *      `var_a != 1 and var_b != ""` парсятся, имена извлекаются.
 *   3. `saved_variables` HTTP-узлов — формат
 *      `data|utm_source->client.utm_source;data|utm_medium->...`
 *      даёт целевые имена в правой части стрелки.
 *
 * Угадывание типа поля (`text` по умолчанию):
 *   • содержит `email`                              → email
 *   • содержит `phone`, `workphone`, `tel`          → phone
 *   • содержит `url`, `_link`, заканчивается `_url` → url
 *   • начинается с `utm_` или содержит `_utm_`      → text (но в UI
 *                                                    группируются как «маркетинг»)
 *   • содержит `birthdate`, `dob`                   → text (часто «Не указано»)
 *   • начинается с подчёркивания или цифры         → отфильтровываем
 *
 * Поля создаём идемпотентно через `createMany skipDuplicates`. Если у
 * админа уже есть поле с этим key — не перезаписываем (он мог задать
 * свой тип/label).
 */

import type { PrismaClient } from "@prisma/client";

/** Возможные типы TgCustomField (см. app/api/.../custom-fields/route.ts). */
type FieldType =
  | "text"
  | "number"
  | "date"
  | "email"
  | "phone"
  | "url"
  | "boolean";

interface ExtractedVar {
  key: string;
  type: FieldType;
  label: string;
  source: Set<"template" | "condition" | "saved_var">;
}

/**
 * Имя должно соответствовать /^[a-z][a-z0-9_]*$/ — валидируется на
 * стороне API создания custom-полей. Невалидные ключи отбрасываем.
 */
function isValidKey(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

function guessType(name: string): FieldType {
  const n = name.toLowerCase();
  if (n === "email" || n.endsWith("_email")) return "email";
  if (
    n === "phone" ||
    n === "workphone" ||
    n.endsWith("_phone") ||
    n === "tel"
  )
    return "phone";
  if (n.endsWith("_url") || n === "url" || n.endsWith("_link") || n.endsWith("link"))
    return "url";
  // Birthdate, dob — оставляем text, в SaleBot часто «Не указано».
  return "text";
}

function guessLabel(name: string): string {
  // Преобразуем snake_case → "Snake Case" по-русски через маппинг частых.
  const map: Record<string, string> = {
    email: "Email",
    phone: "Телефон",
    workphone: "Рабочий телефон",
    utm_source: "UTM source",
    utm_medium: "UTM medium",
    utm_campaign: "UTM campaign",
    utm_content: "UTM content",
    utm_term: "UTM term",
    tg_birthdate: "Дата рождения",
    tg_username: "Telegram username",
    referrer: "Referrer URL",
    name: "Имя",
    fio: "ФИО",
    group: "Группа",
    sms_text: "Текст SMS",
  };
  if (map[name]) return map[name];
  // Generic: "autointensive0426_enter" → "autointensive0426 enter"
  return name
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/**
 * Извлекает все `#{var}` ссылки из строки. Возвращает имена БЕЗ
 * точек/скобок — те, что подходят под isValidKey. SaleBot допускает
 * сложные выражения внутри #{}, мы берём только простые идентификаторы.
 */
function extractTemplateVars(s: string | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  // Не жадный матч, остановка на `}`.
  const re = /#\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const inner = m[1].trim();
    if (inner === "none") continue;
    // SaleBot может иметь точки (client.x), берём ХВОСТ после последней точки.
    const tail = inner.split(".").pop()!.trim();
    if (isValidKey(tail)) out.push(tail);
  }
  return out;
}

/**
 * Парсит `compare_variable` SaleBot — строка вида
 *   `autointensive0426_web_d1_was != 1 and autointensive0426_web_d1_link != ""`
 * Возвращает имена переменных в левой части сравнений.
 */
function extractConditionVars(s: string | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  // Делим по and/or (нестрого).
  const parts = s.split(/\s+(?:and|or)\s+/i);
  for (const p of parts) {
    // ищем токен слева от ==, !=, >=, <=, >, <
    const m = p.match(/^\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*(?:==|!=|>=|<=|>|<)/);
    if (!m) continue;
    const inner = m[1];
    const tail = inner.split(".").pop()!.trim();
    if (isValidKey(tail)) out.push(tail);
  }
  return out;
}

/**
 * Парсит `saved_variables` SaleBot — строка вида
 *   `data|utm_source->client.utm_source;
 *    data|utm_campaign->client.utm_campaign;`
 * Берём правую часть `->client.<name>` и оставляем <name>.
 */
function extractSavedVarsTargets(s: string | undefined): string[] {
  if (!s) return [];
  const out: string[] = [];
  // Разделители — `;` или перевод строки.
  const lines = s.split(/[;\n\r]+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Формат: <jsonpath>-><scope>.<name>
    const m = line.match(/->\s*[a-zA-Z_][a-zA-Z0-9_]*\.([a-zA-Z_][a-zA-Z0-9_]*)/);
    if (!m) continue;
    if (isValidKey(m[1])) out.push(m[1]);
  }
  return out;
}

/**
 * Главная функция: проходит по всем messages выгрузки и возвращает
 * собранный набор переменных с угаданными типами/лейблами.
 */
export interface ExtractInput {
  messages: Array<{
    answer?: string;
    buttons?: string;
    action_url?: string;
    post_params?: string;
    saved_variables?: string;
    compare_variable?: string;
    [k: string]: unknown;
  }>;
  connections: Array<{
    compare_variable?: string;
    [k: string]: unknown;
  }>;
}

export function extractSalebotVariables(input: ExtractInput): ExtractedVar[] {
  const found = new Map<string, ExtractedVar>();

  const note = (
    key: string,
    src: "template" | "condition" | "saved_var"
  ) => {
    if (!isValidKey(key)) return;
    const existing = found.get(key);
    if (existing) {
      existing.source.add(src);
      return;
    }
    found.set(key, {
      key,
      type: guessType(key),
      label: guessLabel(key),
      source: new Set([src]),
    });
  };

  for (const m of input.messages) {
    for (const v of extractTemplateVars(m.answer)) note(v, "template");
    for (const v of extractTemplateVars(m.buttons)) note(v, "template");
    for (const v of extractTemplateVars(m.action_url)) note(v, "template");
    for (const v of extractTemplateVars(m.post_params)) note(v, "template");
    for (const v of extractConditionVars(m.compare_variable))
      note(v, "condition");
    for (const v of extractSavedVarsTargets(m.saved_variables))
      note(v, "saved_var");
  }
  for (const c of input.connections) {
    for (const v of extractConditionVars(c.compare_variable))
      note(v, "condition");
  }

  return Array.from(found.values());
}

/**
 * Создаёт TgCustomField definitions для всех извлечённых переменных,
 * которых ещё нет у бота. Идемпотентно через `createMany skipDuplicates`
 * (есть `@@unique([botId, key])`). Существующие НЕ перезаписываются.
 *
 * Возвращает { createdCount, createdKeys, skippedKeys }.
 */
export async function ensureSalebotFlowFields(
  db: PrismaClient,
  botId: string,
  vars: ExtractedVar[]
): Promise<{
  createdCount: number;
  createdKeys: string[];
  skippedKeys: string[];
}> {
  if (vars.length === 0) {
    return { createdCount: 0, createdKeys: [], skippedKeys: [] };
  }
  const existing = await db.tgCustomField.findMany({
    where: { botId, key: { in: vars.map((v) => v.key) } },
    select: { key: true },
  });
  const have = new Set(existing.map((e) => e.key));
  const toCreate = vars.filter((v) => !have.has(v.key));
  const skipped = vars.filter((v) => have.has(v.key)).map((v) => v.key);

  if (toCreate.length === 0) {
    return { createdCount: 0, createdKeys: [], skippedKeys: skipped };
  }

  // sortOrder подбираем так чтобы email/phone оказались наверху,
  // utm_* посередине, всё остальное снизу — для лучшего UX в карточке
  // подписчика.
  const sortBucket = (v: ExtractedVar): number => {
    if (v.type === "email") return 10;
    if (v.type === "phone") return 20;
    if (v.key.startsWith("utm_")) return 50;
    if (v.type === "url") return 100;
    return 200;
  };

  const result = await db.tgCustomField.createMany({
    data: toCreate.map((v, i) => ({
      botId,
      key: v.key,
      label: v.label,
      type: v.type,
      description: `Создано автоматически при импорте SaleBot-сценария. Источник: ${Array.from(v.source).join(", ")}.`,
      sortOrder: sortBucket(v) + i,
    })),
    skipDuplicates: true,
  });

  return {
    createdCount: result.count,
    createdKeys: toCreate.slice(0, result.count).map((v) => v.key),
    skippedKeys: skipped,
  };
}
