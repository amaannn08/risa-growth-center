import { canonicalValue, normalizeEvidence, type EvidenceItem, type EvidenceRef } from '@gc/core';
import { explicitDates, namedCheckpointDates } from './grounding';

/** Everything one tool call contributes as citable evidence. Issued by the SERVER at call time; never read back from the client. */
export interface CallEvidence { toolCallId: string; tool: string; asOf: string | null; revision: number | null; refs: EvidenceRef[]; /** named checkpoints (event close, data close, day 1) as resolved to dates by this run */ checkpoints?: Record<string, string> | null }

const MAX_REFS = 500;
const INR_METRIC_RE = /spen[dt]|cost|cpa|cpm|budget|credit|headroom|amount/i, FRACTION_METRIC_RE = /show_?up|ctr|rate|per_|share|conversion|fraction/i;
/** Unit of a numeric field: a definite unit when the path or the tool's own metric names one, else `unknown` (a wildcard for unit checks). */
const LOOSE_UNIT_TOOLS = new Set(['get_strategy_model', 'list_experiments', 'list_tasks', 'describe_data', 'what_if', 'get_targets', 'propose_task', 'propose_campaign_change']);
const unitFor = (path: string, units?: Record<string, string>, metric?: string, loose = false): string => {
  const p = path.toLowerCase();
  if (/(_inr|spend|cost|cpa|cpm|amount|rupee|credit|headroom|budget|cap)\b|_inr/.test(p)) return 'INR';
  if (/(^|[._\]])(pct|rate|rates|fraction|share)\b|show_up|per_click|ctr|_pct/.test(p)) return 'fraction';
  if (/days/.test(p)) return 'days';
  if (loose) return 'unknown'; // planning / strategy / config outputs mix units in free text: never a basis for a unit verdict
  if (metric && /(^|\.|\])(value|numerator)$/.test(p) && !/clicks_in_period/.test(p)) return INR_METRIC_RE.test(metric) ? 'INR' : FRACTION_METRIC_RE.test(metric) ? 'fraction' : 'count';
  if (/(visitor|people|person|registr|confirm|click|impression|session|attend|admission|event|check|count|cancel|waitlist|interest|identified|engaged|reach|no_show|starts|_n$|denominator|total|rank|clubs|visits|regs)/.test(p)) return 'count';
  if (units) { const k = Object.keys(units).find((u) => p.includes(u.toLowerCase())); if (k) return units[k]!; const first = Object.values(units)[0]; if (first && Object.keys(units).length === 1) return first; }
  return 'unknown';
};

/** One ref per numeric leaf of a tool output (plus numbers quoted inside short strings such as "50.70%"). */
export function issueRefs(toolCallId: string, tool: string, out: any): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  if (!out || typeof out !== 'object' || out.error) return refs;
  const base = { toolCallId, tool, attribution: typeof out.attribution === 'string' ? out.attribution : null, asOf: typeof out.as_of === 'string' ? out.as_of : null, revision: typeof out.data_revision === 'number' ? out.data_revision : null };
  // scope of a figure: ranged ledger figures carry their bounds, budget headroom is event-wide, checkpoint rows carry their own date
  const callScope = typeof out.scope === 'string' ? out.scope : null;
  const ranged = out.range && out.range.cumulative === false ? `range ${out.range.from}..${out.range.through}` : null;
  const RANGE_FIELDS = /^(?:credits(?:\[|$)|credits_total_inr$|gross_positive_spend_inr$|net_spend_inr$)/;
  const scopeAt = (path: string): { scope: string | null; asOf: string | null } => {
    const cp = /^checkpoints\[(\d+)\]\./.exec(path);
    const cpDate = cp ? out.checkpoints?.[Number(cp[1])]?.date : null;
    if (/(^|\.)(event_wide_\w+|event_net_spend_overall_inr|budget_cap_headroom_inr)$/.test(path) || /\.event_wide_|\.event_net_spend_overall_inr$/.test(path)) return { scope: 'event-wide', asOf: cpDate ?? base.asOf };
    if (/^programme_reference\./.test(path)) return { scope: 'overall', asOf: base.asOf };
    if (cpDate) return { scope: callScope, asOf: cpDate };
    const cr = /^credits\[(\d+)\]\./.exec(path); // a credit row belongs to the campaign it was posted to
    if (cr) return { scope: out.credits?.[Number(cr[1])]?.campaign_id ?? callScope, asOf: base.asOf };
    return { scope: ranged && RANGE_FIELDS.test(path) ? ranged : callScope, asOf: base.asOf };
  };
  const push = (metricField: string, signedValue: number, unit?: string) => {
    if (refs.length >= MAX_REFS) return;
    const sc = scopeAt(metricField);
    refs.push({ ...base, asOf: sc.asOf, scope: sc.scope, metricField, unit: tool === 'calculate' ? 'unknown' : unit ?? unitFor(metricField, out.units, typeof out.metric === 'string' ? out.metric : undefined, LOOSE_UNIT_TOOLS.has(tool)), signedValue });
  };
  const walk = (v: unknown, path: string, depth: number) => {
    if (refs.length >= MAX_REFS || depth > 8) return;
    if (typeof v === 'number') { if (Number.isFinite(v)) push(path, v); }
    else if (typeof v === 'string') {
      if (v.length > 300 || /^\d{4}-\d{2}-\d{2}/.test(v)) return;
      for (const m of v.matchAll(/(−|-)?(\d[\d,]*(?:\.\d+)?)(%)?/g)) {
        const n = Number(m[2]!.replace(/,/g, '')); if (Number.isFinite(n)) push(path, m[1] ? -n : n, m[3] ? 'percent' : undefined);
      }
    } else if (Array.isArray(v)) v.slice(0, 120).forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'units' || k === '_evidence' || (tool === 'calculate' && k === 'expression')) continue; walk(x, path ? `${path}.${k}` : k, depth + 1); }
  };
  walk(out, '', 0);
  return refs;
}

export const callEvidence = (toolCallId: string, tool: string, out: any): CallEvidence =>
  ({ toolCallId, tool, asOf: typeof out?.as_of === 'string' ? out.as_of : null, revision: typeof out?.data_revision === 'number' ? out.data_revision : null, refs: issueRefs(toolCallId, tool, out),
    checkpoints: out?.checkpoint_dates && typeof out.checkpoint_dates === 'object' ? out.checkpoint_dates : null });

/** What the MODEL sees: the output without the (large) server-side evidence block. */
export const stripEvidence = (out: any) => { if (out && typeof out === 'object' && '_evidence' in out) { const { _evidence: _e, ...rest } = out; return rest; } return out; };

const tokens = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);

const INR_METRIC = /\b(?:spen[dt]|spending|cost|costs|cpa|cpm|budget|credits?|debits?|refunds?|headroom|cap|rupees?|inr|net|gross|postings?)\b/i;
const COUNT_METRIC = /\b(?:visitors?|people|persons?|registrations?|registered|attendees?|admissions?|admitted|check-?ins?|clicks?|impressions|sessions|scanner|scans?|confirmed|cancel\w*|waitlist\w*|no-?shows?|events?)\b/i;
const isInr = (u: string) => /inr|₹|rupee/i.test(u);
export interface EvidenceClaim { tool: string; metric: string; value: number | string; /** the tool call that produced the figure */ call_id?: string; /** path of the field in that call's output */ field?: string; as_of?: string }

/** Why a candidate ref cannot support the claim (sign, unit, metric family, checkpoint scope); null when it can. */
function refConflict(item: EvidenceClaim, r: EvidenceRef, c: CallEvidence): string | null {
  const text = String(item.value), written = Number(text.replace(/[₹,%\s+]/g, '').replace('−', '-'));
  const neg = /^\s*[−-]/.test(text) || written < 0;
  if (neg && r.signedValue > 0) return 'sign';
  if (/^\s*\+/.test(text) && r.signedValue < 0) return 'sign';
  if (/₹|rs\.?\s?\d/i.test(text) && r.unit !== 'unknown' && !isInr(r.unit)) return 'unit';
  if (/%/.test(text) && r.unit !== 'unknown' && !/fraction|percent|pct|rate/.test(r.unit)) return 'unit';
  if (r.unit !== 'unknown') {
    const inrM = INR_METRIC.test(item.metric), cntM = COUNT_METRIC.test(item.metric);
    if (isInr(r.unit) && cntM && !inrM && !/₹/.test(text)) return 'metric';
    if (!isInr(r.unit) && !/fraction|percent|pct|rate/.test(r.unit) && inrM && !cntM) return 'metric';
  }
  const wanted = namedCheckpointDates(`${item.metric} ${item.as_of ?? ''}`, c.checkpoints ?? null);
  if (wanted.length && !/^range /.test(r.scope ?? '') && r.asOf && !wanted.includes(r.asOf)) return 'scope';
  const dated = explicitDates(item.as_of ?? '', null);
  if (dated.length && r.asOf && !dated.includes(r.asOf)) return 'scope';
  return null;
}

/**
 * Resolve a model-written evidence item against the tool runs of THIS turn. The item should name the exact `call_id` and `field`; without them
 * the match requires the same tool and the same SIGNED figure (to the written precision) and the metric name's overlap with the field path decides.
 * A figure whose sign, unit, metric family or checkpoint scope disagrees with the field is never bound: `verified: false`, no ref.
 * A verified item stores the tool's canonical value, not the model's wording of it.
 */
export function resolveEvidenceItem(item: EvidenceClaim, calls: CallEvidence[]): EvidenceItem {
  const num = typeof item.value === 'number' ? item.value : Number(String(item.value).replace(/[₹,%\s+]/g, '').replace('−', '-'));
  const unverified = (): EvidenceItem => ({ tool: item.tool, metric: item.metric, value: item.value, ref: null, verified: false });
  if (!Number.isFinite(num) || (typeof item.value === 'string' && /[→/]/.test(item.value))) return unverified();
  const dp = (String(item.value).split('.')[1] ?? '').replace(/\D/g, '').length;
  const tol = 0.5 * 10 ** -dp + 1e-9, want = tokens(item.metric);
  let best: { ref: EvidenceRef; score: number } | null = null;
  for (const c of calls) {
    if (c.tool !== item.tool || (item.call_id && c.toolCallId !== item.call_id)) continue;
    for (const r of c.refs) {
      if (item.field && r.metricField !== item.field) continue;
      const exact = Math.abs(r.signedValue - num) <= tol, pct = Math.abs(r.signedValue * 100 - num) <= tol && /%/.test(String(item.value)) && /fraction/.test(r.unit);
      const flipped = !exact && !pct && Math.abs(r.signedValue + num) <= tol; // same magnitude, opposite sign: a sign reversal, never a match
      if (flipped || (!exact && !pct) || refConflict(item, r, c)) continue;
      const score = tokens(r.metricField).filter((t) => want.includes(t)).length + (exact ? 0.5 : 0) + (item.field ? 10 : 0);
      if (!best || score >= best.score) best = { ref: r, score }; // ties → the latest run
    }
  }
  return best ? { tool: item.tool, metric: item.metric, value: canonicalValue(best.ref), ref: best.ref, verified: true } : unverified();
}

/** Canonical stored evidence: items resolved from the turn's tool runs; wrapper date/revision only when EVERY item is verified and they agree. */
export function buildEvidence(items: EvidenceClaim[], calls: CallEvidence[]) {
  const resolved = items.map((i) => resolveEvidenceItem(i, calls));
  const refs = resolved.map((i) => i.ref).filter(Boolean) as EvidenceRef[];
  const same = <T,>(xs: T[]) => (xs.length && xs.every((x) => x === xs[0]) ? xs[0]! : null);
  const all = resolved.every((i) => i.verified);
  return normalizeEvidence({ items: resolved, as_of: all ? same(refs.map((r) => r.asOf)) : null, data_revision: all ? same(refs.map((r) => r.revision)) : null });
}
