# Certification Answer Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Сохранить новые ответы о доходе под историческими ключами и корректно читать разделители тысяч в аналитике сертификации.

**Architecture:** Чистый модуль совместимости формирует `_answers` по правилу `storageKey ?? text` и извлекает доходы из сохранённых строк. React-компонент и API аналитики используют эти функции, поэтому поведение проверяется unit-тестами без моков UI или базы данных.

**Tech Stack:** TypeScript, React/Next.js, Vitest.

## Global Constraints

- JSON-контракт `HomeworkSubmission.content` остаётся `{ _answers, _test_score, _test_total }`.
- Для `income_point_a` и `income_point_b` новые записи используют прежние полные тексты вопросов как ключи.
- Пробелы, неразрывные пробелы и запятые в доходе являются разделителями тысяч.
- Существующие исторические записи и схема базы данных не изменяются.

---

### Task 1: Чистые функции совместимости

**Files:**
- Create: `lib/certification-answer-compatibility.ts`
- Create: `lib/certification-answer-compatibility.test.ts`

**Interfaces:**
- Produces: `formatCertificationAnswers(questions, answers): Record<string, string>`
- Produces: `parseCertificationIncome(raw): number | null`
- Produces: `extractCertificationIncomePoints(answers): { pointA: number | null; pointB: number | null }`

- [ ] **Step 1: Write failing tests for stable keys and income parsing**

```ts
expect(formatCertificationAnswers(
  [
    { id: "income", text: "Короткий текст", storageKey: "Исторический текст" },
    { id: "city", text: "Город" },
  ],
  { income: "20,000", city: "Алматы" }
)).toEqual({ "Исторический текст": "20,000", "Город": "Алматы" });

expect(parseCertificationIncome("20,000")).toBe(20000);
expect(parseCertificationIncome("20 000")).toBe(20000);
expect(parseCertificationIncome("20\u00a0000")).toBe(20000);
expect(extractCertificationIncomePoints({
  'Ваш доход в точке А? С каким уровнем дохода в месяц вы пришли на программу "Прорыв"?': "20,000",
  "Точка Б: Ваш доход за последний месяц в рублях?": "40 000",
})).toEqual({ pointA: 20000, pointB: 40000 });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run lib/certification-answer-compatibility.test.ts`

Expected: FAIL because the compatibility module does not exist.

- [ ] **Step 3: Implement the minimal pure module**

```ts
export interface CertificationAnswerQuestion {
  id: string;
  text: string;
  storageKey?: string;
}

export function formatCertificationAnswers(
  questions: CertificationAnswerQuestion[],
  answers: Record<string, string | string[] | undefined>
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
```

Implement `parseCertificationIncome` by removing all non-digit characters and returning a positive finite number or `null`. Implement `extractCertificationIncomePoints` with the existing case-insensitive substrings `в точке а`/`точке а?` and `точка б`/`точке б`.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx vitest run lib/certification-answer-compatibility.test.ts`

Expected: all tests PASS.

### Task 2: Подключение к форме и аналитике

**Files:**
- Modify: `components/learn/certification-form-viewer.tsx:18-115,799-817`
- Modify: `app/api/admin/analytics/surveys/route.ts:1-190,453-464`

**Interfaces:**
- Consumes: `formatCertificationAnswers`
- Consumes: `extractCertificationIncomePoints`

- [ ] **Step 1: Add stable storage keys to the two income questions**

Add `storageKey?: string` to `Question`. Set it to the exact pre-change long question text for `income_point_a` and `income_point_b`.

- [ ] **Step 2: Replace inline formatting with the tested formatter**

```ts
const formatted = formatCertificationAnswers(
  [...PART1_QUESTIONS, ...PART2_QUESTIONS],
  answers
);
formatted["Тестирование: правильных ответов"] = `${correctCount} из ${total}`;
```

- [ ] **Step 3: Replace route-local income parsing with the tested extractor**

Import `extractCertificationIncomePoints`, remove the route-local `parseIncome` and `extractPoints`, and call the shared function when building certification analytics.

- [ ] **Step 4: Run focused regression tests**

Run: `npx vitest run lib/certification-answer-compatibility.test.ts lib/certification-form-validation.test.ts`

Expected: all tests PASS.

### Task 3: Полная локальная проверка

**Files:**
- Verify only; no planned production edits.

**Interfaces:**
- Consumes the completed implementation from Tasks 1-2.

- [ ] **Step 1: Run TypeScript validation**

Run: `npm run type-check`

Expected: exit code 0.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git diff --stat && git status --short`

Expected: no whitespace errors; only the compatibility implementation, tests, and plan are part of this task. Existing unrelated user changes remain untouched.

- [ ] **Step 4: Commit the implementation**

```bash
git add lib/certification-answer-compatibility.ts \
  lib/certification-answer-compatibility.test.ts \
  components/learn/certification-form-viewer.tsx \
  app/api/admin/analytics/surveys/route.ts \
  docs/superpowers/plans/2026-08-10-certification-answer-compatibility.md
git commit -m "fix: preserve certification answer compatibility"
```
