/** One evidence shape for tasks/drafts: `{ items, as_of?, data_revision? }`. Legacy rows store a bare array. */
export interface EvidenceItem { tool: string; metric: string; value: number | string }
export interface Evidence { items: EvidenceItem[]; as_of?: string | null; data_revision?: number | null }

export function normalizeEvidence(raw: unknown): Evidence | null {
  if (raw == null) return null;
  const obj = Array.isArray(raw) ? { items: raw } : typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!obj || !Array.isArray(obj.items)) return null;
  const items = obj.items.filter((e: any) => e && typeof e === 'object' && (e.metric !== undefined || e.tool !== undefined))
    .map((e: any) => ({ tool: String(e.tool ?? ''), metric: String(e.metric ?? ''), value: typeof e.value === 'number' ? e.value : String(e.value ?? '') }));
  if (!items.length) return null;
  const as_of = typeof obj.as_of === 'string' ? obj.as_of : null;
  const data_revision = typeof obj.data_revision === 'number' ? obj.data_revision : null;
  return { items, as_of, data_revision };
}

export const evidenceLabel = (ev: Evidence) =>
  `${ev.items.map((e) => `${e.metric}: ${e.value}`).join('; ')}${ev.as_of || ev.data_revision != null ? ` (${[ev.as_of ? `as of ${ev.as_of}` : '', ev.data_revision != null ? `rev ${ev.data_revision}` : ''].filter(Boolean).join(', ')})` : ''}`;
