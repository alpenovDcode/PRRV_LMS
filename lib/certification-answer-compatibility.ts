export interface CertificationAnswerQuestion {
  id: string;
  text: string;
  storageKey?: string;
}

export type CertificationAnswerValue = string | string[] | undefined;

export function formatCertificationAnswers(
  questions: readonly CertificationAnswerQuestion[],
  answers: Record<string, CertificationAnswerValue>
): Record<string, string> {
  const formatted: Record<string, string> = {};

  for (const question of questions) {
    const value = answers[question.id];
    if (value === undefined) continue;

    formatted[question.storageKey ?? question.text] = Array.isArray(value)
      ? value.join(", ")
      : String(value);
  }

  return formatted;
}

export function parseCertificationIncome(raw: string | undefined | null): number | null {
  if (!raw) return null;

  const digits = String(raw).replace(/[^\d]/g, "");
  if (!digits) return null;

  const income = Number(digits);
  return Number.isFinite(income) && income > 0 ? income : null;
}

export function extractCertificationIncomePoints(answers: Record<string, string>): {
  pointA: number | null;
  pointB: number | null;
} {
  let pointA: number | null = null;
  let pointB: number | null = null;

  for (const [question, value] of Object.entries(answers)) {
    const normalizedQuestion = question.toLowerCase();
    if (
      pointA === null &&
      (normalizedQuestion.includes("в точке а") || normalizedQuestion.includes("точке а?"))
    ) {
      pointA = parseCertificationIncome(value);
    } else if (
      pointB === null &&
      (normalizedQuestion.includes("точка б") || normalizedQuestion.includes("точке б"))
    ) {
      pointB = parseCertificationIncome(value);
    }
  }

  return { pointA, pointB };
}
