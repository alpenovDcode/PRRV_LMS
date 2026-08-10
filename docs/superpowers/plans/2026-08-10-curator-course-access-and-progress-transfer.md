# Curator Course Access and Progress Transfer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give curators safe UI controls to revoke obsolete course access, preview and confirm progress transfer during group moves, and manually correct lesson progress without deleting historical work.

**Architecture:** Keep matching and merge rules in a pure `lib/progress-transfer.ts` module. Add a read-only preview route and extend the existing transactional group-transfer route with an explicit mapping and optional source-enrollment revocation. Reuse the existing enrollment and progress APIs from focused profile components, with server-side normalization for conflicting module access lists.

**Tech Stack:** Next.js 16 App Router, React 18, TypeScript, TanStack Query, Zod, Prisma/PostgreSQL, Vitest, Radix/shadcn UI, Sonner.

## Global Constraints

- New operations are available only to `ADMIN` and `CURATOR` roles and are always authorized server-side.
- Revoking a course removes only `Enrollment`; `LessonProgress` and `HomeworkSubmission` remain unchanged.
- Homework submissions are never copied between different lessons.
- Existing users and enrollments are not changed by migrations or background jobs.
- Transfer mappings are explicit, validated against the source and target courses, idempotent, and never reduce existing target progress.
- Ambiguous lesson matches are not selected automatically.
- Existing clients that omit the new transfer fields retain the previous behavior.
- Do not modify or stage unrelated working-tree files.

---

## File Structure

- Create `lib/progress-transfer.ts`: pure title normalization, lesson matching, mapping validation, and progress merge rules.
- Create `lib/progress-transfer.test.ts`: exhaustive unit coverage for exact, unique, ambiguous, duplicate, and non-regression cases.
- Modify `lib/validations.ts`: backward-compatible preview and transfer payload schemas.
- Create `app/api/admin/groups/[id]/members/transfer/preview/route.ts`: read-only preview endpoint.
- Create `app/api/admin/groups/[id]/members/transfer/preview/route.test.ts`: preview route authorization/data-shape regression coverage.
- Modify `app/api/admin/groups/[id]/members/transfer/route.ts`: transactional target enrollment, progress copy, and optional source enrollment revocation.
- Create `app/api/admin/groups/[id]/members/transfer/route.test.ts`: transaction behavior and mapping validation coverage.
- Create `app/admin/groups/[id]/_components/member-transfer-dialog.tsx`: focused curator workflow for target selection, checkboxes, mappings, and result.
- Modify `app/admin/groups/[id]/page.tsx`: use the transfer dialog and invalidate affected queries.
- Modify `app/api/admin/users/[id]/enrollments/route.ts`: make course revocation idempotent while preserving history.
- Modify `app/api/admin/enrollments/[id]/route.ts`: accept `forcedModules` and normalize conflicts.
- Modify `app/api/admin/users/[id]/route.ts`: include `forcedModules` in profile data.
- Modify `app/admin/users/[id]/_components/access-manager.tsx`: expose forced state and add confirmed full-course revocation.
- Modify `app/admin/users/[id]/page.tsx`: pass `userId` and refresh profile data after revocation.
- Modify `app/admin/users/[id]/_components/lesson-progress-manager.tsx`: expose completed/in-progress/reset actions.
- Create `tests/e2e/admin-course-access.spec.ts`: browser-level checks for the new curator controls using mocked API responses.

---

### Task 1: Pure lesson matching and progress merge rules

**Files:**
- Create: `lib/progress-transfer.ts`
- Create: `lib/progress-transfer.test.ts`

**Interfaces:**
- Produces: `buildProgressTransferPreview(sourceLessons, targetLessons): ProgressTransferPreview`
- Produces: `validateProgressMappings(mappings, sourceLessons, targetLessons): void`
- Produces: `mergeProgress(source, target): TransferProgressState`
- Produces: `buildProgressUpdateData(input, now): Partial<TransferProgressState>` for consistent manual status dates.
- Consumes: no database or framework dependencies.

- [ ] **Step 1: Write failing matching tests**

Create tests with concrete fixtures that verify exact module/title/type matching, unique title/type fallback, ambiguity rejection, and lower-confidence positional suggestions:

```ts
import { describe, expect, it } from "vitest";
import {
  buildProgressTransferPreview,
  mergeProgress,
  validateProgressMappings,
} from "./progress-transfer";

const source = {
  id: "source-lesson",
  title: "Урок «Старт»",
  type: "video",
  orderIndex: 0,
  module: { id: "source-module", title: "Модуль 1", orderIndex: 0 },
  progress: { status: "completed" as const, watchedTime: 120, completedAt: new Date("2026-08-01") },
};

it("preselects an exact normalized module/title/type match", () => {
  const preview = buildProgressTransferPreview(
    [source],
    [{ ...source, id: "target-lesson", module: { ...source.module, id: "target-module" }, progress: null }]
  );
  expect(preview.suggestions[0]).toMatchObject({
    sourceLessonId: "source-lesson",
    targetLessonId: "target-lesson",
    confidence: "exact",
    selected: true,
  });
});

it("does not preselect duplicate target titles", () => {
  const target = { ...source, id: "target-1", module: { ...source.module, id: "target-module" }, progress: null };
  const preview = buildProgressTransferPreview([source], [target, { ...target, id: "target-2" }]);
  expect(preview.suggestions[0].targetLessonId).toBeNull();
  expect(preview.suggestions[0].confidence).toBe("ambiguous");
});

it("never reduces existing target progress", () => {
  expect(
    mergeProgress(
      { status: "in_progress", watchedTime: 30, completedAt: null },
      { status: "completed", watchedTime: 90, completedAt: new Date("2026-07-01") }
    )
  ).toEqual({
    status: "completed",
    watchedTime: 90,
    completedAt: new Date("2026-07-01"),
  });
});

it("rejects reuse of the same target lesson", () => {
  expect(() =>
    validateProgressMappings(
      [
        { sourceLessonId: "source-1", targetLessonId: "target-1" },
        { sourceLessonId: "source-2", targetLessonId: "target-1" },
      ],
      [{ ...source, id: "source-1" }, { ...source, id: "source-2" }],
      [{ ...source, id: "target-1", progress: null }]
    )
  ).toThrow("Один новый урок нельзя использовать несколько раз");
});
```

- [ ] **Step 2: Run tests and verify the missing-module failure**

Run: `npm test -- --run lib/progress-transfer.test.ts`

Expected: FAIL because `./progress-transfer` does not exist.

- [ ] **Step 3: Implement the pure domain module**

Define these exact public types and functions:

```ts
export type TransferStatus = "not_started" | "in_progress" | "completed" | "failed";

export interface TransferProgressState {
  status: TransferStatus;
  watchedTime: number;
  completedAt: Date | null;
}

export interface TransferLesson {
  id: string;
  title: string;
  type: string;
  orderIndex: number;
  module: { id: string; title: string; orderIndex: number };
  progress: TransferProgressState | null;
}

export interface ProgressMapping {
  sourceLessonId: string;
  targetLessonId: string;
}

export interface ProgressTransferSuggestion {
  sourceLessonId: string;
  targetLessonId: string | null;
  confidence: "exact" | "unique_title" | "position" | "ambiguous" | "unmatched";
  selected: boolean;
}

export function normalizeTransferTitle(value: string): string {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/[«»„“”'\"`.,:;!?()[\]{}\\/|_—–-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
```

Implement matching in three passes. Only source lessons with non-null progress and a status other than `not_started` enter `suggestions`. Mark exact and unique-title matches as selected. Return positional matches with `selected: false`, and never consume a target candidate for ambiguous rows.

Implement `validateProgressMappings` using source/target ID sets and a duplicate-target set. Throw user-facing `Error` messages for foreign IDs and duplicate targets.

Implement `mergeProgress` with rank `{ not_started: 0, failed: 0, in_progress: 1, completed: 2 }`, maximum watched time, and the completed date belonging to the selected completed state.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- --run lib/progress-transfer.test.ts`

Expected: PASS for exact, fallback, ambiguity, validation, idempotency, and non-regression cases.

- [ ] **Step 5: Commit the domain layer**

```bash
git add lib/progress-transfer.ts lib/progress-transfer.test.ts
git commit -m "feat: add safe progress transfer rules"
```

---

### Task 2: Backward-compatible transfer schemas and preview API

**Files:**
- Modify: `lib/validations.ts:69-72`
- Create: `app/api/admin/groups/[id]/members/transfer/preview/route.ts`
- Create: `app/api/admin/groups/[id]/members/transfer/preview/route.test.ts`

**Interfaces:**
- Consumes: `buildProgressTransferPreview()` and `TransferLesson` from Task 1.
- Produces: `adminGroupTransferPreviewSchema` and extended `adminGroupTransferSchema`.
- Produces: `POST /api/admin/groups/:sourceGroupId/members/transfer/preview` response `{ sourceGroup, targetGroup, sourceCourse, targetCourse, suggestions, sourceLessons, targetLessons }`.

- [ ] **Step 1: Add failing schema and preview route tests**

Test that the old `{ userId, targetGroupId }` payload remains valid, the new fields accept a boolean and UUID pairs, and the preview route returns 404 for a missing source member. Mock `withAuth` so the provided callback runs with an admin user and mock only the Prisma methods called by the route.

```ts
expect(adminGroupTransferSchema.parse({ userId, targetGroupId })).toEqual({ userId, targetGroupId });
expect(
  adminGroupTransferSchema.parse({
    userId,
    targetGroupId,
    revokeSourceEnrollment: true,
    progressMappings: [{ sourceLessonId, targetLessonId }],
  })
).toMatchObject({ revokeSourceEnrollment: true });
```

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- --run 'lib/progress-transfer.test.ts' 'app/api/admin/groups/[id]/members/transfer/preview/route.test.ts'`

Expected: FAIL because preview schema/route are absent and the transfer schema rejects new fields after `.strict()` is added in the test expectation.

- [ ] **Step 3: Extend validation schemas**

Use shared UUID mapping validation and keep all new fields optional:

```ts
export const progressMappingSchema = z.object({
  sourceLessonId: z.string().uuid(),
  targetLessonId: z.string().uuid(),
});

export const adminGroupTransferPreviewSchema = z.object({
  userId: z.string().uuid(),
  targetGroupId: z.string().uuid(),
});

export const adminGroupTransferSchema = adminGroupTransferPreviewSchema.extend({
  revokeSourceEnrollment: z.boolean().optional(),
  progressMappings: z.array(progressMappingSchema).max(1000).optional(),
});
```

- [ ] **Step 4: Implement read-only preview route**

Load source membership and both groups, including `{ id, name, courseId, course: { id, title } }`. Reject same-group, missing-member, missing-group, same-course, and missing-course requests with specific 400/404 codes.

Load source and target lessons ordered by module and lesson position. Load source progress for the user and any existing target progress in two `findMany` calls. Adapt them to `TransferLesson[]`, call `buildProgressTransferPreview`, and return ISO date strings in JSON.

Wrap the complete read-only handler with `withAuth` and pass exactly
`{ roles: [UserRole.admin, UserRole.curator] }` as its authorization options.

- [ ] **Step 5: Run preview tests**

Run: `npm test -- --run 'app/api/admin/groups/[id]/members/transfer/preview/route.test.ts' lib/progress-transfer.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit preview API**

```bash
git add lib/validations.ts 'app/api/admin/groups/[id]/members/transfer/preview/route.ts' 'app/api/admin/groups/[id]/members/transfer/preview/route.test.ts'
git commit -m "feat: preview progress transfer between group courses"
```

---

### Task 3: Transactional transfer, progress copy, and old-course revocation

**Files:**
- Modify: `app/api/admin/groups/[id]/members/transfer/route.ts`
- Create: `app/api/admin/groups/[id]/members/transfer/route.test.ts`

**Interfaces:**
- Consumes: extended `adminGroupTransferSchema`, `validateProgressMappings()`, and `mergeProgress()`.
- Produces response data `{ sourceGroupId, targetGroupId, historyPreserved, enrollmentAction, sourceEnrollmentRevoked, transferredLessons, skippedLessons }`.

- [ ] **Step 1: Write failing transactional route tests**

Use a mocked transaction client and verify these concrete behaviors:

```ts
expect(tx.lessonProgress.upsert).toHaveBeenCalledWith({
  where: { userId_lessonId: { userId, lessonId: targetLessonId } },
  update: expect.objectContaining({ status: "completed", watchedTime: 120 }),
  create: expect.objectContaining({ userId, lessonId: targetLessonId, status: "completed" }),
});
expect(tx.enrollment.deleteMany).toHaveBeenCalledWith({
  where: { userId, courseId: sourceCourseId },
});
```

Also test that omitted new fields never call `lessonProgress.upsert` or source `enrollment.deleteMany`, a mapping with a lesson outside either course returns 400, and a thrown upsert makes the whole handler return 500 without sending a success response.

- [ ] **Step 2: Run route tests and verify failure**

Run: `npm test -- --run 'app/api/admin/groups/[id]/members/transfer/route.test.ts'`

Expected: FAIL because the route ignores both new fields.

- [ ] **Step 3: Implement validation before the transaction**

Parse:

```ts
const {
  userId,
  targetGroupId,
  revokeSourceEnrollment = false,
  progressMappings = [],
} = adminGroupTransferSchema.parse(await request.json());
```

When mappings exist, load all referenced lessons with module course IDs and all source progress records for the mapped source IDs. Call `validateProgressMappings`. Return `400 INVALID_PROGRESS_MAPPING` for user-controlled mapping errors, before starting the transaction. Repeat the lesson-to-course membership check through the transaction client before the first progress upsert so a stale preview cannot write across course boundaries.

- [ ] **Step 4: Extend the existing transaction**

After target enrollment creation/update, loop through the validated mappings. For every source progress record, read the target progress, call `mergeProgress`, and upsert the target compound key. Count successful copies.

If `revokeSourceEnrollment` is true and non-null source/target course IDs differ, run:

```ts
const revoked = await tx.enrollment.deleteMany({
  where: { userId, courseId: sourceMember.group.courseId },
});
sourceEnrollmentRevoked = revoked.count > 0;
```

Keep source lesson progress and homework untouched. Return all result counts from the transaction.

- [ ] **Step 5: Correct audit, notification, and response wording**

Replace `progressPreserved: true` with:

```ts
historyPreserved: true,
sourceEnrollmentRevoked: result.sourceEnrollmentRevoked,
transferredLessons: result.transferredLessons,
skippedLessons: progressMappings.length - result.transferredLessons,
```

Notification text must say that learning history is preserved, without claiming that all progress was transferred when no mapping was provided.

- [ ] **Step 6: Run transfer tests**

Run: `npm test -- --run 'app/api/admin/groups/[id]/members/transfer/route.test.ts' lib/progress-transfer.test.ts`

Expected: PASS, including rollback and backward-compatibility cases.

- [ ] **Step 7: Commit the transfer transaction**

```bash
git add 'app/api/admin/groups/[id]/members/transfer/route.ts' 'app/api/admin/groups/[id]/members/transfer/route.test.ts'
git commit -m "feat: transfer confirmed lesson progress between group courses"
```

---

### Task 4: Curator transfer dialog with preview and explicit confirmation

**Files:**
- Create: `app/admin/groups/[id]/_components/member-transfer-dialog.tsx`
- Modify: `app/admin/groups/[id]/page.tsx:65-180,509-580`

**Interfaces:**
- Consumes preview endpoint from Task 2 and transfer endpoint from Task 3.
- Produces component:

```ts
interface MemberTransferDialogProps {
  open: boolean;
  sourceGroup: GroupTransferOption;
  member: { userId: string; user: { email: string; fullName: string | null } } | null;
  groups: GroupTransferOption[];
  onOpenChange(open: boolean): void;
  onTransferred(result: TransferResult): void;
}
```

- [ ] **Step 1: Create the focused dialog component shell**

Move target-group state and transfer mutation out of the page. Reset `targetGroupId`, `revokeSourceEnrollment`, `transferProgress`, and selected mappings whenever the dialog closes or member changes.

- [ ] **Step 2: Add target-course context and safe defaults**

When source and target have different non-null course IDs, render checked checkboxes:

```tsx
<Checkbox checked={revokeSourceEnrollment} onCheckedChange={(value) => setRevokeSourceEnrollment(value === true)} />
<Label>Закрыть доступ к курсу «{sourceGroup.course?.title}»</Label>

<Checkbox checked={transferProgress} onCheckedChange={(value) => setTransferProgress(value === true)} />
<Label>Перенести подтверждённый прогресс в «{targetGroup.course?.title}»</Label>
```

Hide both controls for a same-course transfer. Disable progress transfer if either group has no course.

- [ ] **Step 3: Query and render preview mappings**

Query the preview endpoint only when the dialog is open, a target is selected, and progress transfer is checked. Initialize selected mappings from `suggestion.selected === true` without overwriting curator edits after every render.

Render each source lesson with status, module, confidence badge, and a target lesson `Select`. Include an explicit “Не переносить” value. Filter already selected target lesson IDs from other rows. Positional suggestions appear but remain unchecked until the curator selects them.

- [ ] **Step 4: Submit exact curator choices and show result**

Send:

```ts
{
  userId: member.userId,
  targetGroupId,
  revokeSourceEnrollment,
  progressMappings: transferProgress ? selectedMappings : [],
}
```

On success render/toast: `Переведено уроков: N. Старый курс: закрыт/оставлен.` On API error show the server message and keep the dialog state for correction.

- [ ] **Step 5: Integrate component into group page**

Replace the inline dialog and mutation. Keep page-level invalidations for group list, source members, target members, and the affected user's profile query. Update the old misleading description and toast.

- [ ] **Step 6: Run static checks for this slice**

Run: `npm run type-check`

Expected: no TypeScript errors in the new dialog or group page.

- [ ] **Step 7: Commit transfer UI**

```bash
git add 'app/admin/groups/[id]/_components/member-transfer-dialog.tsx' 'app/admin/groups/[id]/page.tsx'
git commit -m "feat: let curators confirm group progress transfer"
```

---

### Task 5: Profile course revocation and consistent module restrictions

**Files:**
- Modify: `app/api/admin/users/[id]/enrollments/route.ts:187-245`
- Modify: `app/api/admin/enrollments/[id]/route.ts:7-65`
- Modify: `app/api/admin/users/[id]/route.ts:52-65`
- Modify: `app/admin/users/[id]/_components/access-manager.tsx`
- Modify: `app/admin/users/[id]/page.tsx:960-990`
- Create: `lib/enrollment-access.ts`
- Create: `lib/enrollment-access.test.ts`

**Interfaces:**
- Produces `normalizeEnrollmentAccess(input): { restrictedModules, restrictedLessons, forcedModules }`.
- Access manager additionally consumes `userId: string` and calls `DELETE /api/admin/users/:userId/enrollments?courseId=:courseId`.

- [ ] **Step 1: Write failing normalization tests**

```ts
expect(
  normalizeEnrollmentAccess({
    restrictedModules: ["module-a"],
    restrictedLessons: [],
    forcedModules: ["module-a", "module-b"],
  })
).toEqual({
  restrictedModules: ["module-a"],
  restrictedLessons: [],
  forcedModules: ["module-b"],
});
```

Also cover duplicate IDs and unchanged non-conflicting lists.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- --run lib/enrollment-access.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement access normalization and use it server-side**

Create a pure helper that deduplicates every list and removes every restricted module ID from `forcedModules`. Extend the enrollment PATCH schema with `forcedModules: z.array(z.string()).optional()`. Merge omitted fields from `existingEnrollment`, normalize all three lists, and update them together whenever any one list is submitted.

- [ ] **Step 4: Make enrollment deletion idempotent**

Replace `db.enrollment.delete` with `deleteMany({ where: { userId: id, courseId } })`. Keep audit logging only when the enrollment was found. Return:

```ts
{ success: true, data: { removed: deleted.count > 0 } }
```

Do not call progress or homework delete methods.

- [ ] **Step 5: Return and display forced-module state**

Select `forcedModules: true` in the user profile route. In `AccessManager`, initialize it alongside restrictions, remove a module from `forcedModules` when its checkbox is cleared, and include it in the PATCH payload. Display a badge «Открыт принудительно» when applicable.

- [ ] **Step 6: Add confirmed full-course revocation**

Pass `userId` from the profile page. Add a destructive action and confirmation dialog with exact copy:

```tsx
<DialogTitle>Полностью отозвать доступ?</DialogTitle>
<DialogDescription>
  Курс исчезнет из «Моих материалов». Прогресс и домашние задания сохранятся.
</DialogDescription>
```

On success close dialogs, toast `Доступ к курсу отозван`, and invalidate `['admin', 'users', userId]`, enrollment lists, and course-progress queries.

- [ ] **Step 7: Run focused and static checks**

Run: `npm test -- --run lib/enrollment-access.test.ts && npm run type-check`

Expected: PASS with no new TypeScript errors.

- [ ] **Step 8: Commit profile access controls**

```bash
git add lib/enrollment-access.ts lib/enrollment-access.test.ts 'app/api/admin/users/[id]/enrollments/route.ts' 'app/api/admin/enrollments/[id]/route.ts' 'app/api/admin/users/[id]/route.ts' 'app/admin/users/[id]/_components/access-manager.tsx' 'app/admin/users/[id]/page.tsx'
git commit -m "feat: let curators fully revoke course access"
```

---

### Task 6: Manual lesson status controls

**Files:**
- Modify: `app/admin/users/[id]/_components/lesson-progress-manager.tsx`
- Modify: `app/api/admin/users/[id]/progress/update/route.ts:10-134`

**Interfaces:**
- Consumes existing PATCH payload `{ lessonId, status, completedAt }`.
- Produces per-lesson actions for `completed`, `in_progress`, and reset.

- [ ] **Step 1: Harden PATCH status/date consistency**

When status is `completed` and `completedAt` is omitted, set it to the current time. When status is `in_progress`, `not_started`, or `failed`, set `completedAt` to null unless explicitly supplied. Keep `watchedTime` unchanged unless provided.

Add the pure `buildProgressUpdateData()` helper to `lib/progress-transfer.ts`, use it in the PATCH route, and cover:

```ts
expect(buildProgressUpdateData({ status: "completed" }, now)).toEqual({
  status: "completed",
  completedAt: now,
});
expect(buildProgressUpdateData({ status: "in_progress" }, now)).toEqual({
  status: "in_progress",
  completedAt: null,
});
```

- [ ] **Step 2: Add a shared status mutation to the component**

Create one mutation accepting `{ lesson, status }`, call PATCH, show action-specific success text, and invalidate both lesson progress and profile queries.

- [ ] **Step 3: Render contextual actions**

For non-completed lessons show «Отметить пройденным». For completed/failed/not-started lessons where applicable show «Вернуть в процесс». Keep «Сбросить» and its confirmation. Disable all row actions while that lesson is mutating.

- [ ] **Step 4: Run focused tests and type-check**

Run: `npm test -- --run lib/progress-transfer.test.ts && npm run type-check`

Expected: PASS.

- [ ] **Step 5: Commit manual progress controls**

```bash
git add lib/progress-transfer.ts lib/progress-transfer.test.ts 'app/api/admin/users/[id]/progress/update/route.ts' 'app/admin/users/[id]/_components/lesson-progress-manager.tsx'
git commit -m "feat: let curators correct lesson progress"
```

---

### Task 7: Browser regression coverage and full verification

**Files:**
- Create: `tests/e2e/admin-course-access.spec.ts`
- Modify only if verification exposes a task-related defect: files owned by Tasks 1-6.

**Interfaces:**
- Consumes all UI and API contracts from Tasks 1-6.
- Produces reproducible local verification evidence.

- [ ] **Step 1: Add mocked browser tests for profile controls**

Use Playwright route mocks for the admin user/profile/course endpoints. Assert that clicking «Полностью отозвать доступ» shows the preservation warning, confirmation sends DELETE with the expected `courseId`, and the removed course disappears after the mocked profile refresh.

- [ ] **Step 2: Add mocked browser tests for transfer preview**

Mock a source course with one exact mapping and one unmatched lesson. Assert that the exact row is selected, the unmatched row is visibly marked, the curator can deselect a row, and POST contains only selected mappings plus `revokeSourceEnrollment`.

- [ ] **Step 3: Run all feature unit tests**

Run:

```bash
npm test -- --run \
  lib/progress-transfer.test.ts \
  lib/enrollment-access.test.ts \
  'app/api/admin/groups/[id]/members/transfer/preview/route.test.ts' \
  'app/api/admin/groups/[id]/members/transfer/route.test.ts'
```

Expected: all tests PASS.

- [ ] **Step 4: Run TypeScript and production build**

Run: `npm run type-check`

Expected: exit code 0.

Run: `npm run build`

Expected: exit code 0 and all new API routes listed successfully.

- [ ] **Step 5: Run targeted Playwright test against local app**

Run: `npm run dev` in a persistent terminal, then `npx playwright test tests/e2e/admin-course-access.spec.ts`.

Expected: all course access, preview, and manual progress scenarios PASS.

- [ ] **Step 6: Inspect the final diff and working tree**

Run: `git diff --check && git status --short && git log --oneline -8`

Expected: no whitespace errors; only the pre-existing unrelated dirty files remain outside feature commits.

- [ ] **Step 7: Commit browser coverage or final corrections**

```bash
git add tests/e2e/admin-course-access.spec.ts
git commit -m "test: cover curator course access workflows"
```
