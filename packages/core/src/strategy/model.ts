import { DEFAULT_ASSUMPTIONS, DEFAULT_HISTORY, DEFAULT_PLAN_BUDGETS, type Assumption, type CampaignHistory } from './defaults';

export type Scenario = 'base' | 'stretch';
/** Float-safe rounding (e.g. 18×25×0.85 = 382.5 → 383). */
const pc = (x: number) => rnd(x * 10000) / 100;
export const rnd = (x: number) => Math.round(x + 1e-9);

/** Assumptions added after the first release: databases seeded earlier fall back to these until migrated (never throws). */
const FALLBACK: Record<string, number> = { b4_optin: 0.9, b4_holdout: 0.2, b4_wave2_pp: 0 };
export function lookup(as: Assumption[], key: string, scenario: Scenario): number {
  const hit = as.find((x) => x.key === key && x.scenario === scenario) ?? as.find((x) => x.key === key && x.scenario === 'all');
  if (!hit) { if (key in FALLBACK) return FALLBACK[key]!; throw new Error(`Missing assumption ${key} (${scenario})`); }
  return hit.value;
}

export interface BetResult {
  id: 'B1' | 'B2' | 'B3' | 'B4' | 'B5'; kind: 'acquisition' | 'turnout'; extra_regs: number; visitors: number; budget: number; formula: string;
}
export interface ReferenceCampaign { campaign_id: string; name: string; hist_spend: number; plan_budget: number; registered: number; confirmed: number; visitors: number; hist_visitors: number }
export interface ScenarioResult {
  scenario: Scenario;
  reach: { pool: number; reached: number; identified: number; identified_of_reach: number; regs_per_identified: number; historical_regs_per_identified: number };
  reference: { spend: number; registered: number; confirmed: number; visitors: number; campaigns: ReferenceCampaign[] };
  bets: BetResult[];
  /** B4 eligibility chain: confirmed → opted in → minus holdout → treated (never above the requested target) */
  reminder: { target: number; confirmed: number; optin_rate: number; eligible_optin: number; holdout_share: number; holdout: number; treatable: number; treated: number; waves: number; wave1_pp: number; wave2_pp: number; lift_pp: number; required_eligible: number; required_confirmed: number; feasible: boolean };
  added_regs: number; added_confirmed: number; acquisition_visitors: number; reminder_visitors: number;
  registrations: number; confirmed: number; registered_visitors: number; show_up_of_registrations: number;
  walkins: number; total: number; headline: number;
  spend: number; bets_spend: number; reserve: number; cap: number;
  cpa: { registration: number; visitor: number; full_cap_visitor: number };
  capacity: { day1: number; day2: number; repeat: number; weekend_unique: number; cap_weekend: number; cap_per_day: number;
    exceeds_weekend_cap: boolean; exceeds_day_cap: boolean; scans_per_hour: number };
}
/** Constraint checks that bind the plan to its inputs (not tautologies): every flag can fail when an assumption is edited. */
export interface Reconciliation {
  raw_total: number; headline: number; reference_spend: number; bets_spend: number; reserve: number; cap: number;
  /** reference + bets + reserve = cap AND the reserve is not negative (i.e. spend ≤ cap) */ budget_sums_to_cap: boolean;
  reserve_nonnegative: boolean; reach_within_pool: boolean; identified_within_reach: boolean;
  /** B4 treated ≤ confirmed registrants (reminders can only go to opted-in confirmed people) */ reminders_within_confirmed: boolean;
  /** the requested B4 treatment target fits inside opted-in confirmed registrants after the holdout (else it is capped and flagged) */ reminders_feasible: boolean;
  reminder: ScenarioResult['reminder'];
  /** raw total − (day1 + day2 − repeat): visitors the day split leaves unallocated (rounding if |gap| ≤ 1) */ day_split_gap: number; day_split_reconciles: boolean;
  warnings: string[];
}
export interface StrategyModel {
  base: ScenarioResult; stretch: ScenarioResult;
  reconciliation: Record<Scenario, Reconciliation>;
  sensitivity: Record<Scenario, { no_reminders_no_walkins: number; showup_drop_pp: number; showup_drop_visitors: number }>;
  growth_vs_2025: Record<Scenario, number>;
}

function reference(as: Assumption[], s: Scenario, history: CampaignHistory[], plan: Record<string, number>) {
  const me = lookup(as, 'marginal_efficiency', s);
  const out = (hist: number, b: number, h: number) => rnd(hist * Math.min(b / h, 1) + hist * Math.max(b / h - 1, 0) * me);
  const campaigns: ReferenceCampaign[] = history.map((c) => {
    const b = plan[c.campaign_id] ?? 0;
    return {
      campaign_id: c.campaign_id, name: c.name, hist_spend: c.spend, plan_budget: b,
      registered: out(c.registered, b, c.spend), confirmed: out(c.confirmed, b, c.spend), visitors: out(c.visitors, b, c.spend), hist_visitors: c.visitors,
    };
  });
  const sum = (f: (c: ReferenceCampaign) => number) => campaigns.reduce((t, c) => t + f(c), 0);
  return { spend: sum((c) => c.plan_budget), registered: sum((c) => c.registered), confirmed: sum((c) => c.confirmed), visitors: sum((c) => c.visitors), campaigns };
}

function scenarioResult(as: Assumption[], s: Scenario, history: CampaignHistory[], plan: Record<string, number>, hist2025Visitors: number): ScenarioResult {
  const g = (k: string) => lookup(as, k, s);
  const ref = reference(as, s, history, plan);
  const pool = g('pool_club_campuses') * g('pool_per_club_campus') + g('pool_catchments') * g('pool_per_catchment') + g('pool_alumni_interest');
  const b1r = g('b1_clubs') * g('b1_regs_per_club');
  const b3r = g('b3_visits') * g('b3_conv');
  const acq: BetResult[] = [
    { id: 'B1', kind: 'acquisition', extra_regs: rnd(b1r), visitors: rnd(b1r * g('b1_show')), budget: g('b1_budget'), formula: `${g('b1_clubs')} clubs × ${g('b1_regs_per_club')} regs × ${pc(g('b1_show'))}%` },
    { id: 'B2', kind: 'acquisition', extra_regs: g('b2_regs'), visitors: rnd(g('b2_regs') * g('b2_show')), budget: g('b2_budget'), formula: `${g('b2_regs')} regs × ${pc(g('b2_show'))}%` },
    { id: 'B3', kind: 'acquisition', extra_regs: rnd(b3r), visitors: rnd(rnd(b3r) * g('b3_show')), budget: g('b3_budget'), formula: `${g('b3_visits')} visits × ${pc(g('b3_conv'))}% × ${pc(g('b3_show'))}%` },
    { id: 'B5', kind: 'acquisition', extra_regs: g('b5_regs'), visitors: rnd(g('b5_regs') * g('b5_show')), budget: g('b5_budget'), formula: `${g('b5_regs')} regs × ${pc(g('b5_show'))}%` },
  ];
  // B4 reminders go only to OPTED-IN confirmed registrants, after the holdout is set aside: treated = min(target, ⌊confirmed × opt-in⌋ × (1 − holdout))
  const confirmedPreB4 = ref.confirmed + rnd(acq.reduce((t, b) => t + b.extra_regs, 0) * g('added_confirm_rate'));
  const optin = g('b4_optin'), holdoutShare = g('b4_holdout'), target = g('b4_treated');
  const eligibleOptin = Math.floor(confirmedPreB4 * optin + 1e-9), treatable = Math.floor(eligibleOptin * (1 - holdoutShare) + 1e-9);
  const treated = Math.min(target, treatable);
  // two-wave cadence (pre-event + day-of): the 2nd wave raises visits per treated person, never the treated count
  const wave1 = g('b4_lift_pp'), wave2 = g('b4_wave2_pp'), liftPp = wave1 + wave2;
  const reminderInfo = {
    target, confirmed: confirmedPreB4, optin_rate: optin, eligible_optin: eligibleOptin, holdout_share: holdoutShare, holdout: eligibleOptin - treatable, treatable, treated, waves: wave2 > 0 ? 2 : 1, wave1_pp: wave1, wave2_pp: wave2, lift_pp: liftPp,
    required_eligible: Math.ceil(target / (1 - holdoutShare) - 1e-9), required_confirmed: Math.ceil(target / (1 - holdoutShare) / optin - 1e-9), feasible: target <= treatable,
  };
  const bets: BetResult[] = [...acq, { id: 'B4', kind: 'turnout', extra_regs: 0, visitors: rnd(treated * liftPp / 100), budget: g('b4_budget'), formula: wave2 > 0 ? `${treated} treated × (${wave1} pp pre-event + ${wave2} pp day-of) = ${rnd(liftPp * 10) / 10} pp` : `${treated} treated × ${wave1} pp` }];
  const acqVisitors = bets.filter((b) => b.kind === 'acquisition').reduce((t, b) => t + b.visitors, 0);
  const reminder = bets.find((b) => b.id === 'B4')!.visitors;
  const addedRegs = bets.reduce((t, b) => t + b.extra_regs, 0);
  const addedConfirmed = rnd(addedRegs * g('added_confirm_rate'));
  const registrations = ref.registered + addedRegs;
  const confirmed = ref.confirmed + addedConfirmed;
  const registeredVisitors = ref.visitors + acqVisitors + reminder;
  const walkins = g('walkins');
  const total = registeredVisitors + walkins;
  const betsSpend = bets.reduce((t, b) => t + b.budget, 0);
  const spend = ref.spend + betsSpend;
  const cap = g('cap_inr');
  const d1 = g('day1_visitors'), d2 = g('day2_visitors'), rep = g('repeat_visitors');
  const identified = g('identified_pre_event');
  return {
    scenario: s,
    reach: {
      pool, reached: g('reach_dedup'), identified, identified_of_reach: identified / g('reach_dedup'),
      regs_per_identified: registrations / identified, historical_regs_per_identified: g('historical_regs_per_identified'),
    },
    reference: ref, bets, reminder: reminderInfo, added_regs: addedRegs, added_confirmed: addedConfirmed, acquisition_visitors: acqVisitors, reminder_visitors: reminder,
    registrations, confirmed, registered_visitors: registeredVisitors, show_up_of_registrations: registeredVisitors / registrations,
    walkins, total, headline: Math.floor(total / 50) * 50,
    spend, bets_spend: betsSpend, reserve: cap - spend, cap,
    cpa: { registration: spend / registrations, visitor: spend / total, full_cap_visitor: cap / total },
    capacity: {
      day1: d1, day2: d2, repeat: rep, weekend_unique: d1 + d2 - rep, cap_weekend: g('cap_weekend'), cap_per_day: g('cap_per_day'),
      exceeds_weekend_cap: total > g('cap_weekend') || d1 + d2 - rep > g('cap_weekend'),
      exceeds_day_cap: Math.max(d1, d2) > g('cap_per_day'),
      scans_per_hour: g('qr_lanes') * g('scans_per_min') * 60,
    },
  };
}

/** Single source of truth for slides, Strategy page, Copilot and README. */
export function strategyModel(
  assumptions: Assumption[] = DEFAULT_ASSUMPTIONS,
  opts: { history?: CampaignHistory[]; planBudgets?: Record<string, number>; visitors2025?: number } = {},
): StrategyModel {
  const history = opts.history ?? DEFAULT_HISTORY;
  const plan = opts.planBudgets ?? DEFAULT_PLAN_BUDGETS;
  const v2025 = opts.visitors2025 ?? 2050;
  const base = scenarioResult(assumptions, 'base', history, plan, v2025);
  const stretch = scenarioResult(assumptions, 'stretch', history, plan, v2025);
  const rec = (r: ScenarioResult): Reconciliation => {
    const treated = r.reminder.treated, rm = r.reminder;
    const gap = r.total - r.capacity.weekend_unique;
    const flags = {
      reserve_nonnegative: r.reserve >= 0,
      budget_sums_to_cap: r.reserve >= 0 && r.reference.spend + r.bets_spend + r.reserve === r.cap,
      reach_within_pool: r.reach.reached <= r.reach.pool,
      identified_within_reach: r.reach.identified <= r.reach.reached,
      reminders_within_confirmed: treated <= r.confirmed,
      reminders_feasible: rm.feasible,
      day_split_reconciles: Math.abs(gap) <= 1,
    };
    const warnings = [
      !flags.reserve_nonnegative && `Spend ₹${r.spend.toLocaleString('en-US')} exceeds the ₹${r.cap.toLocaleString('en-US')} cap (reserve ${r.reserve < 0 ? '−' : ''}₹${Math.abs(r.reserve).toLocaleString('en-US')}).`,
      !flags.reach_within_pool && `Assumed deduplicated reach ${r.reach.reached.toLocaleString('en-US')} exceeds the working pool ${r.reach.pool.toLocaleString('en-US')}.`,
      !flags.identified_within_reach && `Identified people ${r.reach.identified.toLocaleString('en-US')} exceed reach ${r.reach.reached.toLocaleString('en-US')}.`,
      !flags.reminders_within_confirmed && `B4 treats ${treated.toLocaleString('en-US')} people but only ${r.confirmed.toLocaleString('en-US')} are confirmed registrants.`,
      !flags.reminders_feasible && `B4 target of ${rm.target.toLocaleString('en-US')} treated needs ≥ ${rm.required_eligible.toLocaleString('en-US')} opted-in eligible people at a ${Math.round(rm.holdout_share * 100)}% holdout (≥ ${rm.required_confirmed.toLocaleString('en-US')} confirmed at ${Math.round(rm.optin_rate * 100)}% opt-in); only ${rm.confirmed.toLocaleString('en-US')} are confirmed (${rm.eligible_optin.toLocaleString('en-US')} opted in). Treated is capped at ${rm.treated.toLocaleString('en-US')}.`,
      !flags.day_split_reconciles && `Day split (${r.capacity.day1} + ${r.capacity.day2} − ${r.capacity.repeat} = ${r.capacity.weekend_unique}) differs from the modeled total ${r.total} by ${gap}.`,
    ].filter((w): w is string => !!w);
    return { reminder: rm, raw_total: r.total, headline: r.headline, reference_spend: r.reference.spend, bets_spend: r.bets_spend, reserve: r.reserve, cap: r.cap, ...flags, day_split_gap: gap, warnings };
  };
  const sens = (r: ScenarioResult, s: Scenario) => ({
    no_reminders_no_walkins: r.total - r.reminder_visitors - r.walkins,
    showup_drop_pp: lookup(assumptions, 'showup_drop_pp', s),
    showup_drop_visitors: -rnd(r.registrations * lookup(assumptions, 'showup_drop_pp', s) / 100),
  });
  return {
    base, stretch,
    reconciliation: { base: rec(base), stretch: rec(stretch) },
    sensitivity: { base: sens(base, 'base'), stretch: sens(stretch, 'stretch') },
    growth_vs_2025: { base: base.headline / v2025 - 1, stretch: stretch.headline / v2025 - 1 },
  };
}

export interface BetScoreInput { id: string; impact: number; confidence: number; ease: number }
/** score = (wI·I + wC·C + wE·E) / 5 × 100, rounded; sorted descending (stable on ties). */
export function scoreBets(bets: BetScoreInput[], w = { impact: 0.5, confidence: 0.3, ease: 0.2 }) {
  return bets
    .map((b) => {
      const parts = { impact: w.impact * b.impact, confidence: w.confidence * b.confidence, ease: w.ease * b.ease };
      return { id: b.id, score: rnd(((parts.impact + parts.confidence + parts.ease) / 5) * 100), contributions: parts };
    })
    .sort((x, y) => y.score - x.score);
}
