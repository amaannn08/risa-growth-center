import { cmp, type Op } from './recommend';

export interface Guardrail {
  key: string; label: string; op: Op | string; value: number;
  /** a breach stops the bet (named in the stop rule) instead of only blocking Scale */ hard?: boolean;
  /** separate hard confirmation floor: breaching THIS threshold is a Stop, while `op/value` is only the Scale floor (e.g. B5: ≥85% to scale, <75% stops) */
  stop_op?: Op | string; stop_value?: number;
}
export interface ExperimentRule {
  scale_op: Op | string | null; scale_value: number | null; stop_op: Op | string | null; stop_value: number | null; min_sample?: number | null;
  guardrails?: unknown; bet_id?: string | null;
}
export const B5_QUALIFIED_CLICK_MINIMUM = 400;

export type ExperimentDecision = 'scale' | 'change' | 'stop' | 'insufficient_sample';
export interface ReadoutInput {
  observed_value?: number | null; observed_n?: number | null; kpi_numerator?: number | null; kpi_denominator?: number | null;
  /** observed value per guardrail key */ guardrail_observations?: Record<string, number | null | undefined>;
  /** inputs for distinct secondary gates, keyed by gate input key */ gate_inputs?: Record<string, number | null | undefined>;
}
export interface Reason { kind: 'scale' | 'stop' | 'sample' | 'guardrail' | 'missing'; op: string; threshold: number; value: number | null; passed: boolean; label?: string }
export interface GuardrailResult extends Guardrail { observed: number | null; passed: boolean | null; stopped?: boolean }
export interface GateResult { key: string; label: string; decision: 'release' | 'hold' | 'scale_next_edition' | 'not_demonstrated' | 'insufficient_evidence'; reasons: Reason[]; missing: string[] }
export interface ExperimentEvaluation { decision: ExperimentDecision; reasons: Reason[]; missing: string[]; guardrails: GuardrailResult[]; gates: GateResult[] }

/** Distinct decisions that sit next to the main Scale/Change/Stop readout (never merged into it). */
export const EXPERIMENT_GATES: Record<string, { key: string; label: string; inputs: { key: string; label: string; op: Op; value: number; unit: string; gt?: number }[]; pass: GateResult['decision']; fail: GateResult['decision']; note: string }> = {
  B5: { key: 'reserve_release', label: 'Reserve release (second ₹6k tranche)', pass: 'release', fail: 'hold', note: 'Released only on a complete B5 readout with at least 400 qualified clicks with no hard guardrail breach, and only if the forecast shows ≥ 40 more visitors at > ₹0 and ≤ ₹150 marginal visitor cost.',
    inputs: [{ key: 'forecast_extra_visitors', label: 'Forecast extra visitors', op: '>=', value: 40, unit: 'visitors' }, { key: 'forecast_visitor_cost_inr', label: 'Marginal visitor cost', op: '<=', value: 150, unit: '₹', gt: 0 }] },
  B4: { key: 'final_holdout_itt', label: 'Final holdout result (ITT verified show-up lift)', pass: 'scale_next_edition', fail: 'not_demonstrated', note: 'Separate from the T−2 reconfirmation gate: scale for next edition only at ≥ 4 pp lift with the 95% interval above zero.',
    inputs: [{ key: 'itt_lift_pp', label: 'ITT show-up lift', op: '>=', value: 4, unit: 'pp' }, { key: 'itt_ci_low_pp', label: 'Interval lower bound', op: '>', value: 0, unit: 'pp' }] },
};

const OPS = ['>=', '>', '<=', '<'];
const isTyped = (g: any): g is Guardrail => !!g && typeof g === 'object' && typeof g.key === 'string' && typeof g.value === 'number' && Number.isFinite(g.value) && OPS.includes(g.op)
  && (g.stop_op === undefined || (OPS.includes(g.stop_op) && typeof g.stop_value === 'number'));
/** Typed guardrail records only. Anything else (legacy free-text strings, malformed objects) is reported by `unparsedGuardrails`. */
export const parseGuardrails = (raw: unknown): Guardrail[] => (Array.isArray(raw) ? raw.filter(isTyped) : []);
/** Mandatory rules we could not turn into a typed check. A non-null non-array value counts as one unparsed rule. */
export const unparsedGuardrails = (raw: unknown): string[] =>
  raw == null ? [] : Array.isArray(raw) ? raw.filter((g) => !isTyped(g)).map((g) => (typeof g === 'string' ? g : JSON.stringify(g))) : [JSON.stringify(raw)];

/** Bets whose KPI is a count ratio over the very population the published minimum sample refers to (B3 qualified visits, B5 qualified clicks). */
export const KPI_DENOMINATOR_IS_SAMPLE = new Set(['B3', 'B5']);
const denominatorIsSample = (e: { bet_id?: string | null }) => !!e.bet_id && KPI_DENOMINATOR_IS_SAMPLE.has(e.bet_id);
/** The sample the minimum is judged against: the KPI count denominator where it is the sample, else the explicitly entered n. */
export const effectiveSample = (e: { bet_id?: string | null }, input: ReadoutInput): number | null =>
  denominatorIsSample(e) && num(input.kpi_denominator) !== null ? num(input.kpi_denominator) : num(input.observed_n);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Reproducible adjudication of an experiment readout (used by the UI preview AND, authoritatively, inside the write transaction).
 * - missing mandatory inputs (KPI value, sample when a minimum exists, any guardrail observation) → insufficient_sample ("insufficient evidence"), never a decision;
 * - sample below the minimum → insufficient evidence;
 * - stop rule trips, or a hard guardrail is breached → stop; any guardrail breach blocks Scale (→ change); else scale rule → scale; else change.
 */
export function adjudicateExperiment(e: ExperimentRule, input: ReadoutInput): ExperimentEvaluation {
  const reasons: Reason[] = [], missing: string[] = [];
  const observed = num(input.observed_value), n = effectiveSample(e, input);
  if (observed === null) missing.push('observed KPI value');
  if (e.min_sample) {
    if (n === null) missing.push(`sample size (minimum ${e.min_sample})`);
    else reasons.push({ kind: 'sample', op: '>=', threshold: e.min_sample, value: n, passed: n >= e.min_sample, label: 'sample size' });
  }
  // an unrecognised mandatory rule can never be silently dropped: it makes the readout insufficient evidence
  for (const u of unparsedGuardrails(e.guardrails)) missing.push(`unrecognised guardrail rule (cannot be checked): ${u}`);
  const guardrails: GuardrailResult[] = parseGuardrails(e.guardrails).map((g) => {
    const obs = num(input.guardrail_observations?.[g.key]);
    if (obs === null) { missing.push(`guardrail: ${g.label}`); return { ...g, observed: null, passed: null }; }
    const passed = cmp(obs, g.op as Op, g.value);
    reasons.push({ kind: 'guardrail', op: String(g.op), threshold: g.value, value: obs, passed, label: g.label });
    const stopped = g.stop_op ? cmp(obs, g.stop_op as Op, g.stop_value!) : false;
    if (g.stop_op) reasons.push({ kind: 'guardrail', op: String(g.stop_op), threshold: g.stop_value!, value: obs, passed: !stopped, label: `${g.label} (hard floor: stop if ${g.stop_op} ${g.stop_value})` });
    return { ...g, observed: obs, passed, stopped };
  });
  const hardBreach = guardrails.some((g) => (g.hard && g.passed === false) || g.stopped), anyBreach = guardrails.some((g) => g.passed === false);
  const gates: GateResult[] = [];
  const gd = e.bet_id ? EXPERIMENT_GATES[e.bet_id] : undefined;
  if (gd) {
    const gMissing: string[] = [], gReasons: Reason[] = [];
    for (const i of gd.inputs) {
      const v = num(input.gate_inputs?.[i.key]);
      if (v === null) { gMissing.push(i.label); continue; }
      gReasons.push({ kind: 'guardrail', op: i.op, threshold: i.value, value: v, passed: cmp(v, i.op, i.value) && (i.gt === undefined || v > i.gt), label: i.gt === undefined ? i.label : `${i.label} (must be > ${i.gt})` });
    }
    const decision = gMissing.length ? 'insufficient_evidence' : gReasons.every((r) => r.passed) ? gd.pass : gd.fail;
    gates.push({ key: gd.key, label: gd.label, decision, reasons: gReasons, missing: gMissing });
  }
  const finish = (decision: ExperimentDecision): ExperimentEvaluation => {
    const clicks = num(input.kpi_denominator);
    const missingClickCounts = e.bet_id === 'B5' && (num(input.kpi_numerator) === null || clicks === null);
    const belowClickMinimum = e.bet_id === 'B5' && clicks !== null && clicks < B5_QUALIFIED_CLICK_MINIMUM;
    // a release is only valid on a complete, sufficiently sampled readout with no hard breach observed: the reserve only funds bets that are still running
    for (const g of gates) {
      if (g.decision !== 'release') continue;
      const why = decision === 'stop' ? 'blocked: experiment decision is Stop' : decision === 'insufficient_sample' ? 'blocked: main readout is incomplete or below its minimum sample' : hardBreach ? 'blocked: hard guardrail breached' : missingClickCounts ? 'blocked: qualified-click KPI numerator and denominator are required' : belowClickMinimum ? `blocked: fewer than ${B5_QUALIFIED_CLICK_MINIMUM} qualified clicks` : null;
      if (why) {
        g.decision = hardBreach || decision === 'stop' ? 'hold' : 'insufficient_evidence';
        if (missingClickCounts && g.decision === 'insufficient_evidence') g.missing.push('qualified-click KPI numerator and denominator');
        g.reasons.push({ kind: 'stop', op: '', threshold: 0, value: null, passed: false, label: why });
      }
    }
    return { decision, reasons, missing, guardrails, gates };
  };
  if (missing.length) { for (const m of missing) reasons.push({ kind: 'missing', op: '', threshold: 0, value: null, passed: false, label: m }); return finish('insufficient_sample'); }
  const sample = reasons.find((r) => r.kind === 'sample');
  if (sample && !sample.passed) return finish('insufficient_sample');
  const v = observed!;
  const stop = e.stop_op && e.stop_value !== null ? cmp(v, e.stop_op as Op, e.stop_value) : false;
  const scale = e.scale_op && e.scale_value !== null ? cmp(v, e.scale_op as Op, e.scale_value) : false;
  if (e.stop_op && e.stop_value !== null) reasons.push({ kind: 'stop', op: String(e.stop_op), threshold: e.stop_value, value: v, passed: stop, label: 'stop rule' });
  if (e.scale_op && e.scale_value !== null) reasons.push({ kind: 'scale', op: String(e.scale_op), threshold: e.scale_value, value: v, passed: scale, label: 'scale rule' });
  return finish(stop || hardBreach ? 'stop' : scale && !anyBreach ? 'scale' : 'change');
}

/** Back-compat: KPI + optional sample only (no guardrails). */
export function evaluateExperiment(e: ExperimentRule, observed: number, n?: number | null): ExperimentEvaluation {
  return adjudicateExperiment({ ...e, guardrails: [] }, { observed_value: observed, observed_n: n });
}

export interface ObservationCheck { value: number | null; errors: string[] }
/**
 * Shared (server transaction + readout form) validation of a reported observation.
 * Counts win: when numerator/denominator are supplied the KPI is computed from them, and an explicit KPI that disagrees is rejected.
 */
export function validateObservation(e: { kpi_unit?: string | null; bet_id?: string | null }, input: ReadoutInput): ObservationCheck {
  const errors: string[] = [], pct = e.kpi_unit === '%';
  const { kpi_numerator: a, kpi_denominator: b } = input;
  const nn = (x: unknown) => x !== null && x !== undefined;
  let value = num(input.observed_value);
  const n = num(input.observed_n);
  const dIsSample = denominatorIsSample(e);
  if (n !== null && (!Number.isInteger(n) || n < 0)) errors.push('Sample size must be a whole number ≥ 0.');
  if (nn(a) !== nn(b)) errors.push('Provide both the KPI numerator and denominator, or neither.');
  else if (nn(a) && nn(b)) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a! < 0 || b! <= 0) errors.push('KPI numerator must be a whole number ≥ 0 and the denominator a whole number > 0.');
    else if (pct && a! > b!) errors.push(`KPI numerator (${a}) cannot exceed the denominator (${b}) for a % KPI.`);
    else if (dIsSample && n !== null && n !== b) errors.push(`Sample size n (${n}) contradicts the KPI denominator (${b}); for this KPI the denominator is the sample. Leave n blank or make them equal.`);
    else if (pct && n !== null && b! > n) errors.push(`KPI denominator (${b}) cannot exceed the sample size (${n}).`);
    else {
      const ratio = (pct ? 100 : 1) * a! / b!;
      if (value !== null && Math.abs(value - ratio) > Math.max(0.05, Math.abs(ratio) * 0.005)) errors.push(`Reported KPI ${value} conflicts with its counts ${a}/${b} = ${Math.round(ratio * 100) / 100}. Fix one of them.`);
      value = ratio;
    }
  }
  if (value !== null && pct && (value < 0 || value > 100)) errors.push(`A % KPI must be between 0 and 100 (got ${value}).`);
  for (const [k, v] of Object.entries(input.guardrail_observations ?? {})) {
    if (typeof v !== 'number') continue;
    if (v < 0 || (/_pct$/.test(k) && v > 100)) errors.push(`Guardrail ${k} out of range (${v}).`);
  }
  const g = input.gate_inputs ?? {};
  const gv = (k: string) => (typeof g[k] === 'number' ? (g[k] as number) : null);
  if (gv('forecast_extra_visitors') !== null && gv('forecast_extra_visitors')! < 0) errors.push('Forecast extra visitors cannot be negative.');
  if (gv('forecast_visitor_cost_inr') !== null && gv('forecast_visitor_cost_inr')! < 0) errors.push('Forecast marginal visitor cost cannot be negative.');
  for (const k of ['itt_lift_pp', 'itt_ci_low_pp']) if (gv(k) !== null && (gv(k)! < -100 || gv(k)! > 100)) errors.push(`${k} must be between −100 and 100 percentage points (got ${gv(k)}).`);
  if (gv('itt_lift_pp') !== null && gv('itt_ci_low_pp') !== null && gv('itt_ci_low_pp')! > gv('itt_lift_pp')!) errors.push(`Interval lower bound (${gv('itt_ci_low_pp')} pp) cannot exceed the point estimate (${gv('itt_lift_pp')} pp).`);
  return { value, errors };
}
