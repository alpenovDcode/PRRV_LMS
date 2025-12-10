import { getRedisClient } from "./redis";

interface RateLimitOptions {
  key: string;
  limit: number;
  windowInSeconds: number;
}

export async function rateLimit(
  req: { headers: Headers },
  { key, limit, windowInSeconds }: RateLimitOptions
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const client = await getRedisClient();
    const ipHeader = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ip = ipHeader || "unknown";
    const redisKey = `rl:${key}:${ip}`;

    const current = await client.incr(redisKey);

    if (current === 1) {
      await client.expire(redisKey, windowInSeconds);
    }

    const remaining = Math.max(limit - current, 0);

    return {
      allowed: current <= limit,
      remaining,
    };
  } catch (e) {
    // В случае проблем с Redis не блокируем запрос, чтобы не ломать прод
    console.error("Rate limit error:", e);
    return { allowed: true, remaining: limit };
  }
}


