/** Default strategy assumptions. Kind: data (D, from the 2025 dataset), sourced (S, benchmark), assumption (A). */
export type AssumptionKind = 'sourced' | 'assumption' | 'data';
export type AssumptionScenario = 'base' | 'stretch' | 'all';
export interface Assumption {
  key: string; scenario: AssumptionScenario; group: string; value: number; unit: string; label: string;
  kind: AssumptionKind; source_ref?: string;
}

const a = (group: string, key: string, scenario: AssumptionScenario, value: number, unit: string, label: string, kind: AssumptionKind, source_ref?: string): Assumption =>
  ({ key, scenario, group, value, unit, label, kind, source_ref });
const both = (group: string, key: string, base: number, stretch: number, unit: string, label: string, kind: AssumptionKind, source_ref?: string): Assumption[] =>
  [a(group, key, 'base', base, unit, label, kind, source_ref), a(group, key, 'stretch', stretch, unit, label, kind, source_ref)];

/** Plan budget per campaign, next edition (₹180k reference). Editable via campaigns.plan_budget_inr. */
export const DEFAULT_PLAN_BUDGETS: Record<string, number> = { C01: 42000, C02: 35000, C03: 23000, C04: 31000, C05: 19000, C06: 14000, C07: 16000 };

/** 2025 first-touch outcomes at 2025-04-20 (golden-tested equal to the dataset). h = net spend at close. */
export interface CampaignHistory { campaign_id: string; name: string; spend: number; registered: number; confirmed: number; visitors: number }
export const DEFAULT_HISTORY: CampaignHistory[] = [
  { campaign_id: 'C01', name: 'Campus Ambassadors', spend: 42000, registered: 520, confirmed: 480, visitors: 390 },
  { campaign_id: 'C02', name: 'Paid Social', spend: 93000, registered: 680, confirmed: 580, visitors: 340 },
  { campaign_id: 'C03', name: 'Creator Partners', spend: 59000, registered: 350, confirmed: 290, visitors: 175 },
  { campaign_id: 'C04', name: 'College Partnerships', spend: 31000, registered: 450, confirmed: 420, visitors: 385 },
  { campaign_id: 'C05', name: 'Student Referrals', spend: 19000, registered: 350, confirmed: 320, visitors: 275 },
  { campaign_id: 'C06', name: 'Organic Search', spend: 14000, registered: 250, confirmed: 225, visitors: 195 },
  { campaign_id: 'C07', name: 'Community Groups', spend: 16000, registered: 200, confirmed: 185, visitors: 165 },
];

export const DEFAULT_ASSUMPTIONS: Assumption[] = [
  // reach (A) — working pool and reach model
  a('reach', 'pool_club_campuses', 'all', 25, 'campuses', 'Club-linked campuses', 'assumption', 'findings.md §Audience'),
  a('reach', 'pool_per_club_campus', 'all', 2000, 'students', 'Eligible students per club campus', 'assumption', 'findings.md §Audience'),
  a('reach', 'pool_catchments', 'all', 20, 'catchments', 'Additional campus catchments', 'assumption', 'findings.md §Audience'),
  a('reach', 'pool_per_catchment', 'all', 1500, 'students', 'Students per catchment', 'assumption', 'findings.md §Audience'),
  a('reach', 'pool_alumni_interest', 'all', 40000, 'people', 'Young alumni and interest-community prospects', 'assumption', 'findings.md §Audience'),
  ...both('reach', 'reach_dedup', 80000, 105000, 'people', 'Assumed deduplicated reach', 'assumption', 'findings.md §Base and stretch'),
  ...both('reach', 'identified_pre_event', 5000, 6000, 'people', 'Identified pre-event external people', 'assumption', 'findings.md §Base and stretch'),
  a('reach', 'historical_regs_per_identified', 'all', 0.772, 'ratio', '2025 registered / identified (2,800 / 3,625)', 'data', 'metrics.json @ 2025-04-20'),
  // reference
  a('reference', 'marginal_efficiency', 'all', 0.6, 'ratio', 'Marginal efficiency of spend above 2025 level', 'assumption'),
  // bets: B1 group passes
  ...both('bets', 'b1_clubs', 15, 18, 'clubs', 'B1 activated clubs', 'assumption'),
  ...both('bets', 'b1_regs_per_club', 20, 25, 'regs', 'B1 extra registrations per club', 'assumption'),
  ...both('bets', 'b1_show', 0.8, 0.85, 'ratio', 'B1 turnout (2025 C04: 85.6%)', 'assumption', 'metrics.json C04'),
  ...both('bets', 'b1_budget', 33000, 33000, 'INR', 'B1 budget', 'assumption'),
  // B2 ambassadors
  ...both('bets', 'b2_regs', 250, 360, 'regs', 'B2 extra registrations', 'assumption'),
  ...both('bets', 'b2_show', 0.72, 0.78, 'ratio', 'B2 turnout', 'assumption'),
  ...both('bets', 'b2_budget', 24000, 24000, 'INR', 'B2 budget', 'assumption'),
  // B3 referrals
  ...both('bets', 'b3_visits', 1250, 1500, 'visits', 'B3 qualified referral visits', 'assumption'),
  ...both('bets', 'b3_conv', 0.16, 0.2, 'ratio', 'B3 visit→registration (commerce referral median 14–15%)', 'sourced', 'sources.md'),
  ...both('bets', 'b3_show', 0.75, 0.8, 'ratio', 'B3 turnout', 'assumption'),
  ...both('bets', 'b3_budget', 18000, 18000, 'INR', 'B3 budget', 'assumption'),
  // B5 retargeting
  ...both('bets', 'b5_regs', 60, 125, 'regs', 'B5 extra registrations', 'assumption'),
  ...both('bets', 'b5_show', 0.5, 0.56, 'ratio', 'B5 turnout', 'assumption'),
  ...both('bets', 'b5_budget', 6000, 12000, 'INR', 'B5 budget (2nd ₹6k tranche from reserve, gated)', 'assumption'),
  // B4 WhatsApp
  ...both('reminders', 'b4_treated', 1750, 2229, 'people', 'B4 target treated (capped at ⌊⌊confirmed × opt-in⌋ × (1 − holdout)⌋)', 'assumption'),
  ...both('reminders', 'b4_optin', 0.9, 0.9, 'ratio', 'B4 share of confirmed registrants who opted in to WhatsApp', 'assumption'),
  ...both('reminders', 'b4_holdout', 0.2, 0.2, 'ratio', 'B4 holdout share of opted-in confirmed registrants (stratified ~20%)', 'assumption'),
  ...both('reminders', 'b4_lift_pp', 4.0, 5.8, 'pp', 'B4 show-up lift (healthcare SMS benchmark)', 'sourced', 'sources.md'),
  ...both('reminders', 'b4_wave2_pp', 0, 0.7, 'pp', 'ASSUMPTION: incremental show-up lift from a 2nd, day-of reminder wave (base: pre-event wave only). ~12% of the wave-1 lift, i.e. strongly diminishing returns on the same people; UNTESTED until the day-of increment is measured: pre-event + day-of vs pre-event-only among treated people (the holdout alone measures only the combined program effect)', 'assumption'),
  ...both('reminders', 'b4_budget', 12000, 12000, 'INR', 'B4 budget', 'assumption'),
  ...both('bets', 'added_confirm_rate', 0.9, 0.92, 'ratio', 'Share of added registrations that confirm', 'assumption'),
  // walk-ins
  ...both('walkins', 'walkins', 125, 125, 'people', 'Verified walk-ins (2025 actual, capacity-limited)', 'data', 'metrics.json'),
  // budget
  a('budget', 'cap_inr', 'all', 300000, 'INR', 'Marketing cap', 'data', 'Targets: revised plan'),
  // capacity
  a('capacity', 'cap_concurrent', 'all', 1700, 'people', 'Max concurrent external visitors', 'assumption'),
  a('capacity', 'cap_per_day', 'all', 1800, 'people', 'Max distinct external visitors / day', 'assumption'),
  a('capacity', 'cap_weekend', 'all', 3000, 'people', 'Max unique external visitors over the weekend', 'assumption'),
  a('capacity', 'qr_lanes', 'all', 4, 'lanes', 'QR scan lanes', 'assumption'),
  a('capacity', 'scans_per_min', 'all', 8, 'scans/min/lane', 'Scans per minute per lane', 'assumption'),
  ...both('capacity', 'day1_visitors', 1400, 1600, 'people', 'Day-1 distinct visitors', 'assumption'),
  ...both('capacity', 'day2_visitors', 1300, 1600, 'people', 'Day-2 distinct visitors', 'assumption'),
  ...both('capacity', 'repeat_visitors', 300, 350, 'people', 'Repeat visitors across days', 'assumption'),
  // sensitivity
  a('sensitivity', 'showup_drop_pp', 'all', 5, 'pp', 'Show-up drop stress test', 'assumption'),
  // projection
  a('projection', 'showup_low', 'all', 0.647, 'ratio', 'Show-up low (Vihaya benchmark 64.7%)', 'sourced', 'sources.md'),
  a('projection', 'showup_mid', 'all', 0.7, 'ratio', 'Show-up mid', 'assumption'),
  a('projection', 'showup_high', 'all', 0.72, 'ratio', 'Show-up high (PheedLoop free-event ~72%)', 'sourced', 'sources.md'),
  a('projection', 'walkin_allowance', 'all', 100, 'people', 'Walk-in allowance in projection', 'assumption'),
  // scoring weights
  a('weights', 'w_impact', 'all', 0.5, 'weight', 'Weight: impact', 'assumption'),
  a('weights', 'w_confidence', 'all', 0.3, 'weight', 'Weight: confidence', 'assumption'),
  a('weights', 'w_ease', 'all', 0.2, 'weight', 'Weight: ease', 'assumption'),
];
