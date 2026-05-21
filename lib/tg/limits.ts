// Telegram API лимиты. Здесь чтобы можно было импортировать и в схему,
// и в UI, не вшивая магические числа по 5 раз.
//
// Источник: https://core.telegram.org/bots/api
// Замеры — UTF-16 code units (так Telegram считает), не байты.

export const TG_LIMITS = {
  // Тело sendMessage. Превышение → 400 «message is too long».
  MESSAGE_TEXT: 4096,
  // caption в sendPhoto/sendVideo/etc — да, ровно в 4 раза меньше.
  MEDIA_CAPTION: 1024,
  // Текст одной inline-кнопки.
  BUTTON_TEXT: 64,
  // callback_data одной кнопки (по сути URL-safe identifier).
  BUTTON_CALLBACK_DATA: 64,
  // Inline keyboard — максимум кнопок (Telegram ограничивает рядов 8,
  // в ряду до 8 кнопок, но в сумме разумно <= 100).
  INLINE_KEYBOARD_BUTTONS: 100,
  // Текст ответной reply-клавиатуры — те же 64.
  REPLY_KEYBOARD_BUTTON: 64,
} as const;

// Возвращает «оценку загрузки» для прогресс-бара / окраски.
//   0 .. 0.9   — ok (зелёный)
//   0.9 .. 1.0 — warn (оранжевый)
//   > 1.0      — error (красный, не отправится)
export type LengthSeverity = "ok" | "warn" | "error";

export function lengthSeverity(used: number, limit: number): LengthSeverity {
  if (used > limit) return "error";
  if (used >= Math.floor(limit * 0.9)) return "warn";
  return "ok";
}

// Возвращает «фактическую» длину для Telegram: считаем UTF-16 code
// units, как сам Telegram. Эмодзи из астральных плоскостей идут как 2.
export function tgLen(s: string): number {
  // String.prototype.length в JS уже даёт UTF-16 длину — то что нам нужно.
  return s.length;
}
