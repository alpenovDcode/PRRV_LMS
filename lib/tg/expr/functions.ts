// Whitelisted functions available in flow expressions.
//
// Coverage is deliberately narrower than SaleBot's ~150-function calculator —
// we ship the 30 that cover real autowebinar / survey / dozhim funnels
// and add more iteratively as users ask. Each function is pure and
// total: throwing inside a function aborts the whole expression and
// the engine falls back to the empty string (in templates) or to
// `false` (in conditions), so handlers must be defensive about input
// shapes.

export type FnImpl = (...args: unknown[]) => unknown;

// -- helpers ----------------------------------------------------------

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v == null) return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : NaN;
}
function toStr(v: unknown): string {
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

// SaleBot date format: dd.mm.yyyy ; time: HH:MM[:SS]
const DATE_RE = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

function parseDate(s: string): Date | null {
  const m = DATE_RE.exec(s.trim());
  if (!m) return null;
  const [, d, mo, y, hh, mm, ss] = m;
  const dt = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh ?? 0),
    Number(mm ?? 0),
    Number(ss ?? 0)
  );
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}
function formatDate(dt: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}
function parseTime(s: string): { h: number; m: number; s: number } | null {
  const m = TIME_RE.exec(s.trim());
  if (!m) return null;
  return {
    h: Number(m[1]),
    m: Number(m[2]),
    s: Number(m[3] ?? 0),
  };
}
function formatTime(h: number, m: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(((h % 24) + 24) % 24)}:${pad(((m % 60) + 60) % 60)}`;
}

const RU_MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const RU_WEEKDAYS = [
  "воскресенье",
  "понедельник",
  "вторник",
  "среда",
  "четверг",
  "пятница",
  "суббота",
];
const RU_WEEKDAYS_SHORT = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

// strftime-style format used by current_date_rus / get_datetime.
function strftime(dt: Date, fmt: string): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return fmt.replace(/%(.)/g, (_match, d: string) => {
    switch (d) {
      case "Y": return String(dt.getFullYear());
      case "y": return pad(dt.getFullYear() % 100);
      case "m": return pad(dt.getMonth() + 1);
      case "d": return pad(dt.getDate());
      case "H": return pad(dt.getHours());
      case "M": return pad(dt.getMinutes());
      case "S": return pad(dt.getSeconds());
      case "I": return pad(((dt.getHours() % 12) || 12));
      case "p": return dt.getHours() < 12 ? "AM" : "PM";
      case "j": return pad(
        Math.floor(
          (dt.getTime() - new Date(dt.getFullYear(), 0, 0).getTime()) / 86400000
        ),
        3
      );
      case "A": return RU_WEEKDAYS[dt.getDay()].replace(/^./, (c) => c.toUpperCase());
      case "a": return RU_WEEKDAYS_SHORT[dt.getDay()];
      case "B": return RU_MONTHS[dt.getMonth()].replace(/^./, (c) => c.toUpperCase());
      case "b": return RU_MONTHS[dt.getMonth()].slice(0, 3);
      case "w": return String(dt.getDay());
      case "s": return String(Math.floor(dt.getTime() / 1000));
      case "%": return "%";
      default: return `%${d}`;
    }
  });
}

// -- function registry ------------------------------------------------

export const FUNCTIONS: Record<string, FnImpl> = {
  // ---- Math ---------------------------------------------------------
  abs: (n) => Math.abs(toNum(n)),
  ceil: (n) => Math.ceil(toNum(n)),
  floor: (n) => Math.floor(toNum(n)),
  int: (n) => Math.trunc(toNum(n)),
  round: (n, d) => {
    const dp = d == null ? 0 : Math.max(0, Math.min(20, Math.trunc(toNum(d))));
    const k = Math.pow(10, dp);
    return Math.round(toNum(n) * k) / k;
  },
  max: (...args) => Math.max(...args.map(toNum)),
  min: (...args) => Math.min(...args.map(toNum)),
  random: (low, high) => {
    const a = low == null ? 0 : toNum(low);
    const b = high == null ? 1 : toNum(high);
    return Math.floor(a + Math.random() * (b - a + 1));
  },
  pow: (n, p) => Math.pow(toNum(n), toNum(p)),
  sqrt: (n) => Math.sqrt(toNum(n)),
  is_int: (v) => Number.isInteger(toNum(v)) && !/[^0-9-]/.test(String(v ?? "").trim()),
  is_float: (v) => Number.isFinite(toNum(v)),

  // ---- String -------------------------------------------------------
  len: (s) => {
    if (Array.isArray(s)) return s.length;
    if (s && typeof s === "object") return Object.keys(s).length;
    return toStr(s).length;
  },
  lower: (s) => toStr(s).toLowerCase(),
  upper: (s) => toStr(s).toUpperCase(),
  strip: (s) => toStr(s).trim(),
  capitalize: (s) => {
    const str = toStr(s);
    return str ? str[0].toUpperCase() + str.slice(1).toLowerCase() : "";
  },
  title: (s) => toStr(s).replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase()),
  substring: (s, n1, n2) => {
    const str = toStr(s);
    const a = n1 == null ? 0 : Math.trunc(toNum(n1));
    const b = n2 == null ? str.length : Math.trunc(toNum(n2));
    // Negative n2 = "trim n2 from the end" (matches SaleBot).
    const end = b < 0 ? str.length + b : b;
    return str.slice(a, end);
  },
  contains: (s, sub, registr) => {
    const a = toStr(s);
    const b = toStr(sub);
    if (registr === false) return a.toLowerCase().includes(b.toLowerCase());
    return a.includes(b);
  },
  startswith: (s, sub) => toStr(s).startsWith(toStr(sub)),
  endswith: (s, sub) => toStr(s).endsWith(toStr(sub)),
  concat: (a, b) => toStr(a) + toStr(b),
  splitter: (s, sep, n) => {
    const arr = toStr(s).split(toStr(sep));
    if (n != null) {
      const lim = Math.max(1, Math.trunc(toNum(n)));
      if (arr.length > lim) {
        const head = arr.slice(0, lim - 1);
        head.push(arr.slice(lim - 1).join(toStr(sep)));
        return head;
      }
    }
    return arr;
  },
  replace: (s, from, to, n) => {
    const str = toStr(s);
    const f = toStr(from);
    const t = toStr(to);
    if (n == null) return str.split(f).join(t);
    const lim = Math.trunc(toNum(n));
    let out = "";
    let i = 0;
    let count = 0;
    while (i < str.length) {
      if (count < lim && str.startsWith(f, i)) {
        out += t;
        i += f.length;
        count++;
      } else {
        out += str[i];
        i++;
      }
    }
    return out;
  },
  normalizePhone: (s) => {
    let raw = toStr(s).replace(/\D+/g, "");
    if (raw.startsWith("8") && raw.length === 11) raw = "7" + raw.slice(1);
    return raw;
  },
  urlencode: (s) => encodeURIComponent(toStr(s)),
  urldecode: (s) => {
    try { return decodeURIComponent(toStr(s)); } catch { return toStr(s); }
  },
  tg_escape: (s) => toStr(s).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1"),

  // ---- Regex --------------------------------------------------------
  // Returns the i-th match, or "" if no match. To get all matches use
  // an unindexed call which returns an array.
  findall: (pattern, str, index) => {
    try {
      const re = new RegExp(toStr(pattern), "g");
      const matches: string[] = [];
      const src = toStr(str);
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        matches.push(m[1] ?? m[0]);
        if (m.index === re.lastIndex) re.lastIndex++;
      }
      if (index == null) return matches;
      const i = Math.trunc(toNum(index));
      return matches[i] ?? "";
    } catch {
      return index == null ? [] : "";
    }
  },
  // SaleBot's similar(): True if Levenshtein-normalized distance is
  // less than 30%. Cheap and effective for survey-style "yes / yess / Да".
  similar: (a, b) => {
    const s1 = toStr(a).toLowerCase();
    const s2 = toStr(b).toLowerCase();
    if (s1 === s2) return true;
    if (!s1 || !s2) return false;
    const dp: number[][] = [];
    for (let i = 0; i <= s1.length; i++) dp.push([i]);
    for (let j = 1; j <= s2.length; j++) dp[0][j] = j;
    for (let i = 1; i <= s1.length; i++) {
      for (let j = 1; j <= s2.length; j++) {
        const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    const dist = dp[s1.length][s2.length];
    const norm = dist / Math.max(s1.length, s2.length);
    return norm < 0.3;
  },

  // ---- Dates --------------------------------------------------------
  addDays: (date, n) => {
    const dt = parseDate(toStr(date));
    if (!dt) return "";
    dt.setDate(dt.getDate() + Math.trunc(toNum(n)));
    return formatDate(dt);
  },
  addMonth: (date, n) => {
    const dt = parseDate(toStr(date));
    if (!dt) return "";
    dt.setMonth(dt.getMonth() + Math.trunc(toNum(n)));
    return formatDate(dt);
  },
  addYear: (date, n) => {
    const dt = parseDate(toStr(date));
    if (!dt) return "";
    dt.setFullYear(dt.getFullYear() + Math.trunc(toNum(n)));
    return formatDate(dt);
  },
  addMinutes: (time, n) => {
    const t = parseTime(toStr(time));
    if (!t) return "";
    const total = t.h * 60 + t.m + Math.trunc(toNum(n));
    return formatTime(Math.floor(total / 60), total % 60);
  },
  // Returns the date string for the next occurrence of `weekday` (1=Mon … 7=Sun).
  // If `b` is true and today already matches, returns today.
  weekday_date: (weekday, b) => {
    const target = Math.trunc(toNum(weekday));
    if (target < 1 || target > 7) return "";
    const dt = new Date();
    dt.setHours(0, 0, 0, 0);
    // Convert JS day (0=Sun) to SaleBot day (1=Mon … 7=Sun).
    const today = ((dt.getDay() + 6) % 7) + 1;
    let diff = target - today;
    if (diff < 0) diff += 7;
    if (diff === 0 && !b) diff = 7;
    dt.setDate(dt.getDate() + diff);
    return formatDate(dt);
  },
  month_date: (day, b) => {
    const target = Math.trunc(toNum(day));
    if (target < 1 || target > 31) return "";
    const dt = new Date();
    dt.setHours(0, 0, 0, 0);
    const sameMonth = new Date(dt.getFullYear(), dt.getMonth(), target);
    if (sameMonth.getMonth() !== dt.getMonth()) {
      // target overflows current month — fall back to last day of month
      sameMonth.setDate(0);
    }
    if (sameMonth >= dt || (b && sameMonth.getTime() === dt.getTime())) {
      return formatDate(sameMonth);
    }
    const next = new Date(dt.getFullYear(), dt.getMonth() + 1, target);
    if (next.getMonth() !== (dt.getMonth() + 1) % 12) next.setDate(0);
    return formatDate(next);
  },
  // True if NOW (in local tz of the Node process) is within [start, end].
  // start/end can be HH:MM (interpreted as today's interval) or full
  // dd.mm.yyyy HH:MM. Intervals that cross midnight are handled.
  time_interval: (start, end) => {
    const now = new Date();
    const parseEither = (s: string): Date | null => {
      const full = parseDate(s);
      if (full) return full;
      const t = parseTime(s);
      if (t) {
        const dt = new Date(now);
        dt.setHours(t.h, t.m, t.s ?? 0, 0);
        return dt;
      }
      return null;
    };
    const a = parseEither(toStr(start));
    const b = parseEither(toStr(end));
    if (!a || !b) return false;
    if (b.getTime() < a.getTime()) {
      // crosses midnight: now in [a, end-of-day] or [start-of-day, b]
      const midnightAfter = new Date(a);
      midnightAfter.setHours(23, 59, 59, 999);
      const midnightBefore = new Date(b);
      midnightBefore.setHours(0, 0, 0, 0);
      return (
        (now.getTime() >= a.getTime() && now.getTime() <= midnightAfter.getTime()) ||
        (now.getTime() >= midnightBefore.getTime() && now.getTime() <= b.getTime())
      );
    }
    return now.getTime() >= a.getTime() && now.getTime() <= b.getTime();
  },
  current_date_rus: (offset) => {
    const dt = new Date();
    if (offset != null) dt.setDate(dt.getDate() + Math.trunc(toNum(offset)));
    return `${dt.getDate()} ${RU_MONTHS[dt.getMonth()]}`;
  },
  date_rus: (date, offset) => {
    const dt = parseDate(toStr(date));
    if (!dt) return "";
    if (offset != null) dt.setDate(dt.getDate() + Math.trunc(toNum(offset)));
    return `${dt.getDate()} ${RU_MONTHS[dt.getMonth()]}`;
  },
  get_datetime: (format) => strftime(new Date(), toStr(format ?? "%d.%m.%Y %H:%M")),
  // Next birthday: feed in a dd.mm.yyyy DOB, get the next anniversary.
  birthdate: (dob) => {
    const dt = parseDate(toStr(dob));
    if (!dt) return "";
    const now = new Date();
    const next = new Date(now.getFullYear(), dt.getMonth(), dt.getDate());
    if (next < now) next.setFullYear(now.getFullYear() + 1);
    return formatDate(next);
  },

  // ---- Lists/arrays -------------------------------------------------
  in_array: (arr, v) => Array.isArray(arr) && arr.some((x) => x === v || String(x) === String(v)),
  arr_len: (arr) => {
    if (Array.isArray(arr)) return arr.length;
    if (arr && typeof arr === "object") return Object.keys(arr).length;
    return -1;
  },
  index: (arr, v) =>
    Array.isArray(arr)
      ? arr.findIndex((x) => x === v || String(x) === String(v))
      : -1,
  sum_array: (arr) =>
    Array.isArray(arr) ? arr.reduce((acc: number, x) => acc + toNum(x), 0) : 0,
  array_slice: (arr, start, end) =>
    Array.isArray(arr)
      ? arr.slice(
          start == null ? 0 : Math.trunc(toNum(start)),
          end == null ? arr.length : Math.trunc(toNum(end))
        )
      : [],
  remove_duplicates: (arr) =>
    Array.isArray(arr) ? Array.from(new Set(arr)) : [],
  select_random_from_list: (arr) =>
    Array.isArray(arr) && arr.length > 0
      ? arr[Math.floor(Math.random() * arr.length)]
      : null,

  // ---- Logic helper (matches SaleBot's `if` for inline ternary) -----
  if: (cond, yes, no) => (cond ? yes : no),
};

export type FunctionRegistry = typeof FUNCTIONS;

// Used by UI autocomplete: human-readable signatures for the picker.
export const FUNCTION_SIGNATURES: Array<{
  name: string;
  signature: string;
  category: "date" | "string" | "math" | "regex" | "list" | "logic";
  doc: string;
}> = [
  // math
  { name: "abs", signature: "abs(n)", category: "math", doc: "Абсолютное значение" },
  { name: "ceil", signature: "ceil(n)", category: "math", doc: "Округление вверх" },
  { name: "floor", signature: "floor(n)", category: "math", doc: "Округление вниз" },
  { name: "round", signature: "round(n, digits?)", category: "math", doc: "Математическое округление" },
  { name: "max", signature: "max(a, b, ...)", category: "math", doc: "Максимум из чисел" },
  { name: "min", signature: "min(a, b, ...)", category: "math", doc: "Минимум из чисел" },
  { name: "random", signature: "random(low, high)", category: "math", doc: "Случайное целое в [low, high]" },
  { name: "pow", signature: "pow(n, p)", category: "math", doc: "n в степени p" },
  { name: "sqrt", signature: "sqrt(n)", category: "math", doc: "Квадратный корень" },
  { name: "int", signature: "int(n)", category: "math", doc: "Целая часть числа" },
  { name: "is_int", signature: "is_int(v)", category: "math", doc: "Является ли значение целым числом" },
  { name: "is_float", signature: "is_float(v)", category: "math", doc: "Является ли значение числом" },
  // string
  { name: "len", signature: "len(s)", category: "string", doc: "Длина строки/массива" },
  { name: "lower", signature: "lower(s)", category: "string", doc: "В нижний регистр" },
  { name: "upper", signature: "upper(s)", category: "string", doc: "В верхний регистр" },
  { name: "strip", signature: "strip(s)", category: "string", doc: "Убрать пробелы по краям" },
  { name: "capitalize", signature: "capitalize(s)", category: "string", doc: "Первая буква заглавная" },
  { name: "title", signature: "title(s)", category: "string", doc: "Каждое слово с заглавной" },
  { name: "substring", signature: "substring(s, n1, n2?)", category: "string", doc: "Подстрока. n2<0 — обрезка с конца" },
  { name: "contains", signature: "contains(s, sub, caseSensitive?)", category: "string", doc: "Содержит ли подстроку" },
  { name: "startswith", signature: "startswith(s, sub)", category: "string", doc: "Начинается ли с подстроки" },
  { name: "endswith", signature: "endswith(s, sub)", category: "string", doc: "Заканчивается ли подстрокой" },
  { name: "splitter", signature: "splitter(s, sep, max?)", category: "string", doc: "Разделение на массив" },
  { name: "replace", signature: "replace(s, from, to, n?)", category: "string", doc: "Замена подстроки" },
  { name: "normalizePhone", signature: "normalizePhone(s)", category: "string", doc: "Нормализация телефона (8→7)" },
  { name: "urlencode", signature: "urlencode(s)", category: "string", doc: "URL-кодирование" },
  { name: "urldecode", signature: "urldecode(s)", category: "string", doc: "URL-декодирование" },
  { name: "tg_escape", signature: "tg_escape(s)", category: "string", doc: "Экранирование для Telegram MarkdownV2" },
  // regex
  { name: "findall", signature: "findall(pattern, str, index?)", category: "regex", doc: "Все совпадения или i-е" },
  { name: "similar", signature: "similar(a, b)", category: "regex", doc: "Нечёткое сравнение (<30% разницы)" },
  // dates
  { name: "addDays", signature: "addDays(date, n)", category: "date", doc: "Прибавить n дней. n может быть отрицательным" },
  { name: "addMonth", signature: "addMonth(date, n)", category: "date", doc: "Прибавить n месяцев" },
  { name: "addYear", signature: "addYear(date, n)", category: "date", doc: "Прибавить n лет" },
  { name: "addMinutes", signature: "addMinutes(time, n)", category: "date", doc: "Прибавить n минут к HH:MM" },
  { name: "weekday_date", signature: "weekday_date(weekday, includeToday?)", category: "date", doc: "Дата следующего дня недели (1=Пн … 7=Вс)" },
  { name: "month_date", signature: "month_date(day, includeToday?)", category: "date", doc: "Дата ближайшего N-го числа месяца" },
  { name: "time_interval", signature: "time_interval(start, end)", category: "date", doc: "Сейчас в интервале (поддерживает переход через полночь)" },
  { name: "current_date_rus", signature: "current_date_rus(offset?)", category: "date", doc: "«13 мая» с опц. сдвигом дней" },
  { name: "date_rus", signature: "date_rus(date, offset?)", category: "date", doc: "Любая дата как «13 мая»" },
  { name: "get_datetime", signature: "get_datetime(format?)", category: "date", doc: "Сейчас в strftime-формате" },
  { name: "birthdate", signature: "birthdate(dob)", category: "date", doc: "Дата ближайшего дня рождения" },
  // lists
  { name: "in_array", signature: "in_array(arr, v)", category: "list", doc: "Есть ли элемент в массиве" },
  { name: "arr_len", signature: "arr_len(arr)", category: "list", doc: "Длина массива/словаря" },
  { name: "sum_array", signature: "sum_array(arr)", category: "list", doc: "Сумма элементов" },
  { name: "array_slice", signature: "array_slice(arr, start, end?)", category: "list", doc: "Срез массива" },
  { name: "remove_duplicates", signature: "remove_duplicates(arr)", category: "list", doc: "Уникальные элементы" },
  { name: "select_random_from_list", signature: "select_random_from_list(arr)", category: "list", doc: "Случайный элемент" },
  // logic
  { name: "if", signature: "if(cond, yes, no)", category: "logic", doc: "Тернарный if" },
];
