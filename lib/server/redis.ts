import Redis from "ioredis";
import { AppError } from "./http";
const globalRedis = globalThis as unknown as { aixRedis?: Redis };
export function getRedis() {
  if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required.");
  return (globalRedis.aixRedis ??= new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
  }));
}
export async function rateLimit(key: string, limit = 30, seconds = 60) {
  const r = getRedis();
  const n = (await r.eval(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
    1,
    "rate:" + key,
    seconds,
  )) as number;
  return n <= limit;
}
export async function withLock<T>(key: string, fn: () => Promise<T>) {
  const r = getRedis(),
    token = crypto.randomUUID();
  const ok = await r.set("lock:" + key, token, "EX", 180, "NX");
  if (!ok)
    throw new AppError(409, "This conversation already has an active run.");
  const timer = setInterval(() => {
    r.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('EXPIRE',KEYS[1],180) end return 0",
      1,
      "lock:" + key,
      token,
    ).catch(() => {});
  }, 45000);
  try {
    return await fn();
  } finally {
    clearInterval(timer);
    await r
      .eval(
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
        1,
        "lock:" + key,
        token,
      )
      .catch(() =>
        console.error("Redis lock release failed; lease will expire"),
      );
  }
}
