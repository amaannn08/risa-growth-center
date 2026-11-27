import type { Db } from './client';

/**
 * Durable fixed-window counter in Postgres (shared across serverless instances).
 * One atomic upsert both counts and rolls the window over when it has expired, so concurrent requests cannot over-admit.
 * Used for the chat rate limit, the daily provider-budget reservation (a request is counted BEFORE the provider is called) and edit limits.
 */
export async function hit(db: Db, key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; count: number; limit: number }> {
  const [r] = await db.query<{ count: number }>(
    `INSERT INTO rate_counters(key, count, expires_at) VALUES ($1, 1, now() + make_interval(secs => $2::int))
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_counters.expires_at <= now() THEN 1 ELSE rate_counters.count + 1 END,
       expires_at = CASE WHEN rate_counters.expires_at <= now() THEN now() + make_interval(secs => $2::int) ELSE rate_counters.expires_at END
     RETURNING count`, [key, windowSeconds]);
  if (Math.random() < 0.02) await db.query(`DELETE FROM rate_counters WHERE expires_at < now() - interval '1 hour'`).catch(() => {});
  const count = Number(r?.count ?? 1);
  return { allowed: count <= limit, count, limit };
}
