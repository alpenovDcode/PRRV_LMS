/**
 * lib/tg/csv-salebot-adapter.ts
 *
 * Адаптер CSV-выгрузок SaleBot → наш стандартный формат импортёра
 * подписчиков (chatId / firstName / lastName / username / tags /
 * customFields).
 *
 * SaleBot экспортирует базу примерно так (разделитель `;`, BOM):
 *   "ID";"Имя";"Мессенджер";"С каким ботом было общение";
 *   "Идентификатор внутри мессенджера";"Дата первого контакта";...
 *   "Email";"Phone";"utm_source [client]";...;"tg_username [client]";...
 *
 * Что важно:
 *   • Колонка «Идентификатор внутри мессенджера» = Telegram chat_id.
 *     Для приватных чатов он равен user_id, поэтому при импорте в
 *     ДРУГОЙ бот тот же chat_id остаётся валидным (но Telegram не даст
 *     боту первым написать пользователю — это ограничение TG, не наше).
 *   • Колонка «Мессенджер» = "Telegram" / "Instagram" / "WhatsApp" / ...
 *     При импорте в TG-бот мы оставляем только Telegram-строки —
 *     остальные просто скипаем (вернутся в errors).
 *   • Колонки с `[client]` — это пользовательские переменные SaleBot,
 *     которые мы кладём в customFields. UTM, email, phone, ДР и т.д.
 *
 * Стратегия: если в заголовках есть «Идентификатор внутри мессенджера»
 * (или его английский алиас — некоторые экспорты приходят на en), то
 * это SaleBot — применяем мэппинг. Иначе считаем формат стандартным.
 */

export interface SalebotMappedRow {
  /** Готовая строка под наш стандартный импорт. */
  row: Record<string, string>;
  /** Если строка пропущена — причина (попадёт в errors[]). */
  skip?: string;
}

/**
 * Распознаёт SaleBot-формат по характерным колонкам заголовка.
 * Возвращает true если стоит применять мэппинг через mapSalebotRow().
 */
export function isSalebotHeader(headers: string[]): boolean {
  const set = new Set(headers.map((h) => h.toLowerCase().trim()));
  // Самый надёжный маркер — русское название колонки c chat_id.
  if (set.has("идентификатор внутри мессенджера")) return true;
  // На случай, если выгрузка была экспортирована с переведённым заголовком.
  if (
    set.has("messenger_id") &&
    set.has("messenger") &&
    set.has("с каким ботом было общение")
  ) {
    return true;
  }
  return false;
}

/**
 * Берёт одну строку SaleBot CSV и превращает её в нашу стандартную
 * строку для импортёра. Если строку нельзя импортнуть в TG-бот
 * (например мессенджер Instagram, или пустой chat_id) — возвращает
 * { skip: "<причина>" }.
 */
export function mapSalebotRow(row: Record<string, string>): SalebotMappedRow {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      // Сравниваем регистронезависимо — SaleBot не всегда стабилен в
      // регистре заголовков.
      const found = Object.keys(row).find(
        (h) => h.toLowerCase().trim() === k.toLowerCase().trim()
      );
      if (found) {
        const v = row[found];
        if (v && v.trim() !== "") return v.trim();
      }
    }
    return "";
  };

  // ── Только Telegram-строки. Instagram/WhatsApp/MAX скипаем. ─────────────
  const messenger = get("Мессенджер", "Messenger");
  if (messenger && messenger.toLowerCase() !== "telegram") {
    return { row: {}, skip: `мессенджер ${messenger} — не Telegram` };
  }

  const chatId = get(
    "Идентификатор внутри мессенджера",
    "messenger_id"
  );
  if (!chatId) {
    return { row: {}, skip: "пустой chat_id" };
  }
  if (!/^-?\d{1,32}$/.test(chatId)) {
    return { row: {}, skip: `chat_id ${chatId} — не число` };
  }

  // ── Имя: fio [client] обычно полное «Имя Фамилия», его и парсим. ────────
  // Падение на «Имя» (это поле, которое заполняет сам Telegram — может
  // быть «Ekaterina, ваш репетитор» или эмодзи) — только если fio пустой.
  const fullName = get("fio [client]", "name [client]") || get("Имя");
  const { firstName, lastName } = splitFio(fullName);

  // ── @username — без `@`. ────────────────────────────────────────────────
  const username = get("tg_username [client]").replace(/^@/, "");

  // ── Теги: собираем из 3-х источников и дедуплицируем. ───────────────────
  //   1. «Тег [client]» — основной тег SaleBot
  //   2. «Метки [client]» / «Метки» — JSON-список меток
  //   3. имя бота-источника как тег salebot:<bot> (чтобы потом отфильтровать)
  const tagsSet = new Set<string>();
  const primaryTag = get("Тег [client]", "Тег");
  if (primaryTag) tagsSet.add(primaryTag);
  const labels = get("Метки [client]", "Метки");
  if (labels) extractSalebotLabels(labels).forEach((t) => tagsSet.add(t));
  const sourceBot = get("С каким ботом было общение");
  if (sourceBot) tagsSet.add(`salebot:${sourceBot}`);
  // tag «imported:salebot» — чтобы в админке быстро отфильтровать всю базу,
  // импортированную из SaleBot.
  tagsSet.add("imported:salebot");

  // ── customFields: email, phone, UTM, DOB, ID-исходники, состояние ──────
  const cf: Record<string, string> = {};
  const put = (k: string, v: string) => {
    if (v && v.trim()) cf[k] = v.trim();
  };
  put("email", get("Email", "email [client]"));
  put("phone", get("Phone", "phone [client]"));
  put("workphone", get("workphone [client]"));
  put("utm_source", get("utm_source [client]"));
  put("utm_medium", get("utm_medium [client]"));
  put("utm_campaign", get("utm_campaign [client]"));
  put("utm_content", get("utm_content [client]"));
  put("utm_term", get("utm_term [client]"));
  put("tg_birthdate", get("tg_birthdate [client]"));
  put("referrer", get("refferer [client]", "referrer [client]"));
  put("salebot_id", get("ID"));
  put("salebot_bot", sourceBot);
  put("salebot_first_contact", get("Дата первого контакта"));
  put("salebot_last_contact", get("Дата последнего контакта"));
  put("salebot_state", get("Состояние воронки"));
  put("salebot_lists", get("Списки [client]"));
  put("salebot_full_lists", get("Списки"));
  // amoCRM/GetCourse-идентификаторы тоже сохраняем, если были —
  // потом пригодятся для синка с CRM.
  put("amo_client_id", get("amo_client_id [client]"));
  put("getcourse_user_id", get("getcourse_user_id [client]"));
  put("getcourse_deal_id", get("getcourse_deal_id [order]"));
  put("form_id", get("form_id [client]"));

  // ── Сериализация в наш формат импортёра ────────────────────────────────
  const tagsStr = Array.from(tagsSet).join(";");
  const cfStr = Object.entries(cf)
    // экранируем `;` в значениях — они ломают парсер пар key=value
    .map(([k, v]) => `${k}=${v.replace(/[;|]/g, " ")}`)
    .join(";");

  return {
    row: {
      chatId,
      firstName,
      lastName,
      username,
      tags: tagsStr,
      customFields: cfStr,
    },
  };
}

/**
 * Главная функция адаптера: принимает результат parseCsv() и, если это
 * SaleBot — возвращает преобразованный результат + сводку (сколько
 * скипнуто, по каким причинам). Если не SaleBot — возвращает null,
 * импортёр продолжит работать в стандартном режиме.
 */
export interface SalebotAdaptResult {
  rows: Array<Record<string, string>>;
  /** Заголовки после преобразования — наши стандартные. */
  headers: string[];
  /** Сколько SaleBot-строк скипнули и почему (для отчёта). */
  skipped: Array<{ row: number; reason: string }>;
}

export function adaptSalebotCsv(parsed: {
  headers: string[];
  rows: Array<Record<string, string>>;
}): SalebotAdaptResult | null {
  if (!isSalebotHeader(parsed.headers)) return null;
  const out: Array<Record<string, string>> = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  for (let i = 0; i < parsed.rows.length; i++) {
    const mapped = mapSalebotRow(parsed.rows[i]);
    if (mapped.skip) {
      // +2 = +1 заголовок, +1 1-based
      skipped.push({ row: i + 2, reason: mapped.skip });
      continue;
    }
    out.push(mapped.row);
  }
  return {
    rows: out,
    headers: ["chatId", "firstName", "lastName", "username", "tags", "customFields"],
    skipped,
  };
}

// ─── helpers ───────────────────────────────────────────────────────────────

/**
 * Разбивает «Имя Фамилия» на firstName + lastName. Если только одно слово —
 * lastName пустое. Если три и больше — firstName = первое, lastName =
 * остальное (например «Юлия Сергеевна Рыбакова» → first=Юлия, last=Сергеевна Рыбакова).
 */
function splitFio(fio: string): { firstName: string; lastName: string } {
  const cleaned = fio.replace(/[«»"„]/g, "").trim();
  if (!cleaned) return { firstName: "", lastName: "" };
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * SaleBot для поля «Метки» сериализует JSON в нестандартном виде:
 *   [{ID:645172,list_name:Автоворонка ПРОРЫВ | Регистрации TG},...]
 * Это не валидный JSON (ключи без кавычек, значения с пробелами тоже).
 * Просто вынимаем list_name через regex — нам нужны только названия.
 */
function extractSalebotLabels(raw: string): string[] {
  const out: string[] = [];
  // list_name:<что угодно до запятой или закрывающей скобки>
  const re = /list_name\s*:\s*([^,}\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].trim();
    if (name) out.push(name);
  }
  // Если ни одной метки не нашли, но строка не пустая — попробуем
  // взять её целиком как один тег.
  if (out.length === 0 && raw.trim() && raw.trim() !== "null") {
    out.push(raw.trim().slice(0, 64));
  }
  return out;
}
