// Helpers for outbound click-tracking. Creates short slugs and
// rewrites URL-buttons in message payloads before sending.

import { randomBytes } from "crypto";
import { db } from "../db";
import type { FlowMessagePayload } from "./flow-schema";

const HOST = process.env.PUBLIC_APP_URL ?? "";

// Slug = 10 base62 chars. Collision space is 62^10 ≈ 8e17 — enough.
function makeSlug(): string {
  const alphabet =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Create or reuse a redirect link for the given (subscriber, target).
// Per-subscriber slugs mean each click is unambiguously attributed
// without relying on cookies or query-param echo.
export async function getOrCreateRedirectLink(args: {
  botId: string;
  targetUrl: string;
  subscriberId?: string;
  sourceFlowId?: string;
  sourceNodeId?: string;
}): Promise<{ slug: string; trackedUrl: string }> {
  // Try to reuse an existing one for the same subscriber+target combo.
  // Saves DB rows and lets us aggregate clicks per link cleanly.
  const existing = await db.tgRedirectLink.findFirst({
    where: {
      botId: args.botId,
      targetUrl: args.targetUrl,
      subscriberId: args.subscriberId ?? null,
      sourceFlowId: args.sourceFlowId ?? null,
      sourceNodeId: args.sourceNodeId ?? null,
    },
  });
  if (existing) {
    return {
      slug: existing.slug,
      trackedUrl: buildTrackedUrl(existing.slug, args.subscriberId),
    };
  }
  // Insert with collision retry. With 62^10 keyspace this almost
  // never loops, but the safety net is cheap.
  for (let i = 0; i < 5; i++) {
    const slug = makeSlug();
    try {
      const row = await db.tgRedirectLink.create({
        data: {
          botId: args.botId,
          slug,
          targetUrl: args.targetUrl,
          subscriberId: args.subscriberId ?? null,
          sourceFlowId: args.sourceFlowId ?? null,
          sourceNodeId: args.sourceNodeId ?? null,
        },
      });
      return {
        slug: row.slug,
        trackedUrl: buildTrackedUrl(row.slug, args.subscriberId),
      };
    } catch (e: any) {
      if (e?.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("could not generate unique slug");
}

function buildTrackedUrl(slug: string, subscriberId?: string): string {
  const base = `${HOST.replace(/\/$/, "")}/r/${slug}`;
  return subscriberId ? `${base}?s=${subscriberId}` : base;
}

// Rewrite URL-buttons in a payload so each one points to /r/<slug>.
// Buttons without `url` or with `trackClicks === false` pass through.
// Returns a NEW payload — caller should send this, not the original.
export async function rewriteUrlButtons(args: {
  payload: FlowMessagePayload;
  botId: string;
  subscriberId: string;
  flowId: string;
  nodeId: string;
}): Promise<FlowMessagePayload> {
  if (!args.payload.buttonRows || args.payload.buttonRows.length === 0) {
    return args.payload;
  }
  if (!HOST) return args.payload; // graceful no-op when host not configured
  const rewritten = await Promise.all(
    args.payload.buttonRows.map((row) =>
      Promise.all(
        row.map(async (b) => {
          if (!b.url) return b;
          // Already wrapped? skip — `/r/` is our prefix.
          if (b.url.includes(`${HOST}/r/`)) return b;
          // Opt-out per-button via the `trackClicks` flag.
          if ((b as any).trackClicks === false) return b;
          const { trackedUrl } = await getOrCreateRedirectLink({
            botId: args.botId,
            targetUrl: b.url,
            subscriberId: args.subscriberId,
            sourceFlowId: args.flowId,
            sourceNodeId: args.nodeId,
          });
          return { ...b, url: trackedUrl };
        }),
      ),
    ),
  );
  return { ...args.payload, buttonRows: rewritten };
}
