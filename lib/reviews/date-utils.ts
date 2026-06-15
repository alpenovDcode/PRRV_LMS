/**
 * Безопасный парсер даты для скрапинга отзывов.
 *
 * Проблема: сайты часто отдают `datePublished` без таймзоны (например,
 * "2026-06-08T22:00:00" — это московское время). JS интерпретирует такую
 * строку как локальное время сервера (обычно UTC), потом форматирование
 * в часовом поясе пользователя (UTC+5 для Алматы) сдвигает дату на +1 день.
 *
 * Решение: выдёргиваем только YYYY-MM-DD и фиксируем полдень UTC.
 * Так дата остаётся той же в любой таймзоне в диапазоне UTC-11..UTC+11.
 */
export function parseReviewDate(raw: string | null | undefined): Date {
  if (!raw) return new Date();
  const match = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(Date.UTC(year, month, day, 12, 0, 0));
  }
  // Fallback на стандартный парсер
  const fallback = new Date(raw);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}
