// Short-lived, memory-only cache for explicitly opted-in, user-scoped lists.
// Live runs, approvals, permissions and credentials must never use this cache.
const entries = new Map<string, { value: unknown; expires: number }>();
const MAX_ENTRIES = 30;
const TTL_MS = 15_000;

export function readListCache<T>(key: string): T | undefined {
  const entry = entries.get(key);
  if (!entry || entry.expires <= Date.now()) { entries.delete(key); return undefined; }
  return entry.value as T;
}
export function writeListCache<T>(key: string, value: T): void {
  entries.delete(key);
  entries.set(key, { value, expires: Date.now() + TTL_MS });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}
export function clearListCache(key: string): void { entries.delete(key); }
