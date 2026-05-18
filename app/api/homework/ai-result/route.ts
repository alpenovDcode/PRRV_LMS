import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("X-API-Key") || "";
  if (apiKey !== (process.env.AI_CHECKER_KEY || "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { submissionId, verdict, comment } = body;

  if (!submissionId || !verdict || !comment) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!["approved", "rejected"].includes(verdict)) {
    return NextResponse.json({ error: "Invalid verdict" }, { status: 400 });
  }

  await db.homeworkSubmission.update({
    where: { id: submissionId },
    data: {
      status: verdict,
      curatorComment: comment,
      curatorId: null,
      reviewedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
