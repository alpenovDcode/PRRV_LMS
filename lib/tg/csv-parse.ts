// Минималистичный CSV-парсер для импорта подписчиков. Поддерживает:
//   • запятую и точку с запятой как разделитель (auto-detect по заголовку)
//   • двойные кавычки для строк с разделителем внутри
//   • экранирование "" -> " внутри quoted-строки
//   • CRLF/LF переводы строк
//
// Возвращает массив объектов { [header]: value }. Если строка содержит
// больше/меньше колонок, остальные ключи отсутствуют (а лишние игнорятся).
//
// Не пытаемся быть совместимыми с RFC 4180 во всех экзотических случаях —
// для импорта tg-подписчиков этого достаточно.

export interface CsvParseResult {
  headers: string[];
  rows: Array<Record<string, string>>;
  delimiter: "," | ";";
}

export function parseCsv(text: string): CsvParseResult {
  // Strip UTF-8 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  // Auto-detect delimiter by counting in the first line (only outside quotes).
  const firstLineEnd = findUnquotedLineEnd(text, 0);
  const head = firstLineEnd > 0 ? text.slice(0, firstLineEnd) : text;
  let commaCount = 0,
    semiCount = 0,
    inQ = false;
  for (const c of head) {
    if (c === '"') inQ = !inQ;
    else if (!inQ && c === ",") commaCount++;
    else if (!inQ && c === ";") semiCount++;
  }
  const delimiter: "," | ";" = semiCount > commaCount ? ";" : ",";

  const rows: string[][] = [];
  let i = 0;
  while (i < text.length) {
    const { fields, next } = parseLine(text, i, delimiter);
    rows.push(fields);
    i = next;
  }
  // Drop trailing fully-empty row (file ending with \n)
  while (rows.length > 0) {
    const r = rows[rows.length - 1];
    if (r.length === 0 || r.every((s) => s === "")) rows.pop();
    else break;
  }

  if (rows.length === 0) return { headers: [], rows: [], delimiter };
  const headers = rows[0].map((h) => h.trim());
  const dataRows: Array<Record<string, string>> = [];
  for (let r = 1; r < rows.length; r++) {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (rows[r][idx] ?? "").trim();
    });
    dataRows.push(obj);
  }
  return { headers, rows: dataRows, delimiter };
}

function findUnquotedLineEnd(text: string, start: number): number {
  let inQ = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      // RFC 4180: doubled-quote inside quoted field
      if (inQ && text[i + 1] === '"') {
        i++;
        continue;
      }
      inQ = !inQ;
    } else if (!inQ && (c === "\n" || c === "\r")) {
      return i;
    }
  }
  return text.length;
}

function parseLine(
  text: string,
  start: number,
  delimiter: string
): { fields: string[]; next: number } {
  const fields: string[] = [];
  let i = start;
  let buf = "";
  let inQ = false;
  while (i < text.length) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          buf += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      buf += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQ = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      fields.push(buf);
      buf = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      if (text[i] === "\n") i++;
      fields.push(buf);
      return { fields, next: i };
    }
    if (c === "\n") {
      i++;
      fields.push(buf);
      return { fields, next: i };
    }
    buf += c;
    i++;
  }
  fields.push(buf);
  return { fields, next: i };
}
