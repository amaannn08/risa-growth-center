import type { Recommendation } from '@gc/core';
import { DECISION_STYLE } from '@/lib/ui';

const LABEL: Record<string, string> = { scale: 'Scale', change: 'Change', stop: 'Stop', insufficient_data: 'Insufficient data' };
const fmtV = (m: string, v: number | null) => (v === null ? '—' : /show_up|per_registered/.test(m) ? `${(v * 100).toFixed(1)}%` : `₹${v.toFixed(2)}`);
const fmtT = (m: string, v: number) => (/show_up|per_registered/.test(m) ? `${v * 100}%` : `₹${v}`);

export function DecisionBadge({ rec }: { rec: Recommendation }) {
  const lines = rec.reasons.map((r) => `${r.kind} if ${r.metric} ${r.op} ${fmtT(r.metric, r.threshold)}: ${fmtV(r.metric, r.value)} → ${r.passed ? 'yes' : 'no'}`);
  const tip = `${rec.mode === 'post_event' ? 'Post-event' : 'Pre-event'} rules (first-touch)\n${lines.join('\n')}${rec.decision === 'insufficient_data' ? `\nregistered ${rec.registered} below minimum` : ''}`;
  return <span title={tip} data-testid={`decision-${rec.campaign_id}`} className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${DECISION_STYLE[rec.decision]}`}>{LABEL[rec.decision]}</span>;
}
