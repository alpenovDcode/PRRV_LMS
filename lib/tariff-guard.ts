// Reusable helper to gate a feature behind a UserTariff.
//
// Usage in an API route:
//   return withAuth(request, async (req) => {
//     const guard = await requireTariff(req.user!.userId, ["LR"]);
//     if (!guard.ok) return tariffDenied(guard);
//     // ... business logic ...
//   });
//
// We deliberately keep this a small standalone helper rather than
// extending withAuth() because tariff-gating is per-route, not
// per-route-class, and a wrapping option would obscure which endpoints
// have tariff requirements when reading them top-down.

import { NextResponse } from "next/server";
import type { UserTariff } from "@prisma/client";
import { db } from "./db";
import type { ApiResponse } from "@/types";

// Human labels — used in error messages so the client UI can render
// "Доступно только на тарифе «Лидер рынка»" without re-implementing
// the dictionary.
export const TARIFF_LABELS: Record<UserTariff, string> = {
  VR: "Востребованный",
  LR: "Лидер рынка",
  SR: "Самостоятельный",
};

export type RequireTariffResult =
  | { ok: true; tariff: UserTariff | null }
  | { ok: false; tariff: UserTariff | null; required: UserTariff[] };

// Checks that the authenticated user's tariff is in `allowedTariffs`.
// Admins always pass — they have full access to all features.
// Returns ok=false with the required-list so the caller can build a
// helpful error message and the client can display the "upgrade your
// tariff" CTA.
export async function requireTariff(
  userId: string,
  allowedTariffs: UserTariff[],
): Promise<RequireTariffResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { tariff: true, role: true },
  });
  if (!user) {
    return { ok: false, tariff: null, required: allowedTariffs };
  }
  // Admins bypass tariff gates — they manage the platform.
  if (user.role === "admin") {
    return { ok: true, tariff: user.tariff };
  }
  if (!user.tariff || !allowedTariffs.includes(user.tariff)) {
    return { ok: false, tariff: user.tariff, required: allowedTariffs };
  }
  return { ok: true, tariff: user.tariff };
}

// Builds the 403 response for a failed tariff guard. The shape matches
// our ApiResponse so the frontend can dispatch on `error.code` and
// render the right CTA.
export function tariffDeniedResponse(
  guard: Extract<RequireTariffResult, { ok: false }>,
) {
  const requiredLabels = guard.required
    .map((t) => `«${TARIFF_LABELS[t]}»`)
    .join(", ");
  return NextResponse.json<ApiResponse>(
    {
      success: false,
      error: {
        code: "TARIFF_REQUIRED",
        message: `Эта функция доступна только на тарифе ${requiredLabels}.`,
        // We include machine-readable details so the UI can render its
        // own "upgrade" prompt without parsing the message string.
        details: {
          currentTariff: guard.tariff,
          requiredTariffs: guard.required,
        },
      },
    },
    { status: 403 },
  );
}
