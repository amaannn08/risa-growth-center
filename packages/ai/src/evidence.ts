import { normalizeEvidence, type EvidenceItem, type EvidenceRef } from '@gc/core';

/** Everything one tool call contributes as citable evidence. Issued by the SERVER at call time; never read back from the client. */
export interface CallEvidence { toolCallId: string; tool: string; asOf: string | null; revision: number | null; refs: EvidenceRef[] }

const MAX_REFS = 500;
const unitFor = (path: string, units?: Record<string, string>): string => {
  const p = path.toLowerCase();
  if (/(_inr|spend|cost|cpa|cpm|amount|rupee|credit|headroom|budget|cap)\b|_inr/.test(p)) return 'INR';
  if (/(^|[._\]])(pct|rate|rates|fraction|share)\b|show_up|per_click|ctr|_pct/.test(p)) return 'fraction';
  if (/days/.test(p)) return 'days';
  if (units) { const k = Object.keys(units).find((u) => p.includes(u.toLowerCase())); if (k) return units[k]!; const first = Object.values(units)[0]; if (first && Object.keys(units).length === 1) return first; }
  return 'count';
};

/** One ref per numeric leaf of a tool output (plus numbers quoted inside short strings such as "50.70%"). */
export function issueRefs(toolCallId: string, tool: string, out: any): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  if (!out || typeof out !== 'object' || out.error) return refs;
  const base = { toolCallId, tool, attribution: typeof out.attribution === 'string' ? out.attribution : null, asOf: typeof out.as_of === 'string' ? out.as_of : null, revision: typeof out.data_revision === 'number' ? out.data_revision : null };
  const push = (metricField: string, signedValue: number, unit?: string) => { if (refs.length < MAX_REFS) refs.push({ ...base, metricField, unit: unit ?? unitFor(metricField, out.units), signedValue }); };
  const walk = (v: unknown, path: string, depth: number) => {
    if (refs.length >= MAX_REFS || depth > 8) return;
    if (typeof v === 'number') { if (Number.isFinite(v)) push(path, v); }
    else if (typeof v === 'string') {
      if (v.length > 300 || /^\d{4}-\d{2}-\d{2}/.test(v)) return;
      for (const m of v.matchAll(/(−|-)?(\d[\d,]*(?:\.\d+)?)(%)?/g)) {
        const n = Number(m[2]!.replace(/,/g, '')); if (Number.isFinite(n)) push(path, m[1] ? -n : n, m[3] ? 'percent' : undefined);
      }
    } else if (Array.isArray(v)) v.slice(0, 120).forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'units' || k === '_evidence') continue; walk(x, path ? `${path}.${k}` : k, depth + 1); }
  };
  walk(out, '', 0);
  return refs;
}

export const callEvidence = (toolCallId: string, tool: string, out: any): CallEvidence =>
  ({ toolCallId, tool, asOf: typeof out?.as_of === 'string' ? out.as_of : null, revision: typeof out?.data_revision === 'number' ? out.data_revision : null, refs: issueRefs(toolCallId, tool, out) });

/** What the MODEL sees: the output without the (large) server-side evidence block. */
export const stripEvidence = (out: any) => { if (out && typeof out === 'object' && '_evidence' in out) { const { _evidence: _e, ...rest } = out; return rest; } return out; };

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);

/**
 * Resolve a model-written evidence item against the tool runs of THIS turn. The match requires the same tool and the same signed figure
 * (to the written precision); among candidates the metric name's overlap with the field path decides. No match ⇒ `verified: false`, no ref.
 */
export function resolveEvidenceItem(item: { tool: string; metric: string; value: number | string }, calls: CallEvidence[]): EvidenceItem {
  const num = typeof item.value === 'number' ? item.value : Number(String(item.value).replace(/[₹,%\s]/g, '').replace('−', '-'));
  if (Number.isFinite(num) && !(typeof item.value === 'string' && /[→/]/.test(item.value))) {
    const dp = (String(item.value).split('.')[1] ?? '').replace(/\D/g, '').length;
    const tol = 0.5 * 10 ** -dp + 1e-9, want = tokens(item.metric);
    let best: { ref: EvidenceRef; score: number } | null = null;
    for (const c of calls) {
      if (c.tool !== item.tool) continue;
      for (const r of c.refs) {
        const exact = Math.abs(r.signedValue - num) <= tol, pct = Math.abs(r.signedValue * 100 - num) <= tol;
        if (!exact && !pct) continue;
        const score = tokens(r.metricField).filter((t) => want.includes(t)).length + (exact ? 0.5 : 0);
        if (!best || score >= best.score) best = { ref: r, score }; // ties → the latest run
      }
    }
    if (best) return { tool: item.tool, metric: item.metric, value: item.value, ref: best.ref, verified: true };
  }
  return { tool: item.tool, metric: item.metric, value: item.value, ref: null, verified: false };
}

/** Canonical stored evidence: items resolved from the turn's tool runs; wrapper date/revision only when every verified item agrees. */
export function buildEvidence(items: { tool: string; metric: string; value: number | string }[], calls: CallEvidence[]) {
  const resolved = items.map((i) => resolveEvidenceItem(i, calls));
  const refs = resolved.map((i) => i.ref).filter(Boolean) as EvidenceRef[];
  const same = <T,>(xs: T[]) => (xs.length && xs.every((x) => x === xs[0]) ? xs[0]! : null);
  return normalizeEvidence({ items: resolved, as_of: same(refs.map((r) => r.asOf)), data_revision: same(refs.map((r) => r.revision)) });
}
