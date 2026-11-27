import type { Q } from './client';

/** Next numeric suffix for user-created ids like `E-U12` (max existing + 1). */
export async function nextUserN(q: Q, table: string, col: string, prefixRegex: string): Promise<number> {
  const r = await q.query<{ n: number }>(
    `SELECT coalesce(max(substring(${col} from 'U([0-9]+)$')::int), 0) + 1 AS n FROM ${table} WHERE ${col} ~ $1`, [prefixRegex]);
  return Number(r[0]?.n ?? 1);
}
