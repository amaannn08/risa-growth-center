import { BROAD, DELIVERY_OR_ACTION, STRONG, countBy, groupBy, groupMetrics, inter, minus, ratio, union, type GroupMetrics } from './groupMetrics';
import { prefixCount, type Dataset } from './dataset';
import { eodExclusive } from './time';
import { STATUSES, UNATTR, type CheckinRow, type HistoryRow, type Status, type TargetRow } from './types';

export const isVerified = (r: Pick<CheckinRow, 'result' | 'verification'>) => r.result === 'admitted' && r.verification === 'verified';

export interface TargetProgressItem { actual: number; goal: number; actual_minus_goal: number; fraction: number | null }
export interface OverallExtras {
  any_identified_interaction_people: number; opted_out_people: number; registrations_distinct_ids: number;
  latest_status_by_registration: Record<Status, number>; registrations_without_eligible_status: number;
  external_verified_admission_events: number; attended_with_admission_registration_id: number;
  attended_unregistered_people: number; attended_without_latest_confirmation: number;
  verified_visitor_cohort_by_latest_status: Record<Status, number>;
  identified_interaction_events_by_type: Record<string, number>;
}
export interface CheckinSource {
  attended_people: number; attended_people_any_verified_event_with_source: number; verified_admission_events: number;
  cpa_per_attendee_inr: number | null; same_source_registered_and_attended_people: number;
  same_source_confirmed_and_attended_people: number; same_source_match_share_of_registered: number | null;
}
export interface CampaignView {
  campaign_name: string;
  first_touch: GroupMetrics; registration_source: GroupMetrics; checkin_source: CheckinSource;
  opted_out_in_context_people: number; retained_first_touch_and_registration_source_people: number;
  exclusive_first_registration_source_attended_people: number;
}
export type TargetObj = Omit<TargetRow, 't'> & { effective_at: string };
export interface Snapshot {
  as_of: string;
  overall: GroupMetrics & OverallExtras;
  target: TargetObj | null;
  target_progress?: Record<'identified_external_people_goal' | 'registration_goal' | 'unique_external_visitors_goal' | 'marketing_budget_inr', TargetProgressItem>;
  campaigns?: Record<string, CampaignView>;
}

function lastBy<T, K>(rows: Iterable<T>, f: (r: T) => K): Map<K, T> {
  const m = new Map<K, T>();
  for (const r of rows) m.set(f(r), r);
  return m;
}
const idsOf = <T>(rows: Iterable<T>, f: (r: T) => string = (r: any) => r.person_id) => new Set<string>([...rows].map(f));

/** Port of audit.py Audit.snapshot. */
export function snapshot(ds: Dataset, asOf: string, includeCampaigns = true): Snapshot {
  const ck = `snap:${asOf}:${includeCampaigns}`;
  const hit = ds._cache.get(ck) as Snapshot | undefined;
  if (hit) return hit;
  const end = eodExclusive(asOf);
  const people = ds.people.slice(0, prefixCount(ds.people, end));
  const peopleIds = idsOf(people);
  const daily = ds.daily.filter((r) => r.activity_date <= asOf);
  const interactions = ds.touches.slice(0, prefixCount(ds.touches, end)).filter((r) => peopleIds.has(r.person_id));
  const engaged = idsOf(interactions.filter((r) => STRONG.has(r.event_type)));
  const broad = idsOf(interactions.filter((r) => BROAD.has(r.event_type)));
  const allInter = idsOf(interactions.filter((r) => DELIVERY_OR_ACTION.has(r.event_type)));
  const optOut = idsOf(interactions.filter((r) => r.event_type === 'opted_out'));
  const regs = ds.regs.slice(0, prefixCount(ds.regs, end)).filter((r) => peopleIds.has(r.person_id));
  const regIds = idsOf(regs, (r) => r.registration_id);
  const regPeople = idsOf(regs);
  const latest = lastBy(
    ds.history.slice(0, prefixCount(ds.history, end)).filter((r) => regIds.has(r.registration_id)),
    (r) => r.registration_id,
  );
  const statuses = {} as Record<Status, Set<string>>;
  for (const s of STATUSES) statuses[s] = idsOf([...latest.values()].filter((r) => r.status === s));
  const confirmed = statuses.confirmed;
  const earliestReg = new Map<string, (typeof regs)[number]>();
  for (const r of regs) if (!earliestReg.has(r.person_id)) earliestReg.set(r.person_id, r);
  const verifiedEvents = ds.checkins.slice(0, prefixCount(ds.checkins, end)).filter((r) => peopleIds.has(r.person_id) && isVerified(r));
  const firstVerified = new Map<string, CheckinRow>();
  for (const r of verifiedEvents) if (!firstVerified.has(r.person_id)) firstVerified.set(r.person_id, r);
  const attendees = new Set(firstVerified.keys());
  let target: TargetObj | null = null;
  for (const t of ds.targets) if (t.t < end) { const { t: _t, ...rest } = t; target = rest as TargetObj; }

  const overallBase = groupMetrics(daily, peopleIds, engaged, broad, regPeople, confirmed, attendees, statuses, regPeople, confirmed, attendees);
  const latestCounts = {} as Record<Status, number>;
  const cohortByStatus = {} as Record<Status, number>;
  for (const s of STATUSES) {
    latestCounts[s] = [...latest.values()].filter((r) => r.status === s).length;
    cohortByStatus[s] = inter(statuses[s], attendees).size;
  }
  const overall = {
    ...overallBase,
    any_identified_interaction_people: allInter.size,
    opted_out_people: optOut.size,
    registrations_distinct_ids: regIds.size,
    latest_status_by_registration: latestCounts,
    registrations_without_eligible_status: [...regIds].filter((id) => !latest.has(id)).length,
    external_verified_admission_events: verifiedEvents.length,
    attended_with_admission_registration_id: idsOf(verifiedEvents.filter((r) => r.registration_id !== null && regIds.has(r.registration_id))).size,
    attended_unregistered_people: minus(attendees, regPeople).size,
    attended_without_latest_confirmation: minus(attendees, confirmed).size,
    verified_visitor_cohort_by_latest_status: cohortByStatus,
    identified_interaction_events_by_type: countBy(interactions, (r) => r.event_type),
  };
  const out: Snapshot = { as_of: asOf, overall, target };
  if (target) {
    const achieved = {
      identified_external_people_goal: overall.identified_external_people,
      registration_goal: overall.registered_people,
      unique_external_visitors_goal: overall.attended_people,
      marketing_budget_inr: overall.marketing_spend_inr,
    } as const;
    const tp = {} as NonNullable<Snapshot['target_progress']>;
    for (const [k, v] of Object.entries(achieved) as [keyof typeof achieved, number][]) {
      const goal = Number(target[k]);
      tp[k] = { actual: v, goal, actual_minus_goal: v - goal, fraction: ratio(v, goal) };
    }
    out.target_progress = tp;
  }
  if (!includeCampaigns) { ds._cache.set(ck, out); return out; }

  const firstTouch = groupBy(people, (r) => r.first_campaign_id);
  const acquisition = groupBy(regs, (r) => r.campaign_id);
  const actionContext = groupBy(interactions, (r) => r.campaign_id);
  const admissionContext = groupBy(firstVerified.values(), (r) => r.campaign_id);
  const anyAdmission = groupBy(verifiedEvents, (r) => r.campaign_id);
  const dailyBy = groupBy(daily, (r) => r.campaign_id as string | null);
  const walkins = minus(attendees, regPeople);
  const campaigns: Record<string, CampaignView> = {};
  for (const cid of [...ds.campaignIds, null] as (string | null)[]) {
    const dayRows = dailyBy.get(cid) ?? [];
    const firstIds = idsOf(firstTouch.get(cid) ?? []);
    const acq = acquisition.get(cid) ?? [];
    const acqIds = idsOf(acq);
    const acqRegIds = idsOf(acq, (r) => r.registration_id);
    const ctx = actionContext.get(cid) ?? [];
    const actionEngaged = idsOf(ctx.filter((r) => STRONG.has(r.event_type)));
    const actionBroad = idsOf(ctx.filter((r) => BROAD.has(r.event_type)));
    const acqStatus = {} as Record<Status, Set<string>>;
    for (const s of STATUSES) acqStatus[s] = idsOf([...latest.entries()].filter(([id, r]) => acqRegIds.has(id) && r.status === s).map(([, r]) => r));
    const acqConfirmed = acqStatus.confirmed;
    let acquiredAttendees = inter(attendees, acqIds);
    if (cid === null) acquiredAttendees = union(acquiredAttendees, walkins);
    const direct = idsOf(admissionContext.get(cid) ?? []);
    const directAny = idsOf(anyAdmission.get(cid) ?? []);
    const ftStatus = {} as Record<Status, Set<string>>;
    for (const s of STATUSES) ftStatus[s] = inter(statuses[s], firstIds);
    const ftReg = inter(regPeople, firstIds), ftConf = inter(confirmed, firstIds), ftAtt = inter(attendees, firstIds);
    const ft = groupMetrics(dayRows, firstIds, inter(engaged, firstIds), inter(broad, firstIds), ftReg, ftConf, ftAtt, ftStatus, ftReg, ftConf, ftAtt);
    const rs = groupMetrics(dayRows, firstIds, actionEngaged, actionBroad, acqIds, acqConfirmed, acquiredAttendees, acqStatus, acqIds, acqConfirmed, attendees);
    const spend = dayRows.reduce((s, r) => s + r.marketing_spend_inr, 0);
    let exclusive = 0;
    for (const [pid, r] of earliestReg) if (r.campaign_id === cid && attendees.has(pid)) exclusive++;
    if (cid === null) exclusive += walkins.size;
    campaigns[cid ?? UNATTR] = {
      campaign_name: cid ? ds.campaigns[cid]!.campaign_name : 'Unattributed',
      first_touch: ft,
      registration_source: rs,
      checkin_source: {
        attended_people: direct.size,
        attended_people_any_verified_event_with_source: directAny.size,
        verified_admission_events: (anyAdmission.get(cid) ?? []).length,
        cpa_per_attendee_inr: cid ? ratio(spend, direct.size) : null,
        same_source_registered_and_attended_people: inter(direct, acqIds).size,
        same_source_confirmed_and_attended_people: inter(direct, acqConfirmed).size,
        same_source_match_share_of_registered: ratio(inter(direct, acqIds).size, acqIds.size),
      },
      opted_out_in_context_people: inter(optOut, idsOf(ctx)).size,
      retained_first_touch_and_registration_source_people: inter(firstIds, acqIds).size,
      exclusive_first_registration_source_attended_people: exclusive,
    };
    if (cid === null) for (const m of ['first_touch', 'registration_source'] as const) {
      campaigns[UNATTR]![m].rates.cpa_per_registration_inr = null;
      campaigns[UNATTR]![m].rates.cpa_per_attendee_inr = null;
    }
  }
  out.campaigns = campaigns;
  ds._cache.set(ck, out);
  return out;
}

export type { HistoryRow };
