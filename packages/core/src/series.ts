import { coverageEnd, coverageStart, type Dataset } from './dataset';
import { inter, ratio, groupBy } from './groupMetrics';
import { isVerified, snapshot, type Snapshot } from './snapshot';
import { addDays, diffDays, istDate, weekdayMon0 } from './time';
import { STATUSES, type Status } from './types';

export const FLOW_FIELDS = [
  'reported_reach_sum_nonunique', 'impressions', 'clicks', 'landing_page_sessions', 'registration_starts',
  'marketing_spend_inr', 'identified_external_people', 'engaged_people', 'broad_engaged_people',
  'registered_people', 'attended_people',
] as const;
type FlowKey = (typeof FLOW_FIELDS)[number];

export interface WeekMode {
  period_increment: Record<FlowKey, number> & { net_change_in_latest_confirmed_people: number };
  week_end_cumulative: Record<FlowKey, number> & { confirmed_people: number };
  week_end_status_by_person: Record<Status, number>;
  period_ratios_non_cohort: { clicks_per_impression: number | null; starts_per_session: number | null; registrations_per_click: number | null };
}
export interface WeekRow {
  from: string; through: string; days: number; target_version_at_end: string | null;
  campaigns: Record<string, { first_touch: WeekMode; registration_source: WeekMode; checkin_source_attendance_new: number }>;
}

export function weeklySeries(ds: Dataset): WeekRow[] {
  const ck = 'weekly';
  const hit = ds._cache.get(ck) as WeekRow[] | undefined;
  if (hit) return hit;
  let weekFirst = coverageStart(ds);
  const end = coverageEnd(ds);
  let previous = snapshot(ds, addDays(weekFirst, -1));
  const weeks: WeekRow[] = [];
  while (weekFirst <= end) {
    const sunday = addDays(weekFirst, 6 - weekdayMon0(weekFirst));
    const weekLast = sunday < end ? sunday : end;
    const current = snapshot(ds, weekLast);
    const week: WeekRow = {
      from: weekFirst, through: weekLast, days: diffDays(weekLast, weekFirst) + 1,
      target_version_at_end: current.target?.target_version ?? null, campaigns: {},
    };
    for (const [cid, row] of Object.entries(current.campaigns!)) {
      const prevRow = previous.campaigns![cid]!;
      const weekRow: any = {};
      for (const mode of ['first_touch', 'registration_source'] as const) {
        const nw = row[mode], old = prevRow[mode];
        const flow: any = {};
        for (const k of FLOW_FIELDS) flow[k] = nw[k] - old[k];
        flow.net_change_in_latest_confirmed_people = nw.confirmed_people - old.confirmed_people;
        const cum: any = {};
        for (const k of [...FLOW_FIELDS, 'confirmed_people'] as const) cum[k] = nw[k];
        weekRow[mode] = {
          period_increment: flow,
          week_end_cumulative: cum,
          week_end_status_by_person: nw.latest_status_by_person_distinct_within_status,
          period_ratios_non_cohort: {
            clicks_per_impression: ratio(flow.clicks, flow.impressions),
            starts_per_session: ratio(flow.registration_starts, flow.landing_page_sessions),
            registrations_per_click: ratio(flow.registered_people, flow.clicks),
          },
        };
      }
      weekRow.checkin_source_attendance_new = row.checkin_source.attended_people - prevRow.checkin_source.attended_people;
      week.campaigns[cid] = weekRow;
    }
    weeks.push(week);
    previous = current;
    weekFirst = addDays(weekLast, 1);
  }
  ds._cache.set(ck, weeks);
  return weeks;
}

/** Snapshot (no campaigns) for each day of coverage. */
export function dailyOverall(ds: Dataset, from = coverageStart(ds), through = coverageEnd(ds)): Snapshot[] {
  const out: Snapshot[] = [];
  for (let d = from; d <= through; d = addDays(d, 1)) out.push(snapshot(ds, d, false));
  return out;
}

export function dailyStatusTrend(ds: Dataset) {
  return dailyOverall(ds).map((s) => ({
    as_of: s.as_of,
    target_version: s.target ? s.target.target_version : null,
    registered_people: s.overall.registered_people,
    latest_external_registrations_by_status: s.overall.latest_status_by_registration,
    distinct_external_people_within_latest_status: s.overall.latest_status_by_person_distinct_within_status,
  }));
}

export interface AttendanceDay {
  external_verified_admission_events: number; unique_external_visitors_on_day: number;
  new_unique_external_visitors_since_prior_days: number; returning_unique_external_visitors: number;
}
/** Per IST check-in date; all external IDs (no first_seen filter). */
export function attendanceByDay(ds: Dataset): Record<string, AttendanceDay> {
  const byDay = groupBy(ds.checkins, (r) => istDate(r.t));
  const out: Record<string, AttendanceDay> = {};
  const seen = new Set<string>();
  for (const day of [...byDay.keys()].sort()) {
    const eligible = byDay.get(day)!.filter((r) => ds.externalIds.has(r.person_id) && isVerified(r));
    const visitors = new Set(eligible.map((r) => r.person_id));
    out[day] = {
      external_verified_admission_events: eligible.length,
      unique_external_visitors_on_day: visitors.size,
      new_unique_external_visitors_since_prior_days: [...visitors].filter((v) => !seen.has(v)).length,
      returning_unique_external_visitors: inter(visitors, seen).size,
    };
    for (const v of visitors) seen.add(v);
  }
  return out;
}

export { STATUSES };
