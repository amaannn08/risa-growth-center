import 'server-only';
import { createHash } from 'node:crypto';
import { getDb, hit } from '@gc/db';

/** Durable (Postgres) fixed-window limiter; replaces the old per-process Map. Returns true when the request is allowed. */
export async function allow(key: string, limit: number, windowMs = 10 * 60_000): Promise<boolean> {
  return (await hit(await getDb(), key, limit, Math.round(windowMs / 1000))).allowed;
}
export const clientKey = (req: Request) => (req.headers.get('x-forwarded-for') ?? 'local').split(',')[0]!.trim();
/** Stable anonymous client id (hashed IP, no raw address stored). */
export const clientId = (req: Request) => createHash('sha256').update(`gc:${clientKey(req)}`).digest('hex').slice(0, 16);
