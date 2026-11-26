import { coverageEnd, type Dataset } from './dataset';
import { snapshot } from './snapshot';
import { addDays, diffDays, istDate } from './time';
import { UNATTR } from './types';
import { DEFAULT_ASSUMPTIONS, type Assumption } from './strategy/defaults';
import { lookup } from './strategy/model';

export interface ProjectionBand { low: number; mid: number; high: number }
export interface Projection {
  label: 'ASSUMPTION — linear run-rate, not a forecast guarantee';
  mode: 'actual' | 'projected'; as_of: string; days_left: number; current_registered: number;
  registrations: ProjectionBand; visitors: ProjectionBand;
  campaigns: { campaign_id: string; status: string; rate_7d: number; rate_14d: number; rate_28d: number; added: ProjectionBand }[];
  assumptions: { key: string; value: number; kind: 'sourced' | 'assumption' }[];
}

/** Deterministic linear run-rate projection of unique verified visitors on event day. */
export function projectVisitors(ds: Dataset, asOf: string, as: Assumption[] = DEFAULT_ASSUMPTIONS): Projection {
  const snap = snapshot(ds, asOf);
  const eventStart = istDate(ds.eventMs.startsAt), eventEnd = istDate(ds.eventMs.endsAt);
  const g = (k: string) => lookup(as, k, 'base');
  const assumptions = [
    { key: 'showup_low', value: g('showup_low'), kind: 'sourced' as const }, { key: 'showup_mid', value: g('showup_mid'), kind: 'assumption' as const },
    { key: 'showup_high', value: g('showup_high'), kind: 'sourced' as const }, { key: 'walkin_allowance', value: g('walkin_allowance'), kind: 'assumption' as const },
  ];
  const label = 'ASSUMPTION — linear run-rate, not a forecast guarantee' as const;
  if (asOf >= eventEnd) {
    const v = snap.overall.attended_people, r = snap.overall.registered_people;
    return { label, mode: 'actual', as_of: asOf, days_left: 0, current_registered: r, registrations: { low: r, mid: r, high: r }, visitors: { low: v, mid: v, high: v }, campaigns: [], assumptions };
  }
  const daysLeft = Math.max(0, diffDays(eventStart, asOf));
  const covStart = istDate(ds.eventMs.historyStart);
  const campaigns: Projection['campaigns'] = [];
  let addLow = 0, addMid = 0, addHigh = 0;
  for (const [cid, view] of Object.entries(snap.campaigns!)) {
    if (cid === UNATTR) continue;
    const status = String(ds.campaigns[cid]?.status ?? 'active');
    const rate = (n: number) => {
      const from = addDays(asOf, -n);
      const prev = from < covStart ? 0 : snapshot(ds, from).campaigns![cid]!.first_touch.registered_people;
      return (view.first_touch.registered_people - prev) / Math.min(n, Math.max(1, diffDays(asOf, covStart) + 1));
    };
    const r7 = rate(7), r14 = rate(14), r28 = rate(28);
    const active = status !== 'paused' && status !== 'stopped';
    const added = active
      ? { low: Math.min(r7, r14, r28) * daysLeft, mid: r14 * daysLeft, high: Math.max(r7, r14, r28) * daysLeft }
      : { low: 0, mid: 0, high: 0 };
    addLow += added.low; addMid += added.mid; addHigh += added.high;
    campaigns.push({ campaign_id: cid, status, rate_7d: r7, rate_14d: r14, rate_28d: r28, added });
  }
  const cur = snap.overall.registered_people;
  const regs = { low: cur + addLow, mid: cur + addMid, high: cur + addHigh };
  const walk = g('walkin_allowance');
  return {
    label, mode: 'projected', as_of: asOf, days_left: daysLeft, current_registered: cur,
    registrations: { low: Math.round(regs.low), mid: Math.round(regs.mid), high: Math.round(regs.high) },
    visitors: { low: Math.round(regs.low * g('showup_low') + walk), mid: Math.round(regs.mid * g('showup_mid') + walk), high: Math.round(regs.high * g('showup_high') + walk) },
    campaigns, assumptions,
  };
}

/** Project at each Sunday strictly before event start and compare with the final actual. Reports whatever it produces. */
export function projectionBacktest(ds: Dataset, as: Assumption[] = DEFAULT_ASSUMPTIONS) {
  const actual = snapshot(ds, coverageEnd(ds), false).overall.attended_people;
  const eventStart = istDate(ds.eventMs.startsAt);
  const rows: { as_of: string; days_left: number; low: number; mid: number; high: number; actual: number; error_mid: number; error_mid_pct: number; within_band: boolean }[] = [];
  let d = istDate(ds.eventMs.historyStart);
  while (new Date(d + 'T00:00:00Z').getUTCDay() !== 0) d = addDays(d, 1);
  for (; d < eventStart; d = addDays(d, 7)) {
    if (diffDays(d, istDate(ds.eventMs.historyStart)) < 28) continue; // need a full 28-day window
    const p = projectVisitors(ds, d, as);
    rows.push({ as_of: d, days_left: p.days_left, ...p.visitors, actual, error_mid: p.visitors.mid - actual, error_mid_pct: (p.visitors.mid - actual) / actual, within_band: actual >= p.visitors.low && actual <= p.visitors.high });
  }
  return rows;
}
