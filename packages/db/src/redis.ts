import Redis from 'ioredis';

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }
  return redis;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const reply = await getRedis().ping();
    return reply === 'PONG';
  } catch {
    return false;
  }
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

/** Returns true when the caller is still under the limit. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const client = getRedis();
    const redisKey = `rl:${key}`;
    const count = await client.incr(redisKey);
    if (count === 1) await client.expire(redisKey, windowSec);
    return count <= limit;
  } catch {
    const now = Date.now();
    const bucket = memoryBuckets.get(key);
    if (!bucket || bucket.resetAt < now) {
      memoryBuckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    redis.disconnect();
    redis = undefined;
  }
}
