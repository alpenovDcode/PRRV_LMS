import { NextRequest, NextResponse } from "next/server";
import { compareConstantTime } from "@/lib/email/security/constant-time-compare";
import { processCertificateIssuanceJobs } from "@/lib/certificate-issuance-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const expected = process.env.EMAIL_CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "EMAIL_CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (!compareConstantTime(token, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const result = await processCertificateIssuanceJobs(2);
    return NextResponse.json({ ok: true, durationMs: Date.now() - startedAt, ...result });
  } catch (error) {
    console.error("[certificate-cron] tick failed", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
