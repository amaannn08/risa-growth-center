export const CAMPAIGN_COLORS: Record<string, string> = {
  C01: '#2563eb', C02: '#dc2626', C03: '#d97706', C04: '#059669', C05: '#7c3aed', C06: '#0891b2', C07: '#db2777', unattributed: '#64748b',
};
export const colorOf = (id: string) => CAMPAIGN_COLORS[id] ?? '#64748b';
export const DECISION_STYLE: Record<string, string> = {
  scale: 'bg-emerald-100 text-emerald-800', change: 'bg-amber-100 text-amber-800', stop: 'bg-red-100 text-red-800', insufficient_data: 'bg-slate-100 text-slate-600', insufficient_sample: 'bg-slate-100 text-slate-600', insufficient_evidence: 'bg-slate-100 text-slate-600', release: 'bg-emerald-100 text-emerald-800', hold: 'bg-amber-100 text-amber-800', scale_next_edition: 'bg-emerald-100 text-emerald-800', not_demonstrated: 'bg-amber-100 text-amber-800',
};
export const STATUS_STYLE: Record<string, string> = { active: 'bg-emerald-50 text-emerald-700', paused: 'bg-amber-50 text-amber-700', stopped: 'bg-slate-100 text-slate-600' };
export const TAG_STYLE: Record<string, string> = { S: 'bg-sky-100 text-sky-700', D: 'bg-emerald-100 text-emerald-700', A: 'bg-amber-100 text-amber-700' };
export const kindTag = (k: string) => (k === 'sourced' ? 'S' : k === 'data' ? 'D' : 'A');
