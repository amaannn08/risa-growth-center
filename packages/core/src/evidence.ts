/**
 * One evidence shape for tasks/drafts: `{ items, as_of?, data_revision? }`. Legacy rows store a bare array.
 * Items issued by the Copilot carry a server-issued `ref` (the exact tool run that produced the figure): the chip's date/revision come from it,
 * never from the page the user happened to be on. An item without a resolvable ref is `verified: false`.
 */
export interface EvidenceRef {
  toolCallId: string; tool: string; /** path of the numeric field in the tool output */ metricField: string; unit: string;
  /** the figure exactly as the tool returned it (sign preserved: credits are negative) */ signedValue: number;
  attribution: string | null; asOf: string | null; revision: number | null;
  /** what the figure covers: `overall` / a campaign id / `event-wide` (e.g. budget headroom) / `range <from>..<through>`; null when the tool states no scope */ scope?: string | null;
}
export interface EvidenceItem { tool: string; metric: string; value: number | string; ref?: EvidenceRef | null; verified?: boolean }
export interface Evidence { items: EvidenceItem[]; as_of?: string | null; data_revision?: number | null }

const cleanRef = (r: any): EvidenceRef | null => (r && typeof r === 'object' && typeof r.toolCallId === 'string' && typeof r.tool === 'string' && typeof r.signedValue === 'number'
  ? { toolCallId: r.toolCallId, tool: r.tool, metricField: String(r.metricField ?? ''), unit: String(r.unit ?? ''), signedValue: r.signedValue, attribution: typeof r.attribution === 'string' ? r.attribution : null, asOf: typeof r.asOf === 'string' ? r.asOf : null, revision: typeof r.revision === 'number' ? r.revision : null, scope: typeof r.scope === 'string' ? r.scope : null }
  : null);

export function normalizeEvidence(raw: unknown): Evidence | null {
  if (raw == null) return null;
  const obj = Array.isArray(raw) ? { items: raw } : typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!obj || !Array.isArray(obj.items)) return null;
  const items: EvidenceItem[] = obj.items.filter((e: any) => e && typeof e === 'object' && (e.metric !== undefined || e.tool !== undefined))
    .map((e: any) => {
      const ref = cleanRef(e.ref);
      const item: EvidenceItem = { tool: String(e.tool ?? ''), metric: String(e.metric ?? ''), value: typeof e.value === 'number' ? e.value : String(e.value ?? '') };
      if (ref) item.ref = ref;
      if (typeof e.verified === 'boolean') item.verified = e.verified;
      return item;
    });
  if (!items.length) return null;
  const as_of = typeof obj.as_of === 'string' ? obj.as_of : null;
  const data_revision = typeof obj.data_revision === 'number' ? obj.data_revision : null;
  return { items, as_of, data_revision };
}

/** Provenance suffix for one item: the tool run's own date/revision, else the wrapper's (legacy), and an explicit marker when unverified. */
export const itemProvenance = (e: EvidenceItem, ev?: Pick<Evidence, 'as_of' | 'data_revision'>) => {
  // an unverified item never inherits the wrapper's date/revision (it is not backed by that tool run)
  const inherit = e.verified !== false;
  const asOf = e.ref?.asOf ?? (inherit ? ev?.as_of : null) ?? null, rev = e.ref?.revision ?? (inherit ? ev?.data_revision : null) ?? null;
  const scope = e.ref?.scope ? `scope ${e.ref.scope}` : '';
  const parts = [scope, asOf ? `as of ${asOf}` : '', rev != null ? `rev ${rev}` : '', e.verified === false ? 'unverified' : ''].filter(Boolean);
  return parts.length ? ` (${parts.join(', ')})` : '';
};
export const evidenceLabel = (ev: Evidence) => ev.items.map((e) => `${e.metric}: ${e.value}${itemProvenance(e, ev)}`).join('; ');

/** The tool's own rendering of a bound figure: sign, unit and scale preserved (credits stay negative, fractions shown as %). */
export function canonicalValue(ref: Pick<EvidenceRef, 'signedValue' | 'unit'>): string {
  const v = ref.signedValue, abs = Math.abs(v), sign = v < 0 ? '−' : '';
  const n = (x: number, dp?: number) => x.toLocaleString('en-US', { maximumFractionDigits: dp ?? (Number.isInteger(x) ? 0 : 2) });
  if (/inr|₹|rupee/i.test(ref.unit)) return `${sign}₹${n(abs)}`;
  if (ref.unit === 'fraction') return `${sign}${n(abs * 100, 2)}%`;
  if (ref.unit === 'percent') return `${sign}${n(abs, 2)}%`;
  return `${sign}${n(abs)}`;
}
