# Certification Form Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept human-friendly integer and range formats in the certification questionnaire and show precise inline errors, hints, limits, and navigation to the first invalid answer.

**Architecture:** Keep parsing and validation in a pure, React-independent module covered by Vitest. Add validation metadata and presentation state to the existing certification viewer without changing the API payload or database. Verify the UI against the real local Next.js preview in a browser.

**Tech Stack:** TypeScript, React, Next.js, Vitest, Tailwind CSS, Sonner, local browser automation.

## Global Constraints

- Single-number fields accept non-negative whole numbers with spaces, non-breaking spaces, or commas as thousands separators.
- Range fields additionally accept `-`, `–`, or `—`, and the left boundary must not exceed the right boundary.
- Numeric answers are limited to 40 characters, short text to 200, and textarea answers to 4000.
- Values are never silently truncated or erased; validation reports the problem under the field.
- Existing API payload shape and database schema remain unchanged.
- Unrelated dirty files and the nine known baseline test failures must not be modified.

---

### Task 1: Pure certification answer validation

**Files:**

- Create: `lib/certification-form-validation.ts`
- Create: `lib/certification-form-validation.test.ts`

**Interfaces:**

- Produces: `NumericAnswerRule = "single_integer" | "integer_or_range"`.
- Produces: `CERTIFICATION_LIMITS = { numeric: 40, text: 200, textarea: 4000 }`.
- Produces: `validateNumericAnswer(value: string, rule: NumericAnswerRule): string | undefined`.
- Produces: `validateCertificationAnswer(input: CertificationAnswerValidationInput): string | undefined`.
- Produces: `shouldShowCharacterCount(length: number, limit: number): boolean`.

- [ ] **Step 1: Write failing parser tests**

Cover `1300`, `1 300`, `1,300`, NBSP/narrow-NBSP grouping, all three dash variants, grouped range boundaries, zero, reverse ranges, negatives, decimals, letters, incomplete/multiple ranges, and values longer than 40 characters. Assert localized error strings for invalid cases.

- [ ] **Step 2: Run the new test file and verify RED**

Run: `npx vitest run lib/certification-form-validation.test.ts`

Expected: FAIL because `@/lib/certification-form-validation` does not exist.

- [ ] **Step 3: Implement minimal pure validation**

Use an integer-token grammar that accepts either plain digits or groups of three separated by spaces/commas. Compare range boundaries with `BigInt` after removing separators. Return errors in this priority order: length, required, malformed value, reversed range.

- [ ] **Step 4: Run the parser tests and verify GREEN**

Run: `npx vitest run lib/certification-form-validation.test.ts`

Expected: all new tests pass with zero warnings from the test file.

---

### Task 2: Integrate field metadata and inline feedback

**Files:**

- Modify: `components/learn/certification-form-viewer.tsx`
- Test: `lib/certification-form-validation.test.ts`

**Interfaces:**

- Consumes: all exports from `lib/certification-form-validation.ts`.
- Adds to `Question`: optional `numericRule` and `helper` metadata.
- Produces local `getQuestionError(question)` and stable DOM ids `question-<id>`, `question-<id>-input`, `question-<id>-help`, and `question-<id>-error`.

- [ ] **Step 1: Add failing aggregate-answer tests**

Assert that required blank strings/arrays fail, whitespace-only text fails, optional blanks pass, text and textarea limits fail only after their exact limits, numeric answers use their assigned rule, and character counts appear from 80% of a limit.

- [ ] **Step 2: Run the test file and verify RED**

Run: `npx vitest run lib/certification-form-validation.test.ts`

Expected: FAIL because aggregate validation and count-threshold behavior are not yet implemented.

- [ ] **Step 3: Add question validation metadata**

Assign `single_integer` to age and both income questions. Assign `integer_or_range` to both hourly-price, both student-count, and both weekly-hours questions. Add examples matching each rule. Apply default 200/4000 limits by text control type.

- [ ] **Step 4: Replace browser-owned number validation**

Render numeric questions with `type="text"` and `inputMode="numeric"`; keep the raw value in React state. Add `touchedQuestions` and `hasAttemptedContinue` state. Mark text/numeric fields touched on blur and update visible errors live after they are touched.

- [ ] **Step 5: Render accessible hints, counters, and errors**

Show numeric help permanently. Show a counter at 80% of the applicable limit and red styling after overflow. Set `aria-invalid` and `aria-describedby` on controls, render inline error text, and apply a red border/background to the invalid question container.

- [ ] **Step 6: Navigate to the first error**

On continue, compute all question errors. If any exist, expose them, show a toast with the number of fields, then `scrollIntoView({ behavior: "smooth", block: "center" })` and focus the first input/radio/checkbox without changing answers. Preserve the existing transition when there are no errors.

- [ ] **Step 7: Run targeted tests and TypeScript**

Run: `npx vitest run lib/certification-form-validation.test.ts`

Run: `npm run type-check`

Expected: both exit 0.

---

### Task 3: Regression and local browser verification

**Files:**

- Verify: `components/learn/certification-form-viewer.tsx`
- Verify: `lib/certification-form-validation.ts`
- Verify: `lib/certification-form-validation.test.ts`

**Interfaces:**

- Consumes the final UI and validation behavior from Tasks 1–2.
- Produces verification evidence only; no production interface.

- [ ] **Step 1: Run focused and full automated checks**

Run: `npx vitest run lib/certification-form-validation.test.ts`

Run: `npm run type-check`

Run: `npm test -- --run`

Expected: focused tests and type-check pass. Full Vitest has no failures beyond the recorded baseline of 9 tests plus 2 Playwright suites collected by Vitest.

- [ ] **Step 2: Start the local application**

Run: `npm run dev` and wait for the local Next.js server to respond.

- [ ] **Step 3: Verify the real form in the local browser**

Open an authenticated admin or curator lesson preview containing `certification_form`. Verify:

1. `1000–1300` remains visible and has no inline format error in a range-enabled field.
2. The same range in age/income shows «Укажите одно целое число».
3. Letters, decimals, negatives, malformed and reversed ranges show their inline errors.
4. A 41-character numeric answer and over-limit text show a red counter/error without truncation.
5. Continuing with errors scrolls/focuses the first invalid field and reports the number of invalid fields.
6. Correcting all invalid entries removes errors and permits the transition to testing.

- [ ] **Step 4: Inspect runtime and repository state**

Check browser console logs for new errors, run `git diff --check`, inspect `git diff`, and confirm unrelated pre-existing dirty files are unchanged.

- [ ] **Step 5: Commit only the feature files**

Stage only the plan, validation module/test, and certification viewer. Commit with `fix: validate certification form answers` after all scoped checks pass.
