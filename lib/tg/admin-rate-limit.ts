// Per-user rate-limit for the admin tg API surface. We're explicit:
// outbound Telegram rate limiting (lib/tg/rate-limit.ts) protects
// Telegram, this one protects us — admin tooling endpoints shouldn't
// be hit faster than ~30 RPS even by a misbehaving script.
//
// Implementation: token bucket in Redis, keyed by (userId, scope).
// Fails OPEN if Redis is unavailable — better to serve a few extra
// requests than to lock admins out of their dashboard during a Redis
// outage.

import { NextResponse } from "next/server";
import { getRedisClient } from "../redis";
import type { ApiResponse } from "@/types";

interface RateLimitConfig {
  // Tokens added per second.
  refillPerSec: number;
  // Max tokens in the bucket.
  capacity: number;
}

const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  // Broad default for any admin endpoint — ~10 RPS sustained, ~30 burst.
  default: { refillPerSec: 10, capacity: 30 },
  // Mutating endpoints (POST/PATCH/DELETE) get tighter limits.
  write: { refillPerSec: 4, capacity: 12 },
  // Broadcast send is the most expensive — admins should never be
  // spamming this anyway.
  broadcast: { refillPerSec: 0.2, capacity: 2 },
};

export async function checkAdminRateLimit(
  userId: string,
  scope: keyof typeof DEFAULT_LIMITS = "default",
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const cfg = DEFAULT_LIMITS[scope] ?? DEFAULT_LIMITS.default;
  try {
    const client = await getRedisClient();
    const key = `tg:adminrl:${scope}:${userId}`;
    const now = Date.now();
    // Stored as `<tokens>|<lastRefillMs>`. We use a single string for
    // atomicity via simple SET; concurrent requests can lose updates,
    // but that's acceptable for a soft rate limit.
    const raw = await client.get(key);
    let tokens = cfg.capacity;
    let lastRefill = now;
    if (raw) {
      const parts = raw.split("|");
      tokens = parseFloat(parts[0]);
      lastRefill = parseInt(parts[1], 10);
      if (Number.isNaN(tokens)) tokens = cfg.capacity;
      const elapsed = (now - lastRefill) / 1000;
      tokens = Math.min(cfg.capacity, tokens + elapsed * cfg.refillPerSec);
    }
    if (tokens < 1) {
      const retryAfterSec = Math.ceil((1 - tokens) / cfg.refillPerSec);
      return { ok: false, retryAfterSec };
    }
    tokens -= 1;
    await client.set(key, `${tokens.toFixed(3)}|${now}`, { EX: 3600 });
    return { ok: true };
  } catch {
    // Redis down — let the request through.
    return { ok: true };
  }
}

// Convenience: wrap a handler with rate-limit + auth pre-check. Use
// from /api/admin/tg/* route handlers in tandem with withAuth.
export function rateLimitedResponse(retryAfterSec: number): Response {
  return NextResponse.json<ApiResponse>(
    {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: `Слишком много запросов. Повторите через ${retryAfterSec}с.`,
      },
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}
