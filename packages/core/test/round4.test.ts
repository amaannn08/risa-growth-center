import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS, EXPERIMENTS, adjudicateExperiment, assumptionError, effectiveSample, strategyModel, validateObservation } from '../src';
import { historyFromDataset } from '../src';
import { ds as loadDsSync } from './helpers';

const exp = (bet: string) => { const e = EXPERIMENTS.find((x) => x.bet_id === bet)!; return { ...e, guardrails: e.guardrails as any }; };
const b5 = exp('B5'), b3 = exp('B3'), b4 = exp('B4');
const okG = { confirmation_pct: 90, marginal_visitor_cost_inr: 150 };
const gate = (e: ReturnType<typeof adjudicateExperiment>) => e.gates[0]!;

describe('B5 reserve release needs a complete, eligible readout (P1-1)', () => {
  const base = { kpi_numerator: 50, kpi_denominator: 500, guardrail_observations: okG, gate_inputs: { forecast_extra_visitors: 45, forecast_visitor_cost_inr: 120 } };
  it('a valid readout with a passing forecast releases; 40 visitors at ₹150 is the exact boundary; 39 or ₹151 holds', () => {
    expect(adjudicateExperiment(b5, { ...base, observed_value: 10 }).decision).toBe('scale');
    expect(gate(adjudicateExperiment(b5, { ...base, observed_value: 10 })).decision).toBe('release');
    expect(gate(adjudicateExperiment(b5, { ...base, observed_value: 10, gate_inputs: { forecast_extra_visitors: 40, forecast_visitor_cost_inr: 150 } })).decision).toBe('release');
    expect(gate(adjudicateExperiment(b5, { ...base, observed_value: 10, gate_inputs: { forecast_extra_visitors: 39, forecast_visitor_cost_inr: 150 } })).decision).toBe('hold');
    expect(gate(adjudicateExperiment(b5, { ...base, observed_value: 10, gate_inputs: { forecast_extra_visitors: 45, forecast_visitor_cost_inr: 151 } })).decision).toBe('hold');
  });
  it('a soft change (confirmation 80%) may still release; a hard confirmation breach (<75%) never does', () => {
    expect(gate(adjudicateExperiment(b5, { ...base, observed_value: 8, kpi_numerator: 40, guardrail_observations: { ...okG, confirmation_pct: 80 } })).decision).toBe('release');
    const hard = adjudicateExperiment(b5, { ...base, observed_value: 10, guardrail_observations: { ...okG, confirmation_pct: 70 } });
    expect(hard.decision).toBe('stop'); expect(gate(hard).decision).toBe('hold');
  });
  it('blank main KPI + observed 70% breach → no release (hold); blank KPI alone → insufficient evidence, never release', () => {
    const blankBreach = adjudicateExperiment(b5, { gate_inputs: base.gate_inputs, guardrail_observations: { ...okG, confirmation_pct: 70 }, observed_n: 500 });
    expect(blankBreach.decision).toBe('insufficient_sample'); expect(gate(blankBreach).decision).toBe('hold');
    const blank = adjudicateExperiment(b5, { gate_inputs: base.gate_inputs, guardrail_observations: okG, observed_n: 500 });
    expect(gate(blank).decision).toBe('insufficient_evidence');
    expect(gate(blank).reasons.some((r) => /incomplete|minimum/.test(r.label ?? ''))).toBe(true);
  });
  it('a count denominator below the published minimum (400) never releases, whatever n is typed', () => {
    const low = adjudicateExperiment(b5, { ...base, observed_value: 13.33, kpi_numerator: 40, kpi_denominator: 300, observed_n: 900 });
    expect(effectiveSample(b5, { kpi_denominator: 300, observed_n: 900 })).toBe(300);
    expect(low.decision).toBe('insufficient_sample'); expect(gate(low).decision).toBe('insufficient_evidence');
    const edited = adjudicateExperiment({ ...b5, min_sample: 100 }, {
      ...base, observed_value: 12, kpi_numerator: 48, kpi_denominator: 399,
      guardrail_observations: { ...okG, confirmation_pct: 85 },
    });
    expect(gate(edited).decision).toBe('insufficient_evidence');
  });
  it('a manual 12% KPI and declared n=500 are insufficient for reserve release', () => {
    const manual = adjudicateExperiment(b5, {
      observed_value: 12, observed_n: 500, guardrail_observations: { ...okG, confirmation_pct: 85 },
      gate_inputs: { forecast_extra_visitors: 40, forecast_visitor_cost_inr: 150 },
    });
    expect(gate(manual).decision).toBe('insufficient_evidence');
    expect(gate(manual).reasons.at(-1)?.label).toMatch(/qualified-click KPI numerator and denominator/i);
  });
  it('forecast cost must be > 0: ₹0 holds, a negative cost is rejected by validation', () => {
    expect(gate(adjudicateExperiment(b5, { ...base, observed_value: 10, gate_inputs: { forecast_extra_visitors: 45, forecast_visitor_cost_inr: 0 } })).decision).toBe('hold');
    expect(validateObservation(b5, { ...base, gate_inputs: { forecast_extra_visitors: 45, forecast_visitor_cost_inr: -1 } }).errors.join()).toMatch(/cost cannot be negative/);
    expect(validateObservation(b5, { ...base, gate_inputs: { forecast_extra_visitors: -3, forecast_visitor_cost_inr: 100 } }).errors.join()).toMatch(/extra visitors cannot be negative/);
  });
});

describe('KPI denominator is the sample for B3/B5; B4 interval validation (P2-4)', () => {
  it('B3 1/5 with a separately typed n=250 is rejected; 1/5 alone is insufficient (denominator 5 < 200); 40/200 scales', () => {
    expect(validateObservation(b3, { kpi_numerator: 1, kpi_denominator: 5, observed_n: 250 }).errors.join()).toMatch(/contradicts the KPI denominator/);
    const tiny = adjudicateExperiment(b3, { observed_value: 20, kpi_numerator: 1, kpi_denominator: 5, guardrail_observations: { abuse_pct: 1, visitor_cost_inr: 100 } });
    expect(tiny.decision).toBe('insufficient_sample');
    expect(adjudicateExperiment(b3, { observed_value: 20, kpi_numerator: 40, kpi_denominator: 200, guardrail_observations: { abuse_pct: 1, visitor_cost_inr: 100 } }).decision).toBe('scale');
    expect(validateObservation(b3, { kpi_numerator: 40, kpi_denominator: 200, observed_n: 200 }).errors).toEqual([]);
  });
  it('B4 keeps its separate population: denominator ≤ n is still enough', () => {
    expect(validateObservation(b4, { kpi_numerator: 1000, kpi_denominator: 1800, observed_n: 1800 }).errors).toEqual([]);
    expect(validateObservation(b4, { kpi_numerator: 1000, kpi_denominator: 1800, observed_n: 1750 }).errors.join()).toMatch(/cannot exceed the sample size/);
  });
  it('B4 ITT: a lower bound above the point estimate and out-of-range pp are rejected', () => {
    expect(validateObservation(b4, { gate_inputs: { itt_lift_pp: 4, itt_ci_low_pp: 10 } }).errors.join()).toMatch(/cannot exceed the point estimate/);
    expect(validateObservation(b4, { gate_inputs: { itt_lift_pp: 140, itt_ci_low_pp: 1 } }).errors.join()).toMatch(/between −100 and 100/);
    expect(validateObservation(b4, { gate_inputs: { itt_lift_pp: 5, itt_ci_low_pp: 1 } }).errors).toEqual([]);
  });
});

describe('reminder assumption ranges (P2-9)', () => {
  it('shares must be in [0,1]; a 120% opt-in is invalid and the model never exceeds confirmed', async () => {
    expect(assumptionError({ key: 'b4_optin', unit: 'ratio' }, 1.2)).toMatch(/between 0 and 1/);
    expect(assumptionError({ key: 'b4_holdout', unit: 'ratio' }, -0.1)).toMatch(/between 0 and 1/);
    expect(assumptionError({ key: 'b4_optin', unit: 'ratio' }, 0)).toBeNull();
    expect(assumptionError({ key: 'b4_holdout', unit: 'ratio' }, 1)).toBeNull();
    const ds = loadDsSync();
    const { history, visitors2025 } = historyFromDataset(ds);
    const planBudgets = Object.fromEntries(Object.values(ds.campaigns).map((c: any) => [c.campaign_id, Number(c.plan_budget_inr ?? 0)]));
    const run = (patch: Record<string, number>) => strategyModel(DEFAULT_ASSUMPTIONS.map((a) => (a.key in patch ? { ...a, value: patch[a.key]! } : a)), { history, planBudgets, visitors2025 }).stretch.reminder;
    const over = run({ b4_optin: 1.2 });
    expect(over.eligible_optin).toBeLessThanOrEqual(over.confirmed);
    const none = run({ b4_optin: 0 });
    expect(none.treated).toBe(0); expect(none.required_confirmed).toBeNull(); expect(Number.isFinite(none.treated)).toBe(true);
    const all = run({ b4_holdout: 1 });
    expect(all.treated).toBe(0); expect(all.required_eligible).toBeNull(); expect(all.required_confirmed).toBeNull();
  });
});
