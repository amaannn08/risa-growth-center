import { DEFAULT_ASSUMPTIONS, DEFAULT_HISTORY, DEFAULT_PLAN_BUDGETS, type Assumption, type CampaignHistory } from './defaults';

export type Scenario = 'base' | 'stretch';
/** Float-safe rounding (e.g. 18×25×0.85 = 382.5 → 383). */
const pc = (x: number) => rnd(x * 10000) / 100;
export const rnd = (x: number) => Math.round(x + 1e-9);

export function lookup(as: Assumption[], key: string, scenario: Scenario): number {
  const hit = as.find((x) => x.key === key && x.scenario === scenario) ?? as.find((x) => x.key === key && x.scenario === 'all');
  if (!hit) throw new Error(`Missing assumption ${key} (${scenario})`);
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
  added_regs: number; added_confirmed: number; acquisition_visitors: number; reminder_visitors: number;
  registrations: number; confirmed: number; registered_visitors: number; show_up_of_registrations: number;
  walkins: number; total: number; headline: number;
  spend: number; bets_spend: number; reserve: number; cap: number;
  cpa: { registration: number; visitor: number; full_cap_visitor: number };
  capacity: { day1: number; day2: number; repeat: number; weekend_unique: number; cap_weekend: number; cap_per_day: number;
    exceeds_weekend_cap: boolean; exceeds_day_cap: boolean; scans_per_hour: number };
}
export interface StrategyModel {
  base: ScenarioResult; stretch: ScenarioResult;
  reconciliation: Record<Scenario, { raw_total: number; headline: number; reference_spend: number; bets_spend: number; reserve: number; cap: number; budget_sums_to_cap: boolean }>;
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
  const bets: BetResult[] = [
    { id: 'B1', kind: 'acquisition', extra_regs: rnd(b1r), visitors: rnd(b1r * g('b1_show')), budget: g('b1_budget'), formula: `${g('b1_clubs')} clubs × ${g('b1_regs_per_club')} regs × ${pc(g('b1_show'))}%` },
    { id: 'B2', kind: 'acquisition', extra_regs: g('b2_regs'), visitors: rnd(g('b2_regs') * g('b2_show')), budget: g('b2_budget'), formula: `${g('b2_regs')} regs × ${pc(g('b2_show'))}%` },
    { id: 'B3', kind: 'acquisition', extra_regs: rnd(b3r), visitors: rnd(rnd(b3r) * g('b3_show')), budget: g('b3_budget'), formula: `${g('b3_visits')} visits × ${pc(g('b3_conv'))}% × ${pc(g('b3_show'))}%` },
    { id: 'B5', kind: 'acquisition', extra_regs: g('b5_regs'), visitors: rnd(g('b5_regs') * g('b5_show')), budget: g('b5_budget'), formula: `${g('b5_regs')} regs × ${pc(g('b5_show'))}%` },
    { id: 'B4', kind: 'turnout', extra_regs: 0, visitors: rnd(g('b4_treated') * g('b4_lift_pp') / 100), budget: g('b4_budget'), formula: `${g('b4_treated')} treated × ${g('b4_lift_pp')} pp` },
  ];
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
    reference: ref, bets, added_regs: addedRegs, added_confirmed: addedConfirmed, acquisition_visitors: acqVisitors, reminder_visitors: reminder,
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
  const rec = (r: ScenarioResult) => ({
    raw_total: r.total, headline: r.headline, reference_spend: r.reference.spend, bets_spend: r.bets_spend, reserve: r.reserve, cap: r.cap,
    budget_sums_to_cap: r.reference.spend + r.bets_spend + r.reserve === r.cap,
  });
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
