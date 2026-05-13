// Token-bucket rate limiter for Telegram outbound.
// Telegram's documented limits:
//   - 30 messages/sec globally to different users
//   - 1 message/sec to the same chat (private)
//   - 20 messages/min to the same group
// We enforce: global=30/s, per-chat=1/s. The bucket lives in Redis
// so multiple Node processes share the same budget.
//
// Approach: simple counter per second window. Not strictly a token
// bucket — but accurate enough for the volumes we target and cheap.

import { getRedisClient } from "../redis";

const GLOBAL_LIMIT_PER_SEC = 28; // leave headroom — TG punishes the bucket, not us
const PER_CHAT_LIMIT_PER_SEC = 1;

export interface AcquireResult {
  ok: boolean;
  // Suggested ms to sleep before retrying when ok=false.
  retryAfterMs: number;
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export async function acquireSendBudget(
  botId: string,
  chatId: string
): Promise<AcquireResult> {
  try {
    const client = await getRedisClient();
    const sec = nowSec();
    const globalKey = `tg:rl:g:${botId}:${sec}`;
    const chatKey = `tg:rl:c:${botId}:${chatId}:${sec}`;

    // Check global first.
    const globalCount = await client.incr(globalKey);
    if (globalCount === 1) await client.expire(globalKey, 2);
    if (globalCount > GLOBAL_LIMIT_PER_SEC) {
      // Roll back our claim so we don't permanently consume on retry.
      await client.decr(globalKey);
      return { ok: false, retryAfterMs: 1100 - (Date.now() % 1000) };
    }

    const chatCount = await client.incr(chatKey);
    if (chatCount === 1) await client.expire(chatKey, 2);
    if (chatCount > PER_CHAT_LIMIT_PER_SEC) {
      await client.decr(chatKey);
      await client.decr(globalKey);
      return { ok: false, retryAfterMs: 1100 - (Date.now() % 1000) };
    }

    return { ok: true, retryAfterMs: 0 };
  } catch {
    // Redis down — don't block sending. The TG API will rate-limit us
    // and our error classifier will retry.
    return { ok: true, retryAfterMs: 0 };
  }
}

// Helper: wait until acquireSendBudget succeeds (bounded retries).
export async function waitForSendBudget(
  botId: string,
  chatId: string,
  maxWaitMs = 5_000
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const r = await acquireSendBudget(botId, chatId);
    if (r.ok) return true;
    await new Promise((res) => setTimeout(res, Math.min(r.retryAfterMs, 1100)));
  }
  return false;
}
