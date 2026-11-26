import { describe, expect, it } from 'vitest';
import { attendanceByDay, diagnose, medianDaysToConfirm, projectionBacktest, projectVisitors, recommendCampaigns, showUpByRegistrationWeek, whatIfShift, snapshot, buildDataset } from '../src';
import { ds as mk, loadRaw } from './helpers';

const ds = mk();
const dec = (asOf: string) => Object.fromEntries(recommendCampaigns(ds, asOf).map((r) => [r.campaign_id, r.decision]));

describe('recommendations §4.1', () => {
  it('post-event 04-20: C01,C04,C05,C06,C07 scale; C02,C03 stop', () => {
    expect(dec('2025-04-20')).toEqual({ C01: 'scale', C02: 'stop', C03: 'stop', C04: 'scale', C05: 'scale', C06: 'scale', C07: 'scale' });
  });
  it('pre-event 04-11: C02 change, C03 stop', () => {
    const d = dec('2025-04-11');
    expect(d.C02).toBe('change');
    expect(d.C03).toBe('stop');
    const c02 = recommendCampaigns(ds, '2025-04-11').find((r) => r.campaign_id === 'C02')!;
    expect(c02.reasons.find((r) => r.metric === 'registration_cpa')!.value).toBeCloseTo(136.76, 2);
    expect(c02.mode).toBe('pre_event');
  });
  it('reports the threshold that fired', () => {
    const c03 = recommendCampaigns(ds, '2025-04-20').find((r) => r.campaign_id === 'C03')!;
    expect(c03.fired.map((f) => f.metric).sort()).toEqual(['registered_show_up', 'visitor_cpa']);
    expect(c03.fired[0]).toMatchObject({ passed: true, kind: 'stop' });
  });
  it('guard: too few registrations → insufficient data', () => {
    expect(recommendCampaigns(ds, '2025-01-25').every((r) => r.decision === 'insufficient_data')).toBe(true);
  });
});

describe('what-if §4.5', () => {
  it('₹10k C02→C04 at 04-20: +124.19, −36.56, net ≈ +88', () => {
    const r = whatIfShift(ds, { from: 'C02', to: 'C04', amount: 10000, asOf: '2025-04-20' });
    expect(r.deltas.to).toBeCloseTo(124.19, 2);
    expect(r.deltas.from).toBeCloseTo(-36.56, 2);
    expect(r.net).toBeCloseTo(87.63, 2);
    expect(r.label).toBe('SCENARIO — not evidence');
    expect(r.caveats).toContain('marginal returns unmeasured');
  });
  it('diminishing applies 0.6 to the receiver; same-campaign errors', () => {
    const r = whatIfShift(ds, { from: 'C02', to: 'C04', amount: 10000, asOf: '2025-04-20', method: 'diminishing' });
    expect(r.deltas.to).toBeCloseTo(124.19 * 0.6, 1);
    expect(whatIfShift(ds, { from: 'C02', to: 'C02', amount: 1, asOf: '2025-04-20' }).error).toBeTruthy();
  });
});

describe('diagnose §4.2', () => {
  const f = diagnose(ds, '2025-04-20');
  it('stage leakage top: Paid confirmed→attended ≈107, then Paid identified→registered, then Creator show-up', () => {
    const sl = f.filter((x) => x.kind === 'stage_leakage');
    expect(sl[0]!.id).toBe('stage_leakage_confirmed_to_attended:C02:2025-04-20');
    expect(sl[0]!.evidence.lost).toBeCloseTo(107, 0);
    expect(sl[0]!.evidence.numerator).toBe(340);
    expect(sl[0]!.evidence.denominator).toBe(580);
    expect(sl[1]!.id).toBe('stage_leakage_identified_to_registered:C02:2025-04-20');
    expect(sl[2]!.campaign_id).toBe('C03');
    expect(sl[2]!.id).toContain('confirmed_to_attended');
  });
  it('portfolio gaps 700 and 575', () => {
    expect(f.find((x) => x.id.startsWith('portfolio_gap:identified_unregistered'))!.evidence.value).toBe(700);
    expect(f.find((x) => x.id.startsWith('portfolio_gap:confirmed_no_shows'))!.evidence.value).toBe(575);
  });
  it('trend breaks: C02 wk 03-09, C04 wk 03-09, C05 wk 03-23', () => {
    const ids = f.filter((x) => x.kind === 'trend_break').map((x) => x.id);
    expect(ids).toContain('trend_break:C02:2025-03-09');
    expect(ids).toContain('trend_break:C04:2025-03-09');
    expect(ids).toContain('trend_break:C05:2025-03-23');
    const c02 = f.find((x) => x.id === 'trend_break:C02:2025-03-09')!;
    expect([c02.evidence.numerator, c02.evidence.denominator]).toEqual([35, 871]);
    expect(c02.caveat).toMatch(/Cause not in data/);
    const c04 = f.find((x) => x.id === 'trend_break:C04:2025-03-09')!;
    expect([c04.evidence.numerator, c04.evidence.denominator]).toEqual([0, 464]);
  });
  it('budget + target gap; deterministic IDs', () => {
    expect(f.find((x) => x.kind === 'budget')!.evidence.value).toBe(274000);
    expect(f.find((x) => x.id.startsWith('target_gap:unique_external_visitors_goal'))!.evidence.numerator).toBe(2050);
    expect(new Set(f.map((x) => x.id)).size).toBe(f.length);
  });
  it('pre-event omits confirmed→attended', () => {
    expect(diagnose(ds, '2025-04-11').some((x) => x.id.includes('confirmed_to_attended'))).toBe(false);
  });
});

describe('projection §4.4', () => {
  it('post-event = actuals', () => {
    const p = projectVisitors(ds, '2025-04-20');
    expect(p.mode).toBe('actual');
    expect(p.visitors).toEqual({ low: 2050, mid: 2050, high: 2050 });
  });
  it('pre-event band is ordered; stopping a campaign lowers it', () => {
    const p = projectVisitors(ds, '2025-04-06');
    expect(p.mode).toBe('projected');
    expect(p.days_left).toBe(6);
    expect(p.visitors.low).toBeLessThanOrEqual(p.visitors.mid);
    expect(p.visitors.mid).toBeLessThanOrEqual(p.visitors.high);
    const raw = loadRaw();
    raw.campaigns = raw.campaigns.map((c) => (c.campaign_id === 'C01' ? { ...c, status: 'stopped' } : c));
    const stopped = projectVisitors(buildDataset(raw), '2025-04-06');
    expect(stopped.registrations.mid).toBeLessThan(p.registrations.mid);
    expect(stopped.visitors.mid).toBeLessThan(p.visitors.mid);
  });
  it('backtest runs and reports honestly', () => {
    const bt = projectionBacktest(ds);
    expect(bt.length).toBeGreaterThan(3);
    expect(bt.every((r) => r.actual === 2050)).toBe(true);
  });
});

describe('cohorts §4.3', () => {
  it('show-up by registration week sums to registered/attended', () => {
    const rows = showUpByRegistrationWeek(ds, '2025-04-20');
    expect(rows.reduce((s, r) => s + r.registered, 0)).toBe(2800);
    expect(rows.reduce((s, r) => s + r.attended, 0)).toBe(1925);
  });
  it('median days to confirm per campaign; day-1/day-2 new vs returning', () => {
    const m = medianDaysToConfirm(ds, '2025-04-20');
    expect(Object.keys(m)).toHaveLength(7);
    expect(Object.values(m).every((v) => v === null || v >= 0)).toBe(true);
    expect(attendanceByDay(ds)['2025-04-13']!.new_unique_external_visitors_since_prior_days).toBe(620);
  });
});

describe('snapshot headline numbers', () => {
  it('04-20 close', () => {
    const o = snapshot(ds, '2025-04-20').overall;
    expect([o.identified_external_people, o.engaged_people, o.registered_people, o.confirmed_people, o.attended_people, o.marketing_spend_inr]).toEqual([3625, 3317, 2800, 2500, 2050, 274000]);
    expect(o.rates.registered_show_up).toBeCloseTo(0.6875, 4);
    expect(o.rates.attendees_per_registration_headline_including_walkins).toBeCloseTo(0.73214, 4);
  });
});
