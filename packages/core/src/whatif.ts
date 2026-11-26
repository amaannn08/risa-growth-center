import type { Dataset } from './dataset';
import { mode } from './recommend';
import { snapshot } from './snapshot';

export interface WhatIfInput {
  from: string; to: string; amount: number; asOf: string; method?: 'average_cpa' | 'diminishing';
  marginalEfficiency?: number; showUp?: number;
}
export interface WhatIfResult {
  label: 'SCENARIO — not evidence'; as_of: string; method: string; mode: 'pre_event' | 'post_event';
  baseline: Record<string, { name: string; spend: number; visitors: number; cpa: number | null }>;
  deltas: { from: number; to: number }; net: number; amount: number;
  assumptions: { key: string; value: number | string; kind: 'data' | 'assumption' }[]; caveats: string[]; error?: string;
}

/** Move `amount` INR between campaigns at historical average CPA (visitor CPA post-event; reg CPA × show-up pre-event). */
export function whatIfShift(ds: Dataset, i: WhatIfInput): WhatIfResult {
  const method = i.method ?? 'average_cpa';
  const snap = snapshot(ds, i.asOf);
  const m = mode(ds, i.asOf);
  const me = i.marginalEfficiency ?? 0.6, showUp = i.showUp ?? 0.7;
  const view = (id: string) => {
    const v = snap.campaigns?.[id];
    if (!v) throw new Error(`Unknown campaign ${id}`);
    return v;
  };
  const pre = m === 'pre_event';
  const cpa = (id: string) => (pre ? (() => { const r = view(id).first_touch.rates.cpa_per_registration_inr; return r === null ? null : r / showUp; })() : view(id).first_touch.rates.cpa_per_attendee_inr);
  const f = view(i.from), t = view(i.to);
  const baseline = {
    [i.from]: { name: f.campaign_name, spend: f.first_touch.marketing_spend_inr, visitors: f.first_touch.attended_people, cpa: cpa(i.from) },
    [i.to]: { name: t.campaign_name, spend: t.first_touch.marketing_spend_inr, visitors: t.first_touch.attended_people, cpa: cpa(i.to) },
  };
  const caveats = ['marginal returns unmeasured', 'capacity 1,800/day', 'observational attribution'];
  const assumptions: WhatIfResult['assumptions'] = [{ key: 'method', value: method, kind: 'assumption' }];
  const cf = cpa(i.from), ct = cpa(i.to);
  const base: Omit<WhatIfResult, 'deltas' | 'net'> = { label: 'SCENARIO — not evidence', as_of: i.asOf, method, mode: m, baseline, amount: i.amount, assumptions, caveats };
  if (i.from === i.to || !cf || !ct) return { ...base, deltas: { from: 0, to: 0 }, net: 0, error: i.from === i.to ? 'from and to must differ' : 'Visitor CPA unavailable for one campaign' };
  if (pre) assumptions.push({ key: 'show_up_assumption', value: showUp, kind: 'assumption' });
  let toDelta = i.amount / ct;
  if (method === 'diminishing') { toDelta *= me; assumptions.push({ key: 'marginal_efficiency', value: me, kind: 'assumption' }); }
  const fromDelta = -(i.amount / cf);
  if (i.amount > f.first_touch.marketing_spend_inr) caveats.push('amount exceeds the source campaign’s total net spend');
  return { ...base, deltas: { from: fromDelta, to: toDelta }, net: toDelta + fromDelta };
}
