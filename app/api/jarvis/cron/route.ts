import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/lib/db";
import { generateJarvisReply } from "@/lib/jarvis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  const secret = process.env.JARVIS_CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "JARVIS_CRON_SECRET not configured" }, { status: 500 });
  }

  const auth = request.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (!tokenMatches(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const delayMs = parseInt(process.env.JARVIS_DELAY_MS || "300000", 10);
  const cutoff = new Date(Date.now() - delayMs);

  // Fetch open questions without mentor call and without human curator reply.
  // We load the last few messages to determine:
  //   1. The last student message and its timestamp
  //   2. Whether a human curator already replied
  const candidates = await db.question.findMany({
    where: {
      status: { not: "closed" },
      lastMentorCallAt: null, // student hasn't called a mentor
    },
    select: {
      id: true,
      studentId: true,
      jarvisRepliedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          authorId: true,
          isAiReply: true,
          createdAt: true,
        },
      },
    },
    take: 200,
  });

  const pending: string[] = [];

  for (const q of candidates) {
    // Skip if a human curator/admin wrote anything
    const hasHumanReply = q.messages.some(
      (m) => !m.isAiReply && m.authorId !== null && m.authorId !== q.studentId
    );
    if (hasHumanReply) continue;

    // Find the most recent student message
    const lastStudentMsg = q.messages.find(
      (m) => !m.isAiReply && m.authorId === q.studentId
    );
    if (!lastStudentMsg) continue;

    // Delay hasn't passed yet for this message
    if (lastStudentMsg.createdAt > cutoff) continue;

    // Jarvis already replied to this student message
    if (q.jarvisRepliedAt && q.jarvisRepliedAt >= lastStudentMsg.createdAt) continue;

    pending.push(q.id);
  }

  const results = { replied: 0, skipped: 0, error: 0 };

  for (const id of pending.slice(0, 20)) {
    const outcome = await generateJarvisReply(id);
    results[outcome]++;
  }

  return NextResponse.json({ ok: true, processed: pending.length, results });
}

export async function POST(request: NextRequest) {
  return handle(request);
}
export async function GET(request: NextRequest) {
  return handle(request);
}
