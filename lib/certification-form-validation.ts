export type NumericAnswerRule = "single_integer" | "integer_or_range";

export const CERTIFICATION_LIMITS = {
  numeric: 40,
  text: 200,
  textarea: 4000,
} as const;

export type CertificationAnswerKind = "text" | "textarea" | "numeric" | "selection";

export interface CertificationAnswerValidationInput {
  value: string | string[] | undefined;
  required?: boolean;
  kind: CertificationAnswerKind;
  numericRule?: NumericAnswerRule;
}

const SINGLE_INTEGER_ERROR = "Укажите одно целое число, например 20000";
const INTEGER_OR_RANGE_ERROR = "Можно указать одно целое число или диапазон, например 1000–1300";
const INTEGER_TOKEN = /^(?:\d+|\d{1,3}(?:[ ,\u00a0\u202f]\d{3})+)$/;
const RANGE = /^(.+?)\s*[-–—]\s*(.+)$/;
const GROUP_SEPARATOR = /[ ,\u00a0\u202f]/g;

function parseIntegerToken(value: string): bigint | undefined {
  const trimmed = value.trim();
  if (!INTEGER_TOKEN.test(trimmed)) return undefined;
  return BigInt(trimmed.replace(GROUP_SEPARATOR, ""));
}

export function validateNumericAnswer(value: string, rule: NumericAnswerRule): string | undefined {
  if (value.length > CERTIFICATION_LIMITS.numeric) {
    return `Слишком длинный ответ: максимум ${CERTIFICATION_LIMITS.numeric} символов`;
  }

  const trimmed = value.trim();
  if (parseIntegerToken(trimmed) !== undefined) return undefined;

  if (rule === "single_integer") return SINGLE_INTEGER_ERROR;

  const range = trimmed.match(RANGE);
  if (!range) return INTEGER_OR_RANGE_ERROR;

  const start = parseIntegerToken(range[1]);
  const end = parseIntegerToken(range[2]);
  if (start === undefined || end === undefined) return INTEGER_OR_RANGE_ERROR;
  if (start > end) return "Начало диапазона не может быть больше конца";

  return undefined;
}

export function validateCertificationAnswer({
  value,
  required = false,
  kind,
  numericRule = "single_integer",
}: CertificationAnswerValidationInput): string | undefined {
  const isEmpty =
    value === undefined || (Array.isArray(value) ? value.length === 0 : value.trim() === "");

  if (isEmpty) return required ? "Это обязательный вопрос" : undefined;
  if (Array.isArray(value)) return undefined;

  if (kind === "numeric") return validateNumericAnswer(value, numericRule);

  const limit =
    kind === "textarea"
      ? CERTIFICATION_LIMITS.textarea
      : kind === "text"
        ? CERTIFICATION_LIMITS.text
        : undefined;
  if (limit !== undefined && value.length > limit) {
    return `Слишком длинный ответ: максимум ${limit} символов`;
  }

  return undefined;
}

export function shouldShowCharacterCount(length: number, limit: number): boolean {
  return length >= Math.ceil(limit * 0.8);
}
