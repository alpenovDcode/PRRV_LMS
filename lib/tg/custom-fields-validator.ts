// Type-aware validator for TgCustomField values.
// Used both server-side (when wait_reply saves into a `field.x` scope)
// and client-side (when an admin edits a subscriber's profile) so the
// same rules apply.

import type { TgCustomField } from "@prisma/client";

export interface FieldOption {
  value: string;
  label: string;
}

export interface ValidationResult {
  ok: boolean;
  // Coerced value to store. Numbers/booleans get the native runtime
  // type; everything else is normalised to string.
  value?: unknown;
  // Human-readable reason when ok=false.
  reason?: string;
}

const EMAIL_RE = /^[-\w.]+@([A-Za-z0-9][-A-Za-z0-9]+\.)+[A-Za-z]{2,10}$/;
const URL_RE = /^https?:\/\/[\w\-.]+(:[0-9]+)?(\/[^\s]*)?$/;
const DATE_RE = /^(0?[1-9]|[12]\d|3[01])[.\-/](0?[1-9]|1[012])[.\-/](19|20)\d\d$/;

function normalizePhone(raw: string): string | null {
  let s = raw.replace(/\D+/g, "");
  if (s.startsWith("8") && s.length === 11) s = "7" + s.slice(1);
  if (s.length < 10 || s.length > 15) return null;
  return s;
}

export function validateCustomFieldValue(
  field: Pick<TgCustomField, "type" | "options" | "validationRegex" | "isRequired" | "label">,
  raw: unknown,
): ValidationResult {
  // Empty handling — only fail if isRequired.
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) {
    return field.isRequired
      ? { ok: false, reason: `«${field.label}» обязательное поле` }
      : { ok: true, value: null };
  }

  const str = typeof raw === "string" ? raw.trim() : String(raw);

  // Type validation.
  switch (field.type) {
    case "text": {
      if (str.length > 4096)
        return { ok: false, reason: "Слишком длинный текст (макс 4096 символов)" };
      break;
    }
    case "number": {
      const n = parseFloat(str.replace(",", "."));
      if (!Number.isFinite(n))
        return { ok: false, reason: "Нужно ввести число" };
      // Custom validation regex applies to the string form below.
      return applyRegex(field, str, n);
    }
    case "boolean": {
      const v = str.toLowerCase();
      if (["true", "1", "yes", "да", "y"].includes(v))
        return { ok: true, value: true };
      if (["false", "0", "no", "нет", "n"].includes(v))
        return { ok: true, value: false };
      return { ok: false, reason: "Введите «да» или «нет»" };
    }
    case "date": {
      if (!DATE_RE.test(str))
        return {
          ok: false,
          reason: "Дата в формате дд.мм.гггг — например 13.05.2026",
        };
      break;
    }
    case "email": {
      if (!EMAIL_RE.test(str))
        return { ok: false, reason: "Неверный email" };
      break;
    }
    case "phone": {
      const norm = normalizePhone(str);
      if (!norm) return { ok: false, reason: "Неверный номер телефона" };
      return applyRegex(field, norm, norm);
    }
    case "url": {
      if (!URL_RE.test(str))
        return { ok: false, reason: "Введите URL вида https://…" };
      break;
    }
    case "select": {
      const opts = (field.options as FieldOption[] | null) ?? [];
      const allowed = opts.map((o) => o.value);
      if (!allowed.includes(str))
        return {
          ok: false,
          reason: `Выберите один из: ${allowed.join(", ")}`,
        };
      break;
    }
    default:
      // Unknown type — pass through as string.
      break;
  }

  return applyRegex(field, str, str);
}

function applyRegex(
  field: Pick<TgCustomField, "validationRegex">,
  text: string,
  storedValue: unknown,
): ValidationResult {
  if (!field.validationRegex) return { ok: true, value: storedValue };
  try {
    const re = new RegExp(field.validationRegex);
    if (!re.test(text))
      return { ok: false, reason: "Не соответствует формату" };
  } catch {
    // Bad regex configured by admin — pass through rather than block.
  }
  return { ok: true, value: storedValue };
}
