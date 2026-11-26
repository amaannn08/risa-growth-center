import { STATUSES, type DailyRow, type Status } from './types';

export const PLATFORM = ['reported_reach', 'impressions', 'clicks', 'landing_page_sessions', 'registration_starts', 'marketing_spend_inr'] as const;
export const STRONG = new Set(['brochure_download', 'registration_start', 'event_question_submitted', 'nurture_email_clicked']);
export const BROAD = new Set([...STRONG, 'page_visit', 'nurture_email_opened']);
export const DELIVERY_OR_ACTION = new Set([...BROAD, 'nurture_email_sent', 'opted_out']);

/** ratio(n,d) = d ? round(n/d, 8) : null */
export function ratio(n: number, d: number): number | null {
  return d ? Math.round((n / d) * 1e8) / 1e8 : null;
}

export const inter = <T>(a: Set<T>, b: Set<T>): Set<T> => {
  const [s, l] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<T>();
  for (const x of s) if (l.has(x)) out.add(x);
  return out;
};
export const minus = <T>(a: Set<T>, b: Set<T>): Set<T> => {
  const out = new Set<T>();
  for (const x of a) if (!b.has(x)) out.add(x);
  return out;
};
export const union = <T>(a: Set<T>, b: Set<T>): Set<T> => new Set([...a, ...b]);
export const countBy = <T>(rows: Iterable<T>, f: (r: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const r of rows) { const k = f(r); out[k] = (out[k] ?? 0) + 1; }
  return out;
};
export const groupBy = <T, K>(rows: Iterable<T>, f: (r: T) => K): Map<K, T[]> => {
  const m = new Map<K, T[]>();
  for (const r of rows) { const k = f(r); const a = m.get(k); if (a) a.push(r); else m.set(k, [r]); }
  return m;
};

export interface PlatformTotals {
  reported_reach_sum_nonunique: number; impressions: number; clicks: number; landing_page_sessions: number;
  registration_starts: number; marketing_spend_inr: number; unique_reach: null;
  positive_daily_net_spend_inr: number; negative_daily_net_spend_inr: number;
}

export function platformTotals(rows: DailyRow[]): PlatformTotals {
  const sum = (f: (r: DailyRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    reported_reach_sum_nonunique: sum((r) => r.reported_reach),
    impressions: sum((r) => r.impressions),
    clicks: sum((r) => r.clicks),
    landing_page_sessions: sum((r) => r.landing_page_sessions),
    registration_starts: sum((r) => r.registration_starts),
    marketing_spend_inr: sum((r) => r.marketing_spend_inr),
    unique_reach: null,
    positive_daily_net_spend_inr: sum((r) => Math.max(0, r.marketing_spend_inr)),
    negative_daily_net_spend_inr: sum((r) => Math.min(0, r.marketing_spend_inr)),
  };
}

export interface Rates {
  clicks_per_impression: number | null; sessions_per_click: number | null; starts_per_session: number | null;
  identified_people_per_reported_reach_sum_directional: number | null; identified_people_per_session_directional: number | null;
  registrations_per_start_directional: number | null; registrations_per_click_directional: number | null;
  engaged_among_identified_people: number | null; registered_among_engaged_people: number | null;
  registered_among_identified_people: number | null; registered_per_identified_directional: number | null;
  confirmed_among_registered_people: number | null; attendees_per_registration_headline_including_walkins: number | null;
  registered_show_up: number | null; confirmed_show_up: number | null;
  cpa_per_registration_inr: number | null; cpa_per_attendee_inr: number | null;
  cpm_net_all_campaign_cost_inr: number | null; cpc_net_all_campaign_cost_inr: number | null;
}

export interface GroupMetrics extends PlatformTotals {
  identified_external_people: number; engaged_people: number; broad_engaged_people: number;
  registered_people: number; confirmed_people: number; attended_people: number;
  registered_and_attended_people: number; confirmed_and_attended_people: number;
  latest_status_by_person_distinct_within_status: Record<Status, number>;
  rates: Rates;
}

export function groupMetrics(
  daily: DailyRow[], people: Set<string>, engaged: Set<string>, broad: Set<string>, registered: Set<string>,
  confirmed: Set<string>, attendees: Set<string>, statuses: Record<Status, Set<string>>,
  registeredCohort: Set<string>, confirmedCohort: Set<string>, destination: Set<string>,
): GroupMetrics {
  const out = platformTotals(daily);
  const showups = inter(registeredCohort, destination).size;
  const confirmedShowups = inter(confirmedCohort, destination).size;
  const spend = out.marketing_spend_inr, click = out.clicks, sessions = out.landing_page_sessions, starts = out.registration_starts;
  const statusCounts = {} as Record<Status, number>;
  for (const s of STATUSES) statusCounts[s] = statuses[s].size;
  return {
    ...out,
    identified_external_people: people.size,
    engaged_people: engaged.size,
    broad_engaged_people: broad.size,
    registered_people: registered.size,
    confirmed_people: confirmed.size,
    attended_people: attendees.size,
    registered_and_attended_people: showups,
    confirmed_and_attended_people: confirmedShowups,
    latest_status_by_person_distinct_within_status: statusCounts,
    rates: {
      clicks_per_impression: ratio(click, out.impressions),
      sessions_per_click: ratio(sessions, click),
      starts_per_session: ratio(starts, sessions),
      identified_people_per_reported_reach_sum_directional: ratio(people.size, out.reported_reach_sum_nonunique),
      identified_people_per_session_directional: ratio(people.size, sessions),
      registrations_per_start_directional: ratio(registered.size, starts),
      registrations_per_click_directional: ratio(registered.size, click),
      engaged_among_identified_people: ratio(inter(people, engaged).size, people.size),
      registered_among_engaged_people: ratio(inter(registered, engaged).size, engaged.size),
      registered_among_identified_people: ratio(inter(registered, people).size, people.size),
      registered_per_identified_directional: ratio(registered.size, people.size),
      confirmed_among_registered_people: ratio(inter(confirmed, registered).size, registered.size),
      attendees_per_registration_headline_including_walkins: ratio(attendees.size, registered.size),
      registered_show_up: ratio(showups, registeredCohort.size),
      confirmed_show_up: ratio(confirmedShowups, confirmedCohort.size),
      cpa_per_registration_inr: ratio(spend, registered.size),
      cpa_per_attendee_inr: ratio(spend, attendees.size),
      cpm_net_all_campaign_cost_inr: ratio(spend * 1000, out.impressions),
      cpc_net_all_campaign_cost_inr: ratio(spend, click),
    },
  };
}
