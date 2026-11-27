const hits = new Map<string, number[]>();
/** In-memory sliding window (per server instance). Returns true when the request is allowed. */
export function allow(key: string, limit: number, windowMs = 10 * 60_000, now = Date.now()): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { hits.set(key, arr); return false; }
  arr.push(now);
  hits.set(key, arr);
  return true;
}
export const clientKey = (req: Request) => (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0]!.trim();
