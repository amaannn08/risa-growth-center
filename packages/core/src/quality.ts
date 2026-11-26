import type { Dataset } from './dataset';
import { countBy, groupBy } from './groupMetrics';
import { isVerified } from './snapshot';
import { istDate, isoIST } from './time';

type R = Record<string, any>;
const sortedByIdT = (rows: R[], idf: string) =>
  [...rows].sort((a, b) => a.t - b.t || (a[idf] < b[idf] ? -1 : a[idf] > b[idf] ? 1 : 0));

/** IST calendar date of a table field (activity_date is already a date string). */
const dateOf = (row: R, f: string): string | null => {
  const v = row[f];
  if (v === null || v === undefined) return null;
  return f === 'activity_date' ? String(v) : istDate(Date.parse(v));
};

const TS_FIELDS: Record<string, string[]> = {
  event: ['history_start', 'history_end', 'event_starts_at', 'event_ends_at'],
  targets: ['effective_at'],
  campaigns: ['created_at', 'planned_start_at', 'planned_end_at'],
  daily_marketing: ['activity_date'],
  people: ['first_seen_at'],
  interactions: ['occurred_at'],
  registrations: ['registered_at'],
  registration_history: ['effective_at'],
  checkins: ['occurred_at'],
};
const SHEET_NAME: Record<string, string> = {
  read_me: 'Read me', field_guide: 'Field guide',
  event: 'Event', targets: 'Targets', campaigns: 'Campaigns', daily_marketing: 'Daily Marketing', people: 'People',
  interactions: 'Interest and Engagement', registrations: 'Registrations', registration_history: 'Registration History', checkins: 'Check-ins',
};

function coverage(rows: R[], key: string, available: (v: string) => boolean) {
  const ids: Record<string, number> = {};
  let n = 0;
  for (const r of rows) {
    const v = r[key];
    if (v === null || v === undefined) continue;
    if (!available(v)) { ids[v] = (ids[v] ?? 0) + 1; n++; }
  }
  return { rows: n, ids };
}
const hist = (m: Map<string, R[]>) => {
  const c: Record<string, number> = {};
  for (const rows of m.values()) c[rows.length] = (c[rows.length] ?? 0) + 1;
  return c;
};
const nested = (o: Record<string, Record<string, number>>) => o;

/** Port of audit.py collect_quality. Table-level dedupe stats come from ds.tableQuality (import_runs in the DB path). */
export function dataQuality(ds: Dataset) {
  const startDate = ds.event.history_start.slice(0, 10), endDate = ds.event.history_end.slice(0, 10);
  const people = ds.peopleById;
  const campaigns = ds.campaigns;
  const registrations = ds.regsById;
  const touches = ds.touches, history = ds.history, checkins = ds.checkins;
  const tables: Record<string, R[]> = {
    event: [ds.event], targets: ds.targets, campaigns: Object.values(campaigns), daily_marketing: ds.daily,
    people: ds.allPeople, interactions: touches, registrations: ds.regs, registration_history: history, checkins,
  };
  const before: Record<string, Record<string, number>> = {}, after: Record<string, Record<string, number>> = {};
  for (const [name, fields] of Object.entries(TS_FIELDS)) {
    const sheet = SHEET_NAME[name]!;
    after[sheet] = {}; before[sheet] = {};
    for (const f of fields) {
      after[sheet]![f] = tables[name]!.filter((r) => { const d = dateOf(r, f); return d !== null && d > endDate; }).length;
      before[sheet]![f] = tables[name]!.filter((r) => { const d = dateOf(r, f); return d !== null && d < startDate; }).length;
    }
  }
  const hasCampaign = (v: string) => v in campaigns;
  const hasPerson = (v: string) => people.has(v);
  const hasReg = (v: string) => registrations.has(v);
  const orphans: Record<string, any> = {
    'Daily Marketing': { campaign_id: coverage(ds.daily, 'campaign_id', hasCampaign) },
    People: { first_campaign_id: coverage(ds.allPeople, 'first_campaign_id', hasCampaign), person_id: coverage(ds.allPeople, 'person_id', hasPerson) },
    'Interest and Engagement': { campaign_id: coverage(touches, 'campaign_id', hasCampaign), person_id: coverage(touches, 'person_id', hasPerson) },
    Registrations: { campaign_id: coverage(ds.regs, 'campaign_id', hasCampaign), person_id: coverage(ds.regs, 'person_id', hasPerson) },
    'Registration History': {
      campaign_id: coverage(history, 'campaign_id', hasCampaign), person_id: coverage(history, 'person_id', hasPerson),
      registration_id: coverage(history, 'registration_id', hasReg),
    },
    'Check-ins': {
      campaign_id: coverage(checkins, 'campaign_id', hasCampaign), person_id: coverage(checkins, 'person_id', hasPerson),
      registration_id: coverage(checkins, 'registration_id', hasReg),
    },
  };
  const perReg = groupBy(history, (r) => r.registration_id);
  const reconfirmed: R[] = [];
  for (const [regId, entries] of perReg) {
    let cancelled: R | null = null;
    for (const row of sortedByIdT(entries, 'history_id')) {
      if (row.status === 'cancelled') cancelled = row;
      if (cancelled && row.status === 'confirmed') {
        reconfirmed.push({ registration_id: regId, person_id: row.person_id, campaign_id: row.campaign_id, cancelled_at: isoIST(cancelled.t), reconfirmed_at: isoIST(row.t) });
        break;
      }
    }
  }
  // audit.py iterates in sheet order (ascending registration_id in the supplied workbook); make that deterministic.
  reconfirmed.sort((a, b) => (a.registration_id < b.registration_id ? -1 : a.registration_id > b.registration_id ? 1 : 0));
  const externalChecks = checkins.filter((r) => people.get(r.person_id)?.person_type === 'external');
  const verifiedChecks = externalChecks.filter(isVerified);
  const scanner = new Set(verifiedChecks.filter((r) => r.source === 'scanner').map((r) => r.person_id));
  const manual = new Set(verifiedChecks.filter((r) => r.source === 'manual').map((r) => r.person_id));
  const pplIds = (rows: R[]) => new Set(rows.map((r) => r.person_id));
  const repeated = hist(groupBy(checkins, (r) => r.person_id));
  const extRepeats = hist(groupBy(externalChecks, (r) => r.person_id));
  const verRepeats = hist(groupBy(verifiedChecks, (r) => r.person_id));
  const nameCounts = countBy([...people.values()], (p) => p.person_name);
  const missingHistory = [...registrations.keys()].filter((id) => !perReg.has(id)).sort();
  orphans['Registrations'].missing_history = { rows: missingHistory.length, ids: missingHistory };
  const matching: Record<string, any> = {};
  const matchTables: [string, R[]][] = [
    ['Interest and Engagement', touches], ['Registrations', ds.regs], ['Registration History', history], ['Check-ins', checkins],
  ];
  for (const [name, rows] of matchTables) {
    const known = rows.filter((r) => people.has(r.person_id));
    const m: Record<string, number> = {
      first_touch_campaign_mismatch_rows: known.filter((r) => r.campaign_id !== people.get(r.person_id)!.first_campaign_id).length,
      both_campaigns_present_first_touch_mismatch_rows: rows.filter((r) => r.campaign_id && people.get(r.person_id)?.first_campaign_id && r.campaign_id !== people.get(r.person_id)!.first_campaign_id).length,
      activity_before_first_seen_rows: known.filter((r) => r.t < people.get(r.person_id)!.t).length,
    };
    if (name === 'Registration History' || name === 'Check-ins') {
      for (const f of ['person_id', 'campaign_id'])
        m[`registration_${f}_mismatch_rows`] = rows.filter((r) => registrations.has(r.registration_id) && r[f] !== registrations.get(r.registration_id)![f]).length;
    }
    matching[name] = m;
  }
  const breakdown = new Map<string, { person_type: string; result: string; verification: string; events: number }>();
  for (const r of checkins) {
    const person_type = people.get(r.person_id)?.person_type ?? 'unknown';
    const k = JSON.stringify([person_type, r.result, r.verification]);
    const e = breakdown.get(k);
    if (e) e.events++; else breakdown.set(k, { person_type, result: r.result, verification: r.verification, events: 1 });
  }
  const sortedBreakdown = [...breakdown.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, v]) => v);
  const fts: Record<string, Record<string, number>> = {};
  for (const p of people.values()) { (fts[p.person_type] ??= {})[p.first_touch_source] = (fts[p.person_type]![p.first_touch_source] ?? 0) + 1; }
  const ownerMismatch = (rows: R[], refField: string) =>
    rows.filter((r) => { const ref = r[refField]; return ref in campaigns && r.owner_id !== campaigns[ref]!.owner_id; }).length;
  const ownerTables: [string, R[], string][] = [
    ['Daily Marketing', ds.daily, 'campaign_id'], ['People', ds.allPeople, 'first_campaign_id'], ['Interest and Engagement', touches, 'campaign_id'],
    ['Registrations', ds.regs, 'campaign_id'], ['Registration History', history, 'campaign_id'], ['Check-ins', checkins, 'campaign_id'],
  ];
  const ownerIds: Record<string, Record<string, number>> = {
    Campaigns: countBy(Object.values(campaigns), (r) => String((r as R).owner_id)),
  };
  for (const [name, rows] of ownerTables) ownerIds[name] = countBy(rows, (r) => String(r.owner_id));
  const regsByPerson = groupBy(ds.regs, (r) => r.person_id);
  const verifiedExtUnattr = verifiedChecks.filter((r) => r.campaign_id === null);
  const tied = countBy(history, (r) => `${r.registration_id}|${r.t}`);
  return {
    tables: Object.fromEntries(Object.entries(ds.tableQuality).map(([k, v]) => [SHEET_NAME[k] ?? k, v])),
    before_history_start: before,
    after_history_end: after,
    orphan_foreign_keys: orphans,
    owner_reference_note: 'No independent team dictionary sheet is supplied. Campaigns provide the available owner reference.',
    owner_mismatch_against_campaign_rows: Object.fromEntries(ownerTables.map(([n, rows, ref]) => [n, ownerMismatch(rows, ref)])),
    owner_ids_by_table: nested(ownerIds),
    join_and_timing_checks: matching,
    people_by_type: countBy(people.values(), (p) => p.person_type),
    first_touch_sources_by_person_type: fts,
    shared_name_label_count: Object.values(nameCounts).filter((n) => n > 1).length,
    people_with_shared_name_label: Object.values(nameCounts).filter((n) => n > 1).reduce((s, n) => s + n, 0),
    registrations_by_type: countBy(ds.regs.filter((r) => people.has(r.person_id)), (r) => people.get(r.person_id)!.person_type),
    people_with_multiple_registration_ids: [...regsByPerson.values()].filter((v) => v.length > 1).length,
    registration_history_versions_by_status: countBy(history, (r) => r.status),
    registration_history_simultaneous_version_pairs: Object.values(tied).filter((n) => n > 1).length,
    registration_history_before_registration: history.filter((r) => registrations.has(r.registration_id) && r.t < registrations.get(r.registration_id)!.t).length,
    engagement_events_by_type: countBy(touches, (r) => r.event_type),
    checkins_by_type_result_verification: sortedBreakdown,
    checkins_by_result: countBy(checkins, (r) => r.result),
    checkins_by_verification: countBy(checkins, (r) => r.verification),
    checkins_by_source: countBy(checkins, (r) => r.source),
    checkin_attempt_histogram_all_people: repeated,
    checkin_attempt_histogram_external_people: extRepeats,
    verified_attempt_histogram_external_people: verRepeats,
    people_with_multiple_attempts_all: Object.entries(repeated).filter(([k]) => Number(k) > 1).reduce((s, [, n]) => s + n, 0),
    people_with_multiple_attempts_external: Object.entries(extRepeats).filter(([k]) => Number(k) > 1).reduce((s, [, n]) => s + n, 0),
    people_with_multiple_verified_attempts_external: Object.entries(verRepeats).filter(([k]) => Number(k) > 1).reduce((s, [, n]) => s + n, 0),
    unattributed_checkin_events: checkins.filter((r) => r.campaign_id === null).length,
    unattributed_unique_checkin_people: pplIds(checkins.filter((r) => r.campaign_id === null)).size,
    verified_external_unattributed_checkin_events: verifiedExtUnattr.length,
    verified_external_unattributed_checkin_people: pplIds(verifiedExtUnattr).size,
    verification_sources_external_people: {
      scanner_only: [...scanner].filter((p) => !manual.has(p)).length,
      manual_only: [...manual].filter((p) => !scanner.has(p)).length,
      both: [...scanner].filter((p) => manual.has(p)).length,
      scanner_total: scanner.size,
      manual_total: manual.size,
    },
    checkin_before_event_start: checkins.filter((r) => r.t < ds.eventMs.startsAt).length,
    checkin_after_event_end: checkins.filter((r) => r.t > ds.eventMs.endsAt).length,
    cancelled_then_reconfirmed_count: reconfirmed.length,
    cancelled_then_reconfirmed_by_campaign: countBy(reconfirmed, (r) => r.campaign_id),
    cancelled_then_reconfirmed_examples: reconfirmed.slice(0, 8),
    negative_daily_net_spend_rows: ds.daily.filter((r) => r.marketing_spend_inr < 0).map((r) => ({
      activity_id: r.activity_id, campaign_id: r.campaign_id, activity_date: r.activity_date + 'T00:00:00+05:30', marketing_spend_inr: r.marketing_spend_inr,
    })),
  };
}
