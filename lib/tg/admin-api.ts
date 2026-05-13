// Convenience wrapper around withAuth: adds rate-limiting and an
// audit-log hook so every admin route doesn't have to wire these
// separately. Use from new tg admin endpoints; older routes can
// migrate incrementally.

import { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import { withAuth, type AuthenticatedRequest } from "../api-middleware";
import {
  checkAdminRateLimit,
  rateLimitedResponse,
} from "./admin-rate-limit";
import { audit, buildAuditCtx } from "./audit";

export interface AdminApiOptions {
  // The role required to call this endpoint. Defaults to admin.
  roles?: UserRole[];
  // Rate-limit bucket. Defaults to "default"; mutating endpoints
  // should pass "write" or "broadcast".
  rateLimitScope?: "default" | "write" | "broadcast";
  // If set, an audit row is written automatically with this action
  // name when the handler returns 2xx. Mutations should set this.
  // Failure paths can call audit(..., outcome: "failed") manually.
  auditAction?: string;
  // Optional resolver for botId (used by audit/limit keys). When the
  // route is under /admin/tg/bots/[botId]/... pass the param.
  botId?: string;
}

export async function withAdminApi(
  request: NextRequest,
  handler: (req: AuthenticatedRequest) => Promise<Response>,
  options: AdminApiOptions = {},
) {
  return withAuth(
    request,
    async (req) => {
      const user = req.user;
      // Rate-limit by userId (or by IP for system API calls). System
      // calls bypass the limit because they already authenticate via
      // server secret and we trust those.
      const ratekey =
        user && user.userId !== "system-api" ? user.userId : null;
      if (ratekey) {
        const limit = await checkAdminRateLimit(
          ratekey,
          options.rateLimitScope ?? "default",
        );
        if (!limit.ok) return rateLimitedResponse(limit.retryAfterSec);
      }

      // Run the handler — bail on non-2xx so we don't audit failed mutations.
      const response = await handler(req);
      if (options.auditAction && response.status >= 200 && response.status < 300) {
        const ctx = buildAuditCtx(
          request,
          user ? { userId: user.userId, email: user.email } : undefined,
          options.botId,
        );
        // Best-effort: detached.
        audit(ctx, options.auditAction).catch(() => undefined);
      }
      return response;
    },
    { roles: options.roles ?? ["admin"] },
  );
}
