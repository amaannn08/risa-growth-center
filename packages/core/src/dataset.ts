import { dedupe } from './dedupe';
import { normTs, toMs } from './time';
import type {
  CampaignRow, CheckinRow, DailyRow, EventRow, HistoryRow, InteractionRow, PersonRow,
  RawInput, RegistrationRow, TableQuality, TargetRow,
} from './types';

type T<R> = R & { t: number };

export interface Dataset {
  event: EventRow & { history_start: string; history_end: string; event_starts_at: string; event_ends_at: string };
  eventMs: { historyStart: number; historyEnd: number; startsAt: number; endsAt: number };
  targets: T<TargetRow>[];
  campaigns: Record<string, CampaignRow>;
  campaignIds: string[];
  allPeople: T<PersonRow>[];
  peopleById: Map<string, T<PersonRow>>;
  /** external people only, sorted by first_seen_at */
  people: T<PersonRow>[];
  externalIds: Set<string>;
  touches: T<InteractionRow>[];
  regs: T<RegistrationRow>[];
  regsById: Map<string, T<RegistrationRow>>;
  history: T<HistoryRow>[];
  checkins: T<CheckinRow>[];
  daily: DailyRow[];
  tableQuality: Record<string, TableQuality>;
  fieldGuide: Record<string, unknown>[];
  readMe: Record<string, unknown>[];
  /** Mutable memo for snapshot()/series; one Dataset = one data revision. */
  _cache: Map<string, unknown>;
  /** data_revision this dataset was loaded at (0 for static files). */
  revision: number;
}

const byTId = (idf: string) => (a: any, b: any) =>
  a.t - b.t || (a[idf] < b[idf] ? -1 : a[idf] > b[idf] ? 1 : 0);

function prep<R extends Record<string, any>>(rows: R[], tsField: string, idField: string): T<R>[] {
  const out = rows.map((r) => {
    const iso = normTs(r[tsField]);
    return { ...r, [tsField]: iso, t: toMs(iso!) } as T<R>;
  });
  return out.sort(byTId(idField));
}

/** Dedupe + sort once per revision. `tableQuality` overrides computed quality (DB path: from import_runs). */
export function buildDataset(input: RawInput, opts: { tableQuality?: Record<string, TableQuality>; revision?: number } = {}): Dataset {
  const tq: Record<string, TableQuality> = {};
  const d = <R extends Record<string, any>>(name: string, rows: R[] | undefined): R[] => {
    const res = dedupe(name, (rows ?? []) as Record<string, unknown>[]);
    tq[name] = res.quality;
    return res.rows as R[];
  };
  const readMe = d('read_me', input.read_me);
  const fieldGuide = d('field_guide', input.field_guide);
  const eventRow = d('event', input.event)[0];
  if (!eventRow) throw new Error('Event sheet is empty');
  const event = { ...eventRow } as Dataset['event'];
  for (const f of ['history_start', 'history_end', 'event_starts_at', 'event_ends_at'] as const) event[f] = normTs(eventRow[f])!;
  const targets = prep(d('targets', input.targets), 'effective_at', 'effective_at');
  const campaignRows = d('campaigns', input.campaigns).map((c) => ({
    ...c, created_at: normTs(c.created_at)!, planned_start_at: normTs(c.planned_start_at)!, planned_end_at: normTs(c.planned_end_at)!,
  }));
  const campaigns: Record<string, CampaignRow> = {};
  for (const c of campaignRows) campaigns[c.campaign_id] = c;
  const daily = [...d('daily_marketing', input.daily_marketing)].sort((a, b) => (a.activity_date < b.activity_date ? -1 : a.activity_date > b.activity_date ? 1 : 0));
  const allPeople = prep(d('people', input.people), 'first_seen_at', 'person_id');
  const touches = prep(d('interactions', input.interactions), 'occurred_at', 'interaction_id');
  const regs = prep(d('registrations', input.registrations), 'registered_at', 'registration_id');
  const history = prep(d('registration_history', input.registration_history), 'effective_at', 'history_id');
  const checkins = prep(d('checkins', input.checkins), 'occurred_at', 'event_id');
  const people = allPeople.filter((p) => p.person_type === 'external');
  return {
    event,
    eventMs: {
      historyStart: toMs(event.history_start), historyEnd: toMs(event.history_end),
      startsAt: toMs(event.event_starts_at), endsAt: toMs(event.event_ends_at),
    },
    targets, campaigns, campaignIds: campaignRows.map((c) => c.campaign_id),
    allPeople, peopleById: new Map(allPeople.map((p) => [p.person_id, p])),
    people, externalIds: new Set(people.map((p) => p.person_id)),
    touches, regs, regsById: new Map(regs.map((r) => [r.registration_id, r])),
    history, checkins, daily,
    tableQuality: opts.tableQuality ?? tq, fieldGuide, readMe, _cache: new Map(), revision: opts.revision ?? 0,
  };
}

/** Number of leading elements with t < end in an array sorted by t. */
export function prefixCount(rows: { t: number }[], end: number): number {
  let lo = 0, hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]!.t < end) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export const coverageStart = (ds: Dataset) => ds.event.history_start.slice(0, 10);
export const coverageEnd = (ds: Dataset) => ds.event.history_end.slice(0, 10);
