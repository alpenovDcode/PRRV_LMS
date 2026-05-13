// Admin audit-log helper. Records every mutating action across the
// bot platform: flow edits, broadcast sends, list/field changes,
// media library mutations, bot setting edits.
//
// Design rules:
//   1. Best-effort: a failed audit insert never blocks the actual op.
//   2. No PII in `details` — we record what changed (field names, IDs,
//      counts) but not the actual payload. The mutation already lives
//      on the resource itself; the log is for "who touched what when".
//   3. Action names follow the `tg.<entity>.<verb>` convention so we
//      can group them in reports.

import { db } from "../db";

export interface AuditCtx {
  actorUserId?: string;
  actorEmail?: string;
  botId?: string;
  ip?: string;
  userAgent?: string;
}

export async function audit(
  ctx: AuditCtx,
  action: string,
  details: Record<string, unknown> = {},
  outcome: "ok" | "denied" | "failed" = "ok",
): Promise<void> {
  try {
    await db.tgAuditLog.create({
      data: {
        actorUserId: ctx.actorUserId,
        actorEmail: ctx.actorEmail,
        botId: ctx.botId,
        action,
        details: details as object,
        outcome,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
  } catch {
    // Don't let the audit log break business operations.
  }
}

// Pull AuditCtx out of a Next request + authenticated user.
export function buildAuditCtx(
  req: Request,
  user: { userId: string; email: string } | undefined,
  botId?: string,
): AuditCtx {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    undefined;
  return {
    actorUserId: user?.userId,
    actorEmail: user?.email,
    botId,
    ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  };
}

// Cron-safe purge. Keeps last 180 days by default — operator can
// override via env. Returns rows-deleted for visibility.
export async function purgeOldAuditLogs(daysToKeep = 180): Promise<number> {
  const cutoff = new Date(Date.now() - daysToKeep * 86_400_000);
  const r = await db.tgAuditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return r.count;
}
