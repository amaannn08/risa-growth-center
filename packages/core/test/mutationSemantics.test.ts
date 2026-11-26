import { describe, expect, it } from 'vitest';
import { buildDataset, snapshot, type RawInput } from '../src';
import { loadRaw } from './helpers';

const clone = (): RawInput => structuredClone(loadRaw());
const snap = (raw: RawInput, d: string) => snapshot(buildDataset(raw), d);
const base = buildDataset(loadRaw());

describe('mutation semantics (applied to raw data, then re-snapshotted)', () => {
  it('+₹1,000 C02 debit on 2025-04-16', () => {
    const raw = clone();
    raw.daily_marketing.push({ activity_id: 'AD-C02-0416-U1', campaign_id: 'C02', activity_date: '2025-04-16', impressions: 0, clicks: 0, reported_reach: 0, landing_page_sessions: 0, registration_starts: 0, marketing_spend_inr: 1000, platform: 'manual', campaign_name: 'Paid Social', owner_id: 'T04', owner_name: 'Arjun Verma' });
    const close = snap(raw, '2025-04-20');
    expect(close.overall.marketing_spend_inr).toBe(275000);
    expect(close.campaigns!.C02!.first_touch.marketing_spend_inr).toBe(94000);
    expect(close.campaigns!.C02!.first_touch.rates.cpa_per_attendee_inr).toBeCloseTo(276.47, 2);
    expect(close.target_progress!.marketing_budget_inr.goal - close.overall.marketing_spend_inr).toBe(25000);
    expect(snap(raw, '2025-04-13').overall.marketing_spend_inr).toBe(276500);
  });

  it('walk-in person + verified unattributed check-in → visitors 2,051, identified 3,626, show-up unchanged', () => {
    const raw = clone();
    raw.people.push({ person_id: 'E-U1', person_name: 'Walk In', person_type: 'external', first_seen_at: '2025-04-13T11:00:00+05:30', first_touch_source: 'walk_in', first_campaign_id: null, owner_id: null });
    raw.checkins.push({ event_id: 'CHK-U1', person_id: 'E-U1', registration_id: null, campaign_id: null, occurred_at: '2025-04-13T11:05:00+05:30', result: 'admitted', verification: 'verified', source: 'manual' });
    const o = snap(raw, '2025-04-20').overall;
    expect(o.attended_people).toBe(2051);
    expect(o.identified_external_people).toBe(3626);
    expect(o.registered_people).toBe(2800);
    expect(o.registered_and_attended_people).toBe(1925);
    expect(o.rates.registered_show_up).toBeCloseTo(0.6875, 6);
    expect(o.attended_unregistered_people).toBe(126);
  });

  it('extra verified event for an existing visitor → events 3,251, visitors 2,050', () => {
    const raw = clone();
    const first = raw.checkins.find((c) => c.result === 'admitted' && c.verification === 'verified' && base.externalIds.has(c.person_id))!;
    raw.checkins.push({ ...first, event_id: 'CHK-U2', occurred_at: '2025-04-13T18:00:00+05:30' });
    const o = snap(raw, '2025-04-20').overall;
    expect(o.external_verified_admission_events).toBe(3251);
    expect(o.attended_people).toBe(2050);
  });

  it('identical re-import → no change in any snapshot number', () => {
    const raw = clone();
    raw.daily_marketing.push({ ...raw.daily_marketing[0]! });
    raw.checkins.push({ ...raw.checkins[5]! });
    const b = JSON.stringify(snapshot(base, '2025-04-20'));
    expect(JSON.stringify(snap(raw, '2025-04-20'))).toBe(b);
    expect(buildDataset(raw).tableQuality.daily_marketing!.duplicate_extra_rows).toBe(3);
  });

  it('conflicting re-import throws (DB path rejects)', () => {
    const raw = clone();
    raw.daily_marketing.push({ ...raw.daily_marketing[0]!, marketing_spend_inr: 999999 });
    expect(() => buildDataset(raw)).toThrow(/conflicting/);
  });

  it('appended status change flips latest status only at/after effective_at', () => {
    const raw = clone();
    // a registration whose latest status through 04-08 is confirmed (confirmed row ≤ 04-05, nothing later before 04-09)
    const h = raw.registration_history.find((r) => r.status === 'confirmed' && r.effective_at > '2025-04-01' && r.effective_at < '2025-04-05T23:00:00+05:30'
      && base.peopleById.get(r.person_id)?.person_type === 'external'
      && !raw.registration_history.some((o) => o.registration_id === r.registration_id && o.effective_at > r.effective_at && o.effective_at < '2025-04-09'))!;
    expect(h).toBeTruthy();
    const at = '2025-04-08T10:00:00+05:30';
    raw.registration_history.push({ ...h, history_id: 'RH-U1', effective_at: at, status: 'cancelled' });
    const before = snap(raw, '2025-04-07').overall, after = snap(raw, '2025-04-08').overall;
    const orig7 = snapshot(base, '2025-04-07').overall, orig8 = snapshot(base, '2025-04-08').overall;
    expect(before.confirmed_people).toBe(orig7.confirmed_people);
    expect(after.confirmed_people).toBe(orig8.confirmed_people - 1);
    expect(after.latest_status_by_registration.cancelled).toBe(orig8.latest_status_by_registration.cancelled + 1);
  });

  it('first-touch C02 person registers under C04 and checks in under C03 → three attribution views', () => {
    const raw = clone();
    const registered = new Set(raw.registrations.map((r) => r.person_id));
    const p = raw.people.find((x) => x.person_type === 'external' && x.first_campaign_id === 'C02' && !registered.has(x.person_id))!;
    expect(p).toBeTruthy();
    const b = snapshot(base, '2025-04-20');
    raw.registrations.push({ registration_id: 'R-U1', person_id: p.person_id, campaign_id: 'C04', registered_at: '2025-04-05T10:00:00+05:30' });
    raw.registration_history.push({ history_id: 'RH-U1', registration_id: 'R-U1', person_id: p.person_id, campaign_id: 'C04', effective_at: '2025-04-05T10:00:00+05:30', status: 'interested' });
    raw.checkins.push({ event_id: 'CHK-U3', person_id: p.person_id, registration_id: 'R-U1', campaign_id: 'C03', occurred_at: '2025-04-12T12:00:00+05:30', result: 'admitted', verification: 'verified', source: 'scanner' });
    const s = snap(raw, '2025-04-20');
    expect(s.overall.registered_people).toBe(b.overall.registered_people + 1);
    expect(s.overall.attended_people).toBe(b.overall.attended_people + 1);
    // first-touch credit → C02
    expect(s.campaigns!.C02!.first_touch.registered_people).toBe(b.campaigns!.C02!.first_touch.registered_people + 1);
    expect(s.campaigns!.C02!.first_touch.attended_people).toBe(b.campaigns!.C02!.first_touch.attended_people + 1);
    // registration-source → C04
    expect(s.campaigns!.C04!.registration_source.registered_people).toBe(b.campaigns!.C04!.registration_source.registered_people + 1);
    expect(s.campaigns!.C04!.registration_source.attended_people).toBe(b.campaigns!.C04!.registration_source.attended_people + 1);
    // check-in-source → C03
    expect(s.campaigns!.C03!.checkin_source.attended_people).toBe(b.campaigns!.C03!.checkin_source.attended_people + 1);
    expect(s.campaigns!.C02!.checkin_source.attended_people).toBe(b.campaigns!.C02!.checkin_source.attended_people);
  });

  it('new target version changes progress', () => {
    const raw = clone();
    raw.targets.push({ effective_at: '2025-04-01T09:00:00+05:30', identified_external_people_goal: 3600, registration_goal: 3200, unique_external_visitors_goal: 2500, marketing_budget_inr: 300000, target_version: 'Stretch visitors' });
    const s = snap(raw, '2025-04-20');
    expect(s.target!.target_version).toBe('Stretch visitors');
    expect(s.target_progress!.unique_external_visitors_goal.fraction).toBeCloseTo(0.82, 4);
    expect(snap(raw, '2025-03-31').target!.target_version).toBe('Attendee revised plan');
  });
});
