import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { db } = vi.hoisted(() => ({
  db: {
    question: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    questionMessage: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db }));

import { POST } from "./route";

function createCallbackRequest() {
  return new NextRequest("http://localhost/api/questions/ai-reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": "test-key",
    },
    body: JSON.stringify({ questionId: "question-1", reply: "Ответ Джарвикса" }),
  });
}

describe("POST /api/questions/ai-reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AI_CHECKER_KEY = "test-key";
    delete process.env.JARVIS_QUESTIONS_ENABLED;
    db.question.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.AI_CHECKER_KEY;
    delete process.env.JARVIS_QUESTIONS_ENABLED;
  });

  it("skips delayed callbacks when question autoreplies are disabled", async () => {
    const response = await POST(createCallbackRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, skipped: true });
    expect(db.question.findUnique).not.toHaveBeenCalled();
  });

  it("processes callbacks when question autoreplies are explicitly enabled", async () => {
    process.env.JARVIS_QUESTIONS_ENABLED = "true";

    const response = await POST(createCallbackRequest());

    expect(response.status).toBe(404);
    expect(db.question.findUnique).toHaveBeenCalledOnce();
  });
});
