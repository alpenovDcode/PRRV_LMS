import { createClient } from "redis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisClient: ReturnType<typeof createClient> | null = null;

export async function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  redisClient = createClient({
    url: REDIS_URL,
  });

  redisClient.on("error", (err) => {

  });

  await redisClient.connect();

  return redisClient;
}

export async function closeRedisConnection() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

