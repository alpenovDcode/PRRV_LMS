// DEV-ONLY endpoint for manual Jarvis testing without waiting for the delay.
// Returns 404 in production.
import { NextRequest, NextResponse } from "next/server";
import { generateJarvisReply } from "@/lib/jarvis";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { questionId } = await request.json();
  if (!questionId) {
    return NextResponse.json({ error: "questionId required" }, { status: 400 });
  }

  // Reset jarvisRepliedAt so we can retrigger even if already replied
  await db.question.update({
    where: { id: questionId },
    data: { jarvisRepliedAt: null },
  });

  const outcome = await generateJarvisReply(questionId);
  return NextResponse.json({ ok: true, outcome });
}
