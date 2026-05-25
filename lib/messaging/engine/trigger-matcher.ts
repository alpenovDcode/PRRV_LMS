/**
 * lib/messaging/engine/trigger-matcher.ts
 *
 * Сопоставление текста с keywords триггера.
 *
 * Поддерживает match-типы: exact, contains, regex, starts_with.
 * Case-insensitive по умолчанию.
 */

export interface MatchInput {
  text: string;
  keywords: string[];
  matchType: string;
  caseSensitive: boolean;
}

export function matchesTrigger(input: MatchInput): boolean {
  // Пустые keywords = триггер срабатывает на любое сообщение этого типа
  if (input.keywords.length === 0) return true;

  const haystack = input.caseSensitive ? input.text : input.text.toLowerCase();

  for (const kw of input.keywords) {
    const needle = input.caseSensitive ? kw : kw.toLowerCase();

    switch (input.matchType) {
      case "exact":
        if (haystack === needle) return true;
        break;
      case "starts_with":
        if (haystack.startsWith(needle)) return true;
        break;
      case "regex":
        try {
          const re = new RegExp(kw, input.caseSensitive ? "" : "i");
          if (re.test(input.text)) return true;
        } catch {
          // битый regex — игнорим
        }
        break;
      case "contains":
      default:
        if (haystack.includes(needle)) return true;
        break;
    }
  }
  return false;
}
