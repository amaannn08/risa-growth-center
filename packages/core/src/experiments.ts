import { cmp, type Op } from './recommend';

export interface Guardrail { key: string; label: string; op: Op | string; value: number; /** a breach stops the bet (named in the stop rule) instead of only blocking Scale */ hard?: boolean }
export interface ExperimentRule {
  scale_op: Op | string | null; scale_value: number | null; stop_op: Op | string | null; stop_value: number | null; min_sample?: number | null;
  guardrails?: unknown; bet_id?: string | null;
}
export type ExperimentDecision = 'scale' | 'change' | 'stop' | 'insufficient_sample';
export interface ReadoutInput {
  observed_value?: number | null; observed_n?: number | null; kpi_numerator?: number | null; kpi_denominator?: number | null;
  /** observed value per guardrail key */ guardrail_observations?: Record<string, number | null | undefined>;
  /** inputs for distinct secondary gates, keyed by gate input key */ gate_inputs?: Record<string, number | null | undefined>;
}
export interface Reason { kind: 'scale' | 'stop' | 'sample' | 'guardrail' | 'missing'; op: string; threshold: number; value: number | null; passed: boolean; label?: string }
export interface GuardrailResult extends Guardrail { observed: number | null; passed: boolean | null }
export interface GateResult { key: string; label: string; decision: 'release' | 'hold' | 'scale_next_edition' | 'not_demonstrated' | 'insufficient_evidence'; reasons: Reason[]; missing: string[] }
export interface ExperimentEvaluation { decision: ExperimentDecision; reasons: Reason[]; missing: string[]; guardrails: GuardrailResult[]; gates: GateResult[] }

/** Distinct decisions that sit next to the main Scale/Change/Stop readout (never merged into it). */
export const EXPERIMENT_GATES: Record<string, { key: string; label: string; inputs: { key: string; label: string; op: Op; value: number; unit: string }[]; pass: GateResult['decision']; fail: GateResult['decision']; note: string }> = {
  B5: { key: 'reserve_release', label: 'Reserve release (second ₹6k tranche)', pass: 'release', fail: 'hold', note: 'Released only if the forecast shows ≥ 40 more visitors at ≤ ₹150 marginal visitor cost.',
    inputs: [{ key: 'forecast_extra_visitors', label: 'Forecast extra visitors', op: '>=', value: 40, unit: 'visitors' }, { key: 'forecast_visitor_cost_inr', label: 'Marginal visitor cost', op: '<=', value: 150, unit: '₹' }] },
  B4: { key: 'final_holdout_itt', label: 'Final holdout result (ITT verified show-up lift)', pass: 'scale_next_edition', fail: 'not_demonstrated', note: 'Separate from the T−2 reconfirmation gate: scale for next edition only at ≥ 4 pp lift with the 95% interval above zero.',
    inputs: [{ key: 'itt_lift_pp', label: 'ITT show-up lift', op: '>=', value: 4, unit: 'pp' }, { key: 'itt_ci_low_pp', label: 'Interval lower bound', op: '>', value: 0, unit: 'pp' }] },
};

export const parseGuardrails = (raw: unknown): Guardrail[] =>
  Array.isArray(raw) ? raw.filter((g): g is Guardrail => !!g && typeof g === 'object' && typeof (g as any).key === 'string' && typeof (g as any).value === 'number') : [];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Reproducible adjudication of an experiment readout (used by the UI preview AND, authoritatively, inside the write transaction).
 * - missing mandatory inputs (KPI value, sample when a minimum exists, any guardrail observation) → insufficient_sample ("insufficient evidence"), never a decision;
 * - sample below the minimum → insufficient evidence;
 * - stop rule trips, or a hard guardrail is breached → stop; any guardrail breach blocks Scale (→ change); else scale rule → scale; else change.
 */
export function adjudicateExperiment(e: ExperimentRule, input: ReadoutInput): ExperimentEvaluation {
  const reasons: Reason[] = [], missing: string[] = [];
  const observed = num(input.observed_value), n = num(input.observed_n);
  if (observed === null) missing.push('observed KPI value');
  if (e.min_sample) {
    if (n === null) missing.push(`sample size (minimum ${e.min_sample})`);
    else reasons.push({ kind: 'sample', op: '>=', threshold: e.min_sample, value: n, passed: n >= e.min_sample, label: 'sample size' });
  }
  const guardrails: GuardrailResult[] = parseGuardrails(e.guardrails).map((g) => {
    const obs = num(input.guardrail_observations?.[g.key]);
    if (obs === null) { missing.push(`guardrail: ${g.label}`); return { ...g, observed: null, passed: null }; }
    const passed = cmp(obs, g.op as Op, g.value);
    reasons.push({ kind: 'guardrail', op: String(g.op), threshold: g.value, value: obs, passed, label: g.label });
    return { ...g, observed: obs, passed };
  });
  const gates: GateResult[] = [];
  const gd = e.bet_id ? EXPERIMENT_GATES[e.bet_id] : undefined;
  if (gd) {
    const gMissing: string[] = [], gReasons: Reason[] = [];
    for (const i of gd.inputs) {
      const v = num(input.gate_inputs?.[i.key]);
      if (v === null) { gMissing.push(i.label); continue; }
      gReasons.push({ kind: 'guardrail', op: i.op, threshold: i.value, value: v, passed: cmp(v, i.op, i.value), label: i.label });
    }
    const decision = gMissing.length ? 'insufficient_evidence' : gReasons.every((r) => r.passed) ? gd.pass : gd.fail;
    gates.push({ key: gd.key, label: gd.label, decision, reasons: gReasons, missing: gMissing });
  }
  const finish = (decision: ExperimentDecision): ExperimentEvaluation => ({ decision, reasons, missing, guardrails, gates });
  if (missing.length) { for (const m of missing) reasons.push({ kind: 'missing', op: '', threshold: 0, value: null, passed: false, label: m }); return finish('insufficient_sample'); }
  const sample = reasons.find((r) => r.kind === 'sample');
  if (sample && !sample.passed) return finish('insufficient_sample');
  const v = observed!;
  const stop = e.stop_op && e.stop_value !== null ? cmp(v, e.stop_op as Op, e.stop_value) : false;
  const scale = e.scale_op && e.scale_value !== null ? cmp(v, e.scale_op as Op, e.scale_value) : false;
  if (e.stop_op && e.stop_value !== null) reasons.push({ kind: 'stop', op: String(e.stop_op), threshold: e.stop_value, value: v, passed: stop, label: 'stop rule' });
  if (e.scale_op && e.scale_value !== null) reasons.push({ kind: 'scale', op: String(e.scale_op), threshold: e.scale_value, value: v, passed: scale, label: 'scale rule' });
  const hardBreach = guardrails.some((g) => g.hard && g.passed === false), anyBreach = guardrails.some((g) => g.passed === false);
  return finish(stop || hardBreach ? 'stop' : scale && !anyBreach ? 'scale' : 'change');
}

/** Back-compat: KPI + optional sample only (no guardrails). */
export function evaluateExperiment(e: ExperimentRule, observed: number, n?: number | null): ExperimentEvaluation {
  return adjudicateExperiment({ ...e, guardrails: [] }, { observed_value: observed, observed_n: n });
}
