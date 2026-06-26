/**
 * Минималистичный CSV-парсер и сериализатор для маркетинговых импорта/экспорта.
 *
 * Поддерживает:
 *  - запятая или точка с запятой как разделитель (auto-detect по первой строке)
 *  - двойные кавычки вокруг ячеек с запятыми/переносами/кавычками внутри
 *  - удвоенные кавычки внутри кавычек: `""` → `"`
 *  - BOM в начале файла (Excel любит его добавлять)
 *  - \r\n и \n переводы строк
 *
 * Не поддерживает (намеренно — не нужно для маркетинговых импортов):
 *  - кастомные quote chars (только `"`)
 *  - streaming (импорт до 100К строк помещается в память)
 *  - parallel parsing
 *
 * Если столкнёмся с edge case'ом — заменим на papaparse (это будет
 * безболезненная замена, parseCsv возвращает тот же формат).
 */

export interface CsvParseResult {
  headers: string[];
  rows: Array<Record<string, string>>;
  errors: Array<{ line: number; message: string }>;
}

/** Удаляет BOM (U+FEFF) если он есть в начале строки. */
function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

/** Определяет разделитель по первой строке: запятая или точка с запятой. */
function detectDelimiter(firstLine: string): "," | ";" {
  const commas = (firstLine.match(/,/g) || []).length;
  const semicolons = (firstLine.match(/;/g) || []).length;
  return semicolons > commas ? ";" : ",";
}

/**
 * Парсит одну CSV-строку в массив ячеек, учитывая экранирование двойными кавычками.
 * Возвращает null если строка незакрыта (продолжается на следующей).
 */
function parseRow(input: string, delim: string): string[] | null {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 2;
        continue;
      }
      if (ch === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    if (ch === '"' && cell === "") {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === delim) {
      cells.push(cell);
      cell = "";
      i++;
      continue;
    }

    cell += ch;
    i++;
  }

  if (inQuotes) return null; // строка продолжается на следующей физической строке
  cells.push(cell);
  return cells;
}

export function parseCsv(content: string): CsvParseResult {
  const cleaned = stripBom(content).replace(/\r\n/g, "\n");
  const physicalLines = cleaned.split("\n");

  // Склеиваем «логические» строки, если кавычки не закрылись.
  const logicalLines: string[] = [];
  let buffer = "";
  for (const line of physicalLines) {
    buffer = buffer ? buffer + "\n" + line : line;
    const odd = (buffer.match(/"/g) || []).length % 2 === 1;
    if (odd) continue;
    logicalLines.push(buffer);
    buffer = "";
  }
  if (buffer) logicalLines.push(buffer);

  // Убираем хвостовые пустые строки.
  while (logicalLines.length > 0 && logicalLines[logicalLines.length - 1].trim() === "") {
    logicalLines.pop();
  }

  if (logicalLines.length === 0) {
    return { headers: [], rows: [], errors: [] };
  }

  const delim = detectDelimiter(logicalLines[0]);
  const headerCells = parseRow(logicalLines[0], delim);
  if (!headerCells) {
    return {
      headers: [],
      rows: [],
      errors: [{ line: 1, message: "Не удалось распарсить заголовок CSV" }],
    };
  }
  const headers = headerCells.map((h) => h.trim());

  const rows: Array<Record<string, string>> = [];
  const errors: CsvParseResult["errors"] = [];

  for (let i = 1; i < logicalLines.length; i++) {
    const lineNumber = i + 1;
    const cells = parseRow(logicalLines[i], delim);
    if (!cells) {
      errors.push({ line: lineNumber, message: "Незакрытая кавычка" });
      continue;
    }
    if (cells.length !== headers.length) {
      errors.push({
        line: lineNumber,
        message: `Ожидалось ${headers.length} ячеек, получено ${cells.length}`,
      });
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx].trim();
    });
    rows.push(row);
  }

  return { headers, rows, errors };
}

/**
 * Экранирует одну ячейку для CSV.
 *
 * Защита от formula injection: Excel/LibreOffice/Numbers при открытии CSV
 * выполняют формулы в ячейках начинающихся с `= + - @ \t \r`. Если в БД
 * лежит fullName="=cmd|'/c calc.exe'!A1" — открытие экспорта = RCE.
 * Префиксуем такие ячейки одинарной кавычкой — Excel её не показывает, но
 * формулу не выполняет.
 */
function escapeCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes(";")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Сериализует массив объектов в CSV. Колонки задаются явно для контроля
 * порядка и человекочитаемых заголовков.
 */
export function serializeCsv(
  rows: Array<Record<string, unknown>>,
  columns: Array<{ key: string; header: string }>
): string {
  const headerLine = columns.map((c) => escapeCell(c.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCell(row[c.key] as never)).join(",")
  );
  return [headerLine, ...dataLines].join("\n") + "\n";
}
