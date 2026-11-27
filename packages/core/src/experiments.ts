import { cmp, type Op } from './recommend';

export interface ExperimentRule { scale_op: Op | string | null; scale_value: number | null; stop_op: Op | string | null; stop_value: number | null; min_sample?: number | null }
export interface ExperimentEvaluation {
  decision: 'scale' | 'change' | 'stop' | 'insufficient_sample';
  reasons: { kind: 'scale' | 'stop' | 'sample'; op: string; threshold: number; value: number; passed: boolean }[];
}

/** Scale if the scale rule passes, Stop if the stop rule trips (stop wins), else Change. Below min_sample → insufficient_sample. */
export function evaluateExperiment(e: ExperimentRule, observed: number, n?: number | null): ExperimentEvaluation {
  const reasons: ExperimentEvaluation['reasons'] = [];
  if (e.min_sample && n !== null && n !== undefined) reasons.push({ kind: 'sample', op: '>=', threshold: e.min_sample, value: n, passed: n >= e.min_sample });
  const stop = e.stop_op && e.stop_value !== null ? cmp(observed, e.stop_op as Op, e.stop_value) : false;
  const scale = e.scale_op && e.scale_value !== null ? cmp(observed, e.scale_op as Op, e.scale_value) : false;
  if (e.stop_op && e.stop_value !== null) reasons.push({ kind: 'stop', op: e.stop_op, threshold: e.stop_value, value: observed, passed: stop });
  if (e.scale_op && e.scale_value !== null) reasons.push({ kind: 'scale', op: e.scale_op, threshold: e.scale_value, value: observed, passed: scale });
  if (reasons[0]?.kind === 'sample' && !reasons[0].passed) return { decision: 'insufficient_sample', reasons };
  return { decision: stop ? 'stop' : scale ? 'scale' : 'change', reasons };
}
