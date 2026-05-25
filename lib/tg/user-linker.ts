/**
 * lib/tg/user-linker.ts
 *
 * Bi-directional linking between TgSubscriber and LMS User.
 *
 * Direction 1: subscriber sets client.email or client.phone in a flow
 *   → tryLinkSubscriberToUser(subscriberId) resolves the LMS user and sets lmsUserId
 *
 * Direction 2: landing form submitted → LMS user created/found
 *   → linkLmsUserToSubscribers(lmsUserId, email) finds all TgSubscribers
 *     with matching email in their variables and sets lmsUserId
 *
 * Both functions are fire-and-forget (never throw).
 */

import { db } from "@/lib/db";

/**
 * Attempt to link a TgSubscriber to an LMS User by matching
 * client.email and/or client.phone stored in subscriber.variables.
 * Idempotent — skips if lmsUserId is already set.
 */
export async function tryLinkSubscriberToUser(subscriberId: string): Promise<void> {
  try {
    const sub = await db.tgSubscriber.findUnique({
      where: { id: subscriberId },
      select: { id: true, lmsUserId: true, variables: true },
    });
    if (!sub || sub.lmsUserId) return; // already linked

    const vars = (sub.variables as Record<string, unknown>) ?? {};
    const email = vars.email ? String(vars.email).toLowerCase().trim() : null;
    const phone = vars.phone ? String(vars.phone).trim() : null;

    let lmsUser: { id: string } | null = null;

    if (email) {
      lmsUser = await db.user.findUnique({
        where: { email },
        select: { id: true },
      });
    }
    if (!lmsUser && phone) {
      // Phone is stored in variables but User table has no phone field —
      // skip for now; can be extended when User.phone is added.
    }

    if (lmsUser) {
      await db.tgSubscriber.update({
        where: { id: subscriberId },
        data: { lmsUserId: lmsUser.id },
      });
    }
  } catch (e) {
    console.error("[user-linker] tryLinkSubscriberToUser error:", e);
  }
}

/**
 * When an LMS User is created/found via a landing submit, find all
 * TgSubscribers (across all bots) whose variables.email matches and
 * set their lmsUserId.
 */
export async function linkLmsUserToSubscribers(
  lmsUserId: string,
  email: string
): Promise<void> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    if (!normalizedEmail) return;

    // Raw query: find subscribers where variables->>'email' matches.
    // Prisma doesn't support JSON containment filter on arbitrary keys directly.
    await db.$executeRaw`
      UPDATE tg_subscribers
      SET lms_user_id = ${lmsUserId}
      WHERE lms_user_id IS NULL
        AND variables->>'email' = ${normalizedEmail}
    `;
  } catch (e) {
    console.error("[user-linker] linkLmsUserToSubscribers error:", e);
  }
}
