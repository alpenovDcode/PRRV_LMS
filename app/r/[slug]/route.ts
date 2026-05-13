// Outbound click-tracking endpoint.
//
// Flow: bot sends an inline-button with url = https://<host>/r/<slug>?s=<subscriberId>.
// User taps → Telegram opens this URL → we log a click against the
// TgRedirectLink + TgEvent table → 302 to the real target.
//
// The `s=` query param attributes the click to a specific subscriber
// even though we have no cookies. It's optional — slugs without `s`
// still count as anonymous clicks.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { trackEvent } from "@/lib/tg/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params: paramsP }: { params: Promise<{ slug: string }> }
) {
  const params = await paramsP;
  const url = new URL(request.url);
  const subscriberQ = url.searchParams.get("s") || null;

  const link = await db.tgRedirectLink.findUnique({
    where: { slug: params.slug },
  });
  if (!link) {
    return new NextResponse("Link not found", { status: 404 });
  }
  if (link.expiresAt && link.expiresAt < new Date()) {
    return new NextResponse("Link expired", { status: 410 });
  }

  // Soft-attribute: if the link is subscriber-specific (link.subscriberId
  // is set), prefer that. Otherwise honour the `s=` query.
  const subscriberId = link.subscriberId ?? subscriberQ;

  // Best-effort logging — don't block the redirect on DB hiccups.
  db.tgRedirectLink
    .update({
      where: { id: link.id },
      data: {
        clickCount: { increment: 1 },
        lastClickAt: new Date(),
      },
    })
    .catch(() => undefined);

  trackEvent({
    type: "redirect.clicked",
    botId: link.botId,
    subscriberId: subscriberId ?? undefined,
    properties: {
      slug: link.slug,
      target: link.targetUrl,
      sourceFlowId: link.sourceFlowId,
      sourceNodeId: link.sourceNodeId,
    },
  }).catch(() => undefined);

  return NextResponse.redirect(link.targetUrl, { status: 302 });
}
