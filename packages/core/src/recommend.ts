import { coverageEnd, type Dataset } from './dataset';
import { snapshot } from './snapshot';
import { istDate } from './time';
import { UNATTR } from './types';
import { DECISION_RULE_SEEDS } from './strategy/content';

export type Op = '<=' | '>=' | '<' | '>';
export interface DecisionRule {
  mode: 'pre_event' | 'post_event'; metric: string; scale_op: Op; scale_value: number; stop_op: Op; stop_value: number; min_registered: number;
}
export const DEFAULT_RULES: DecisionRule[] = DECISION_RULE_SEEDS.map((r) => ({ ...r })) as DecisionRule[];
export type Decision = 'scale' | 'change' | 'stop' | 'insufficient_data';

export const cmp = (v: number, op: Op, t: number) => (op === '<=' ? v <= t : op === '>=' ? v >= t : op === '<' ? v < t : v > t);

export interface RuleReason { metric: string; value: number | null; op: Op; threshold: number; passed: boolean; kind: 'scale' | 'stop' }
export interface Recommendation {
  campaign_id: string; campaign_name: string; mode: 'pre_event' | 'post_event'; decision: Decision; reasons: RuleReason[];
  /** Threshold that fired for the decision (stop: any tripped stop rule; scale: all scale rules). */
  fired: RuleReason[]; registered: number; status: string;
}

export function mode(ds: Dataset, asOf: string): 'pre_event' | 'post_event' {
  return asOf >= istDate(ds.eventMs.endsAt) ? 'post_event' : 'pre_event';
}

/** Scale if ALL scale rules pass, Stop if ANY stop rule trips, else Change. Uses the first-touch view. */
export function recommendCampaigns(ds: Dataset, asOf: string, rules: DecisionRule[] = DEFAULT_RULES): Recommendation[] {
  const m = mode(ds, asOf);
  const snap = snapshot(ds, asOf);
  const active = rules.filter((r) => r.mode === m);
  const out: Recommendation[] = [];
  for (const [cid, view] of Object.entries(snap.campaigns!)) {
    if (cid === UNATTR) continue;
    const f = view.first_touch;
    const value = (metric: string): number | null =>
      ({
        visitor_cpa: f.rates.cpa_per_attendee_inr, registered_show_up: f.rates.registered_show_up,
        registration_cpa: f.rates.cpa_per_registration_inr, confirmed_per_registered: f.rates.confirmed_among_registered_people,
      } as Record<string, number | null>)[metric] ?? null;
    const reasons: RuleReason[] = [];
    for (const r of active) {
      const v = value(r.metric);
      reasons.push({ metric: r.metric, value: v, op: r.scale_op, threshold: r.scale_value, passed: v !== null && cmp(v, r.scale_op, r.scale_value), kind: 'scale' });
      reasons.push({ metric: r.metric, value: v, op: r.stop_op, threshold: r.stop_value, passed: v !== null && cmp(v, r.stop_op, r.stop_value), kind: 'stop' });
    }
    const minReg = active.reduce((t, r) => Math.max(t, r.min_registered), 0);
    const scaleAll = reasons.filter((x) => x.kind === 'scale');
    const stopAny = reasons.filter((x) => x.kind === 'stop' && x.passed);
    let decision: Decision;
    let fired: RuleReason[];
    if (f.registered_people < minReg) { decision = 'insufficient_data'; fired = []; }
    else if (stopAny.length) { decision = 'stop'; fired = stopAny; }
    else if (scaleAll.length && scaleAll.every((x) => x.passed)) { decision = 'scale'; fired = scaleAll; }
    else { decision = 'change'; fired = []; }
    out.push({
      campaign_id: cid, campaign_name: view.campaign_name, mode: m, decision, reasons, fired, registered: f.registered_people,
      status: String(ds.campaigns[cid]?.status ?? 'active'),
    });
  }
  return out;
}

