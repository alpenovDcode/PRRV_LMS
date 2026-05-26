import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * POST /api/homework/ai-result
 *
 * Legacy auto-approve callback от AI-checker. Используется когда AI-checker
 * прислал результат для воркера, который пушил очередь с mode="auto_approve":
 * статус ДЗ переключается напрямую без участия куратора.
 *
 * Идемпотентность: повторный POST с тем же submissionId после того как
 * статус уже выставлен (не "pending") — возвращаем 200 без изменений.
 * AI-checker часто ретраит при сетевых ошибках, мы не должны от этого
 * перезаписывать состояние повторно.
 */
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

  // C3: идемпотентность. Если submission уже не pending — не перезаписываем.
  // Это защищает от: (а) ретраев AI-checker'а; (б) сценария когда куратор
  // успел проверить ДЗ раньше чем callback дошёл.
  const existing = await db.homeworkSubmission.findUnique({
    where: { id: submissionId },
    select: { status: true },
  });
  if (!existing) {
    return NextResponse.json(
      { ok: true, ignored: "submission not found" },
      { status: 200 }
    );
  }
  if (existing.status !== "pending") {
    return NextResponse.json(
      { ok: true, ignored: "already_processed", status: existing.status },
      { status: 200 }
    );
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
