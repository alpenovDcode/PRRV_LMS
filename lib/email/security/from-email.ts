/**
 * Валидация адреса отправителя (fromEmail) в кампаниях.
 *
 * Защита: маркетолог через UI/API мог бы задать fromEmail="ceo@google.com" —
 * Yandex/Unisender пропустят, но получатели увидят подмену + bounce-feedback
 * забьёт нашу suppression list. Whitelist разрешённых доменов в env.
 *
 * EMAIL_ALLOWED_FROM_DOMAINS — comma-separated (prrv.tech,mail.prrv.tech).
 * Если переменная не задана — fallback на домен из EMAIL_MARKETING_FROM_EMAIL
 * (т.е. валидно только наше дефолтное). Полностью пустой whitelist разрешает
 * любой адрес — это поведение для dev, в проде задавай явно.
 */

export interface FromEmailValidation {
  ok: boolean;
  reason?: string;
}

function getAllowedDomains(): string[] {
  const fromEnv = process.env.EMAIL_ALLOWED_FROM_DOMAINS;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  }
  // Fallback: разрешаем только домен дефолтного отправителя.
  const defaultFrom = process.env.EMAIL_MARKETING_FROM_EMAIL;
  if (defaultFrom && defaultFrom.includes("@")) {
    return [defaultFrom.split("@")[1].toLowerCase()];
  }
  return [];
}

export function validateFromEmail(fromEmail: string): FromEmailValidation {
  const trimmed = fromEmail.trim();
  if (!trimmed.includes("@")) {
    return { ok: false, reason: "Невалидный email" };
  }
  const domain = trimmed.split("@")[1]?.toLowerCase();
  if (!domain) return { ok: false, reason: "Невалидный домен в email" };

  const allowed = getAllowedDomains();
  if (allowed.length === 0) {
    // Whitelist пуст и нет дефолта — пропускаем (dev). В проде задавай env.
    return { ok: true };
  }
  if (!allowed.includes(domain)) {
    return {
      ok: false,
      reason: `Домен "${domain}" не в whitelist. Разрешены: ${allowed.join(", ")}. Настрой EMAIL_ALLOWED_FROM_DOMAINS.`,
    };
  }
  return { ok: true };
}
