import type { Dataset } from './dataset';
import { prefixCount } from './dataset';
import { groupBy, ratio } from './groupMetrics';
import { isVerified } from './snapshot';
import { eodExclusive, istDate, weekStart } from './time';

export interface RegWeekCohort { week_start: string; registered: number; confirmed_now: number; attended: number; show_up: number | null }

/** Show-up by registration week (IST Monday). External registrants identified by `asOf`. */
export function showUpByRegistrationWeek(ds: Dataset, asOf: string, campaignId?: string): RegWeekCohort[] {
  const end = eodExclusive(asOf);
  const regs = ds.regs.slice(0, prefixCount(ds.regs, end)).filter((r) => ds.externalIds.has(r.person_id) && (!campaignId || ds.peopleById.get(r.person_id)?.first_campaign_id === campaignId));
  const latest = new Map<string, string>();
  for (const h of ds.history.slice(0, prefixCount(ds.history, end))) latest.set(h.registration_id, h.status);
  const attended = new Set(ds.checkins.slice(0, prefixCount(ds.checkins, end)).filter(isVerified).map((c) => c.person_id));
  const rows: RegWeekCohort[] = [];
  const g = groupBy(regs, (r) => weekStart(istDate(r.t)));
  for (const wk of [...g.keys()].sort()) {
    const rs = g.get(wk)!;
    const att = rs.filter((r) => attended.has(r.person_id)).length;
    rows.push({ week_start: wk, registered: rs.length, confirmed_now: rs.filter((r) => latest.get(r.registration_id) === 'confirmed').length, attended: att, show_up: ratio(att, rs.length) });
  }
  return rows;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Median days from registration to the first `confirmed` history row, per first-touch campaign (null if none). */
export function medianDaysToConfirm(ds: Dataset, asOf: string): Record<string, number | null> {
  const end = eodExclusive(asOf);
  const firstConfirm = new Map<string, number>();
  for (const h of ds.history.slice(0, prefixCount(ds.history, end))) if (h.status === 'confirmed' && !firstConfirm.has(h.registration_id)) firstConfirm.set(h.registration_id, h.t);
  const byCampaign = new Map<string, number[]>();
  for (const r of ds.regs.slice(0, prefixCount(ds.regs, end))) {
    const c = firstConfirm.get(r.registration_id);
    const cid = ds.peopleById.get(r.person_id)?.first_campaign_id;
    if (c === undefined || !cid) continue;
    (byCampaign.get(cid) ?? byCampaign.set(cid, []).get(cid)!).push((c - r.t) / 86_400_000);
  }
  const out: Record<string, number | null> = {};
  for (const cid of ds.campaignIds) out[cid] = median(byCampaign.get(cid) ?? []);
  return out;
}
