import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ASSUMPTIONS, EXPERIMENTS, adjudicateExperiment, evaluateExperiment, normalizeEvidence, snapshot, strategyModel, weekIsRunning, weeklySeries, type Assumption,
} from '../src';
import { ds } from './helpers';

const D = ds();
const withA = (key: string, scenario: 'base' | 'stretch', value: number): Assumption[] => DEFAULT_ASSUMPTIONS.map((a) => (a.key === key && (a.scenario === scenario || a.scenario === 'all') ? { ...a, value } : a));

describe('as-of cutoff for periodic series', () => {
  it('weekly series clipped at Monday 3 Mar carries only what was posted by EOD 3 Mar and is partial', () => {
    const clipped = weeklySeries(D, '2025-03-03'), full = weeklySeries(D);
    const w = clipped[clipped.length - 1]!, fw = full.find((x) => x.from === '2025-03-03')!;
    expect(w.from).toBe('2025-03-03'); expect(w.through).toBe('2025-03-03'); expect(weekIsRunning(w)).toBe(true);
    const posted = D.daily.filter((r) => r.campaign_id === 'C02' && r.activity_date === '2025-03-03').reduce((t, r) => t + r.marketing_spend_inr, 0);
    expect(w.campaigns.C02!.first_touch.period_increment.marketing_spend_inr).toBe(posted);
    expect(posted).toBe(0);
    expect(fw.campaigns.C02!.first_touch.period_increment.marketing_spend_inr).toBe(14400); // the leaked, whole-week figure
    expect(weekIsRunning(fw)).toBe(false);
  });
  it('a Sunday as-of closes the week (not partial); earlier weeks equal the full series', () => {
    const c = weeklySeries(D, '2025-03-09'), full = weeklySeries(D);
    expect(weekIsRunning(c[c.length - 1]!)).toBe(false);
    expect(c.slice(0, -1)).toEqual(full.slice(0, c.length - 1));
  });
  it('overall snapshot for the same date agrees with the weekly running total', () => {
    const s = snapshot(D, '2025-03-03').overall.marketing_spend_inr;
    const sum = weeklySeries(D, '2025-03-03').reduce((t, w) => t + Object.values(w.campaigns).reduce((u, c) => u + c.first_touch.period_increment.marketing_spend_inr, 0), 0);
    expect(sum).toBe(s);
  });
});

describe('strategy constraints are real checks (not tautologies)', () => {
  it('defaults pass with no warnings; the day split is within 1 of the raw total', () => {
    const m = strategyModel();
    for (const s of ['base', 'stretch'] as const) {
      const r = m.reconciliation[s];
      expect(r.warnings).toEqual([]); expect(r.reserve_nonnegative && r.budget_sums_to_cap && r.reach_within_pool && r.identified_within_reach && r.reminders_within_confirmed && r.day_split_reconciles).toBe(true);
    }
    expect(m.reconciliation.base.day_split_gap).toBe(1);
  });
  it('overspend → negative reserve is flagged and the budget no longer "sums to cap"', () => {
    const r = strategyModel(withA('b1_budget', 'base', 130000)).reconciliation.base;
    expect(r.reserve).toBeLessThan(0); expect(r.reserve_nonnegative).toBe(false); expect(r.budget_sums_to_cap).toBe(false); expect(r.warnings.join(' ')).toMatch(/exceeds the ₹300,000 cap/);
  });
  it('reach above the pool, identified above reach, and reminders above confirmed registrants are flagged', () => {
    expect(strategyModel(withA('reach_dedup', 'base', 130000)).reconciliation.base.reach_within_pool).toBe(false);
    expect(strategyModel(withA('identified_pre_event', 'base', 90000)).reconciliation.base.identified_within_reach).toBe(false);
    const r = strategyModel(withA('b4_treated', 'base', 5000)).reconciliation.base;
    expect(r.reminders_within_confirmed).toBe(false); expect(r.warnings.join(' ')).toMatch(/B4 treats 5,000/);
  });
  it('a day split that no longer reconciles to the raw total is flagged', () => {
    expect(strategyModel(withA('repeat_visitors', 'base', 100)).reconciliation.base.day_split_reconciles).toBe(false);
  });
});

describe('experiment adjudication', () => {
  const b3 = { ...EXPERIMENTS[2], bet_id: 'B3', guardrails: EXPERIMENTS[2].guardrails as any };
  const good = { abuse_pct: 2, visitor_cost_inr: 120 };
  it('missing sample → insufficient evidence; so are missing KPI or guardrail inputs', () => {
    expect(adjudicateExperiment(b3, { observed_value: 20, guardrail_observations: good }).decision).toBe('insufficient_sample');
    expect(adjudicateExperiment(b3, { observed_n: 300, guardrail_observations: good }).missing).toContain('observed KPI value');
    expect(adjudicateExperiment(b3, { observed_value: 20, observed_n: 300 }).missing.join()).toMatch(/guardrail: abuse/);
    expect(adjudicateExperiment(b3, { observed_value: 20, observed_n: 100, guardrail_observations: good }).decision).toBe('insufficient_sample'); // below min 200
  });
  it('scale / change / stop and guardrail interplay', () => {
    const ev = (v: number, g = good) => adjudicateExperiment(b3, { observed_value: v, observed_n: 300, guardrail_observations: g }).decision;
    expect(ev(17)).toBe('scale'); expect(ev(12)).toBe('change'); expect(ev(8)).toBe('stop');
    expect(ev(17, { ...good, abuse_pct: 6 })).toBe('stop'); // hard guardrail
    const b1 = { ...EXPERIMENTS[0], bet_id: 'B1', guardrails: EXPERIMENTS[0].guardrails as any };
    expect(adjudicateExperiment(b1, { observed_value: 20, observed_n: 20, guardrail_observations: { confirmed_pct: 70, visitor_cost_inr: 100 } }).decision).toBe('change'); // soft breach blocks scale
  });
  it('legacy evaluateExperiment keeps KPI + sample semantics', () => {
    expect(evaluateExperiment({ scale_op: '>=', scale_value: 16, stop_op: '<', stop_value: 10, min_sample: 200 }, 17, 250).decision).toBe('scale');
    expect(evaluateExperiment({ scale_op: '>=', scale_value: 16, stop_op: '<', stop_value: 10, min_sample: 200 }, 17, null).decision).toBe('insufficient_sample');
  });
});

describe('evidence normaliser', () => {
  it('accepts arrays and {items,…}; keeps date and revision', () => {
    expect(normalizeEvidence([{ tool: 't', metric: 'm', value: 1 }])).toEqual({ items: [{ tool: 't', metric: 'm', value: 1 }], as_of: null, data_revision: null });
    expect(normalizeEvidence({ items: [{ tool: 't', metric: 'm', value: 'x' }], as_of: '2025-04-20', data_revision: 9 })).toMatchObject({ as_of: '2025-04-20', data_revision: 9 });
    expect(normalizeEvidence(null)).toBeNull(); expect(normalizeEvidence({ items: [] })).toBeNull(); expect(normalizeEvidence('x')).toBeNull();
  });
});
