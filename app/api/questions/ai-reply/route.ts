import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { saveQuestionAIReply } from "@/lib/ai/question-checker";

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("X-API-Key") || "";
  if (apiKey !== (process.env.AI_CHECKER_KEY || "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { questionId, reply } = body;

  if (!questionId || !reply) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const question = await db.question.findUnique({
    where: { id: questionId },
    select: { firstResponseAt: true, status: true },
  });

  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  if (question.status === "closed") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  await saveQuestionAIReply(questionId, reply, question.firstResponseAt);

  return NextResponse.json({ ok: true });
}
