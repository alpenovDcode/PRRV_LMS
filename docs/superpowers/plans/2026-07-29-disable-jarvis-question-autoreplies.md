# Disable Jarvis Question Autoreplies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Temporarily stop Jarvis from saving automatic replies in mentor-question threads while leaving homework AI checking unchanged.

**Architecture:** A shared `isQuestionAIReplyEnabled()` guard reads `JARVIS_QUESTIONS_ENABLED` and enables the feature only for the exact value `true`. The scheduler, generator, and external callback all fail closed when the flag is absent or false.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Prisma, Docker Compose.

## Global Constraints

- Do not change homework AI checker behavior.
- Default to disabled without requiring a production environment edit.
- Ignore delayed callbacks that arrive after disabling.
- Keep the change reversible with `JARVIS_QUESTIONS_ENABLED=true`.

---

### Task 1: Guard all mentor-question AI reply entry points

**Files:**
- Create: `app/api/questions/ai-reply/route.test.ts`
- Modify: `lib/ai/question-checker.ts:3-16`
- Modify: `app/api/questions/ai-reply/route.ts:1-18`
- Modify: `docker-compose.prod.yml:65-80`

**Interfaces:**
- Produces: `isQuestionAIReplyEnabled(): boolean`
- Consumes: `process.env.JARVIS_QUESTIONS_ENABLED`

- [ ] **Step 1: Write the failing callback tests**

Create route tests that set `AI_CHECKER_KEY=test-key`, send a valid callback request, and assert:

```ts
expect(response.status).toBe(200);
expect(await response.json()).toEqual({ ok: true, skipped: true });
expect(db.question.findUnique).not.toHaveBeenCalled();
```

Add the enabled-path assertion:

```ts
process.env.JARVIS_QUESTIONS_ENABLED = "true";
expect(response.status).toBe(404);
expect(db.question.findUnique).toHaveBeenCalledOnce();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx vitest run app/api/questions/ai-reply/route.test.ts
```

Expected: the disabled callback test fails with status `404` instead of `200`.

- [ ] **Step 3: Implement the minimal fail-closed guard**

In `lib/ai/question-checker.ts`, add:

```ts
export function isQuestionAIReplyEnabled(): boolean {
  return process.env.JARVIS_QUESTIONS_ENABLED === "true";
}
```

Return before waiting in `scheduleQuestionAIReply()` and return `"skipped"` before database access in `generateQuestionAIReply()`.

In the callback route, return `{ ok: true, skipped: true }` before parsing the callback body or querying Prisma when the flag is disabled.

In `docker-compose.prod.yml`, pass:

```yaml
JARVIS_QUESTIONS_ENABLED: ${JARVIS_QUESTIONS_ENABLED:-false}
```

- [ ] **Step 4: Verify GREEN and run project checks**

Run:

```bash
npx vitest run app/api/questions/ai-reply/route.test.ts
npm run type-check
npm run build
```

Expected: every command exits `0`.

- [ ] **Step 5: Commit only the Jarvis-disable files**

```bash
git add app/api/questions/ai-reply/route.test.ts app/api/questions/ai-reply/route.ts lib/ai/question-checker.ts docker-compose.prod.yml
git commit -m "fix: disable Jarvis question autoreplies"
```

- [ ] **Step 6: Deploy and verify production behavior**

Deploy the commit through the repository’s existing production path. Confirm the active app reports healthy, then create or use a new test question and verify no Jarvis message appears after five minutes.
