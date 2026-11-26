import type { TableQuality } from './types';

export const KEYS: Record<string, string[]> = {
  read_me: ['topic', 'description'],
  field_guide: ['source_table', 'field'],
  event: ['event_name'],
  targets: ['effective_at'],
  campaigns: ['campaign_id'],
  daily_marketing: ['activity_id'],
  people: ['person_id'],
  interactions: ['interaction_id'],
  registrations: ['registration_id'],
  registration_history: ['history_id'],
  checkins: ['event_id'],
};

type Row = Record<string, unknown>;

function same(a: Row, b: Row): boolean {
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => a[k] === b[k] || (a[k] == null && b[k] == null));
}

/** Identical repeats are counted as duplicate_extra_rows; conflicting repeats or a missing key throw. */
export function dedupe<T extends Row>(table: string, raw: T[]): { rows: T[]; quality: TableQuality } {
  const keyFields = KEYS[table];
  if (!keyFields) throw new Error(`No key defined for ${table}`);
  const unique = new Map<string, T>();
  const retries = new Map<string, { key: unknown[]; extra_rows: number }>();
  const rawNulls: Record<string, number> = {};
  let rawRows = 0;
  for (const row of raw) {
    if (!Object.values(row).some((v) => v !== null && v !== undefined)) continue; // padding
    rawRows++;
    for (const [c, v] of Object.entries(row)) if (v === null || v === undefined) rawNulls[c] = (rawNulls[c] ?? 0) + 1;
    const keyVals = keyFields.map((k) => row[k]);
    if (keyVals.some((v) => v === null || v === undefined)) throw new Error(`${table} has a missing key`);
    const key = JSON.stringify(keyVals);
    const prior = unique.get(key);
    if (prior) {
      if (!same(prior, row)) throw new Error(`${table} has conflicting values for key ${key}`);
      const r = retries.get(key);
      if (r) r.extra_rows++;
      else retries.set(key, { key: keyVals, extra_rows: 1 });
    } else unique.set(key, row);
  }
  const rows = [...unique.values()];
  const dedupedNulls: Record<string, number> = {};
  for (const row of rows) for (const [c, v] of Object.entries(row)) if (v === null || v === undefined) dedupedNulls[c] = (dedupedNulls[c] ?? 0) + 1;
  const dupKeys = [...retries.values()];
  return {
    rows,
    quality: {
      raw_rows: rawRows,
      unique_rows: rows.length,
      duplicate_extra_rows: dupKeys.reduce((s, r) => s + r.extra_rows, 0),
      duplicate_keys: dupKeys,
      raw_nulls: rawNulls,
      deduped_nulls: dedupedNulls,
    },
  };
}
