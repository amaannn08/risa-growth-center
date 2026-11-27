/**
 * 34 eval items (plan §10). Each item has:
 *  - `calls`: deterministic tool calls used by test/tools.test.ts (no LLM) — they prove the ground truth independently of the model;
 *  - `tools`: any-of tools the LLM is expected to call (eval runner);
 *  - `must` / `mustNot`: numeric tokens are matched numerically (tolerance by decimals), other strings case-insensitively
 *    (regex when wrapped in /…/i). Sources of the expected numbers are in comments (findings.md / data_audit.md / engine re-derivation).
 */
export interface SetupOp { entity: string; action: string; input: Record<string, unknown> }
export interface EvalItem {
  id: number; q: string; /** earlier user turns sent in the same conversation first */ before?: string[];
  context?: { asOf?: string; attribution?: string; page?: string };
  setup?: SetupOp[]; tools: string[]; calls: { tool: string; args: Record<string, unknown> }[];
  must: string[]; mustNot?: string[]; kind?: 'normal' | 'refusal' | 'draft'; source: string;
}

const REFUSAL = '/not (available|in the data)|cannot|can.?t|doesn.?t (contain|include|have)|no .* (field|data)|isn.?t (in|available)/i';

export const ITEMS: EvalItem[] = [
  { id: 1, q: "What's our funnel as of data close?", tools: ['get_funnel'], calls: [{ tool: 'get_funnel', args: {} }],
    must: ['3,625', '3,317', '2,800', '2,500', '2,050', '274,000'], source: 'metrics.json 2025-04-20 overall' },
  { id: 2, q: 'How close were we to target on 20 April?', tools: ['get_targets'], calls: [{ tool: 'get_targets', args: { as_of: '2025-04-20' } }],
    must: ['100.69', '87.5', '93.18', '91.33'], source: 'target_progress 04-20: 3625/3600, 2800/3200, 2050/2200, 274000/300000' },
  { id: 3, q: 'What was our spend at event close vs data close, and why are they different?', tools: ['get_spend_ledger', 'get_funnel'], calls: [{ tool: 'get_spend_ledger', args: { through: '2025-04-20' } }],
    must: ['276,500', '274,000', '2,000', '500', '23,500', '26,000'], source: 'findings: credits C03 −2,000 on 2025-04-16, C05 −500 on 2025-04-18' },
  { id: 4, q: 'Which target applied on 14 March vs 15 March and what moved?', tools: ['get_targets', 'get_funnel'],
    calls: [{ tool: 'get_targets', args: { as_of: '2025-03-14' } }, { tool: 'get_targets', args: { as_of: '2025-03-15' } }, { tool: 'get_funnel', args: { as_of: '2025-03-14' } }, { tool: 'get_funnel', args: { as_of: '2025-03-15' } }],
    must: ['launch', 'revised', '3,200', '3,600', '2,200', '300,000', '2,329', '2,393', '1,506', '1,562'], source: 'metrics.json snapshots 03-14 / 03-15' },
  { id: 5, q: 'On 11 April how many registrations were confirmed, cancelled and waitlisted, and how many still interested?', tools: ['get_funnel'], calls: [{ tool: 'get_funnel', args: { as_of: '2025-04-11' } }],
    must: ['2,500', '183', '88', '29'], source: 'metrics.json 04-11 latest_status_by_person_distinct_within_status' },
  { id: 6, q: 'How many people came on Sunday and how many of them were new?', tools: ['get_attendance'], calls: [{ tool: 'get_attendance', args: {} }],
    must: ['1,345', '620', '725'], source: 'attendance_by_event_day 2025-04-13' },
  { id: 7, q: 'Why do 3,390 check-in rows give only 2,050 visitors?', tools: ['data_quality'], calls: [{ tool: 'data_quality', args: {} }],
    must: ['20', '50', '30', '40', '3,250', '2,050'], source: 'data_audit.md check-ins reconciliation' },
  { id: 8, q: 'What happened to registration R0001?', tools: ['lookup_registration'], calls: [{ tool: 'lookup_registration', args: { registration_id: 'R0001' } }],
    must: ['cancel', 'reconfirm|confirmed again|confirmed', '11:00'], source: 'RH000003 cancelled 2025-03-08, RH000004 confirmed 2025-03-15T11:00+05:30' },
  { id: 9, q: "What's the registered show-up rate? Is 2,050/2,800 right?", tools: ['get_funnel'], calls: [{ tool: 'get_funnel', args: {} }],
    must: ['68.75', '1,925', '73.21', '125', '77.0'], source: 'registered show-up 1925/2800; headline 2050/2800 includes 125 walk-ins; confirmed 1925/2500' },
  { id: 10, before: ["What's the registered show-up rate? Is 2,050/2,800 right?"], q: 'And for Paid Social?', tools: ['get_funnel'], calls: [{ tool: 'get_funnel', args: { campaign_id: 'C02' } }],
    must: ['50.0', '340', '680', '58.62'], source: 'C02 first-touch: 340/680, confirmed 340/580' },
  { id: 11, q: 'Which campaign has the lowest cost per visitor?', tools: ['compare_campaigns'], calls: [{ tool: 'compare_campaigns', args: { metric: 'visitor_cpa', order: 'asc' } }],
    must: ['Student Referrals', '69.09', '71.79', '80.52'], source: 'rates.cpa_per_attendee_inr C05, C06, C04' },
  { id: 12, q: 'Does College Partnerships really beat Creator Partners?', tools: ['compare_campaigns', 'get_funnel'],
    calls: [{ tool: 'compare_campaigns', args: { metric: 'registered_show_up', campaign_ids: ['C04', 'C03'] } }, { tool: 'compare_campaigns', args: { metric: 'visitor_cpa', campaign_ids: ['C04', 'C03'] } }, { tool: 'compare_campaigns', args: { metric: 'visitors', campaign_ids: ['C04', 'C03'] } }],
    must: ['385', '175', '85.56', '50.0', '80.52', '337.14', '/observational|not causal|correlation|causal/i'], source: 'C04 385 visitors/450 regs; C03 175/350; CPA 31000/385, 59000/175' },
  { id: 13, q: 'Where is the biggest bottleneck?', tools: ['diagnose_bottlenecks'], calls: [{ tool: 'diagnose_bottlenecks', args: {} }],
    must: ['Paid Social', '240', '575', '700'], source: '§4.2: C02 confirmed no-shows 580−340; overall 2500−1925; 3500−2800' },
  { id: 14, q: 'What happened to Paid Social in early March?', tools: ['get_trend'], calls: [{ tool: 'get_trend', args: { metric: 'registrations_per_click', campaign_id: 'C02', granularity: 'week' } }],
    must: ['105', '988', '35', '871', '10.6', '4.0', '/not in (the )?data|cause|hypothes/i'], source: 'weekly C02 wk to 2025-03-09 vs prior; cause not in data' },
  { id: 15, q: 'Why did College Partnerships register nobody the week of 9 March?', tools: ['get_trend', 'describe_data'], calls: [{ tool: 'get_trend', args: { metric: 'registrations', campaign_id: 'C04', granularity: 'week' } }],
    must: ['464', '64', '77', '80', '97', '/not in (the )?data|no (cause|reason)|hypothes|cannot/i'], source: 'weekly C04 wk to 2025-03-09: 0 regs on 464 clicks, then 64/77/80/97' },
  { id: 16, q: "What's our unique reach?", kind: 'refusal', tools: ['describe_data', 'get_funnel'], calls: [{ tool: 'describe_data', args: { topic: 'reach' } }],
    must: ['666,297', '/non-?unique|not unique|no dedup|cannot|not available/i'], source: 'reach is a non-unique daily sum (666,297)' },
  { id: 17, q: 'What was ticket revenue?', kind: 'refusal', tools: ['describe_data'], calls: [{ tool: 'describe_data', args: { topic: 'revenue' } }],
    must: [REFUSAL], mustNot: ['₹[0-9]{3,}.*revenue'], source: 'KNOWN_MISSING: revenue, ticket price' },
  { id: 18, q: "What's the gender split of attendees?", kind: 'refusal', tools: ['describe_data'], calls: [{ tool: 'describe_data', args: { topic: 'gender' } }],
    must: [REFUSAL], mustNot: ['[0-9]+(\\.[0-9]+)?\\s?% (male|female)'], source: 'KNOWN_MISSING: gender / demographics' },
  { id: 19, q: 'Why did people cancel? Then create a reminder task.', kind: 'draft', tools: ['describe_data', 'get_funnel', 'propose_task'],
    calls: [{ tool: 'describe_data', args: { topic: 'cancel' } }, { tool: 'get_funnel', args: {} }, { tool: 'propose_task', args: { title: 'Send reconfirmation reminder to confirmed registrants', priority: 'p1', evidence: [{ tool: 'get_funnel', metric: 'cancelled', value: 183 }] } }],
    must: ['183', '/no (reason|field)|not in (the )?data|cannot|not available/i', '/confirm/i'], mustNot: ['/(task|it) (has been|was|is now) created/i'], source: 'status cancelled 183; no cancellation-reason field' },
  { id: 20, q: 'What if we move ₹10k from Paid Social to College Partnerships?', tools: ['what_if'],
    calls: [{ tool: 'what_if', args: { kind: 'budget_shift', from_campaign_id: 'C02', to_campaign_id: 'C04', amount_inr: 10000, as_of: '2025-04-20' } }],
    must: ['124', '37', '88', '/scenario|assumption/i'], source: '§4.5: 10000/80.52=124.19; 10000/273.53=36.56; net 87.63' },
  { id: 21, q: "What would visitor CPA be if we'd spent the full ₹300,000?", tools: ['calculate', 'get_funnel'], calls: [{ tool: 'calculate', args: { expression: '300000/2050' } }],
    must: ['146.34'], source: '300000/2050 = 146.34' },
  { id: 22, q: "What's the next-edition plan and how confident are we?", tools: ['get_strategy_model'], calls: [{ tool: 'get_strategy_model', args: {} }],
    must: ['2,400', '2,850', '273,000', '2,206', '/assum/i'], source: '§7 strategy model' },
  { id: 23, q: 'Create a task for Meera to launch the group-pass pilot by 2026-01-20', kind: 'draft', tools: ['propose_task'],
    calls: [{ tool: 'propose_task', args: { title: 'Launch the group-pass pilot', owner_id: 'Meera', due_date: '2026-01-20', priority: 'p1', bet_id: 'B1', evidence: [] } }],
    must: ['/confirm/i', '2026-01-20|20 Jan'], mustNot: ['/(task|it) (has been|was|is now) created/i'], source: 'draft only until the user confirms' },
  { id: 24, q: 'What tasks are open for Paid Social?', tools: ['list_tasks'], calls: [{ tool: 'list_tasks', args: { campaign_id: 'Paid Social' } }],
    must: ['Audit Paid Social landing page'], source: 'seeded starter task #1 (C02)' },
  { id: 25, q: 'What are the stop thresholds for the referral experiment?', tools: ['list_experiments'], calls: [{ tool: 'list_experiments', args: { bet_id: 'B3' } }],
    must: ['10', '5', '180'], source: '§8: <10% visit→reg · abuse >5% · >₹180 per incremental visitor' },
  { id: 26, q: "Total spend at data close and Paid Social's cost per visitor?", before: [],
    setup: [{ entity: 'daily_marketing', action: 'add', input: { campaign_id: 'C02', activity_date: '2025-04-16', marketing_spend_inr: 1000, platform: 'eval' } }],
    tools: ['get_funnel', 'compare_campaigns'], calls: [{ tool: 'get_funnel', args: {} }, { tool: 'get_funnel', args: { campaign_id: 'C02' } }, { tool: 'get_spend_ledger', args: { through: '2025-04-13' } }],
    must: ['275,000', '94,000', '276.47', '25,000'], source: '§13 mutation semantics: +₹1,000 C02 on 2025-04-16; 13 Apr still ₹276,500' },
  { id: 27, q: 'How many identified people and verified visitors do we have now, and what is the registered show-up?',
    setup: [
      { entity: 'person', action: 'add', input: { person_name: 'Eval Walkin', person_type: 'external', first_seen_at: '2025-04-13T10:00:00+05:30', first_touch_source: 'walk_in' } },
      { entity: 'checkin', action: 'add', input: { event_id: 'CHK-EVAL-WALKIN', person_id: 'E-U1', occurred_at: '2025-04-13T10:30:00+05:30', result: 'admitted', verification: 'verified', source: 'manual' } },
    ],
    tools: ['get_funnel'], calls: [{ tool: 'get_funnel', args: {} }], must: ['2,051', '3,626', '68.75'], source: '§13: walk-in + verified unattributed check-in → visitors 2,051, identified 3,626, show-up unchanged' },
  { id: 28, q: 'How many visitors do we have now, and how many verified admission events?',
    setup: [{ entity: 'checkin', action: 'add', input: { event_id: 'CHK-EVAL-EXTRA', person_id: 'E0002', occurred_at: '2025-04-13T12:00:00+05:30', result: 'admitted', verification: 'verified', source: 'manual', registration_id: 'R0002' } }],
    tools: ['get_funnel', 'data_quality'], calls: [{ tool: 'get_funnel', args: {} }, { tool: 'data_quality', args: {} }], must: ['2,050', '3,251'], source: '§13: extra verified event for existing visitor → events 3,251, visitors 2,050' },
  { id: 29, q: 'Which campaigns are active?', setup: [{ entity: 'campaign', action: 'update', input: { id: 'C02', patch: { status: 'paused' } } }],
    tools: ['list_campaigns'], calls: [{ tool: 'list_campaigns', args: {} }], must: ['Paid Social', '/paused|not active|inactive|excluded|not among|does not appear|not (in|listed)/i'], source: 'management status' },
  { id: 30, q: 'What is our progress vs the visitor target at event close?',
    setup: [{ entity: 'target_version', action: 'add', input: { effective_at: '2025-04-01T09:00:00+05:30', target_version: 'Eval stretch plan', identified_external_people_goal: 3600, registration_goal: 3200, unique_external_visitors_goal: 2500, marketing_budget_inr: 300000 } }],
    context: { asOf: '2025-04-20' }, tools: ['get_targets'], calls: [{ tool: 'get_targets', args: { as_of: '2025-04-20' } }], must: ['2,050', '2,500', '82.0', 'Eval stretch plan'], source: '§13 + e2e (e): 2,050/2,500 = 82.0%' },
  { id: 31, q: 'How many attended without registering, and what is the scanner-only count?', tools: ['get_attendance', 'data_quality'], calls: [{ tool: 'get_attendance', args: {} }],
    must: ['125', '1,885', '165'], source: 'walk-ins 125; scanner_total 1,885; manual_only 165' },
  { id: 32, q: 'CTR of Paid Social vs Organic Search?', tools: ['compare_campaigns', 'get_funnel'], calls: [{ tool: 'compare_campaigns', args: { metric: 'ctr', campaign_ids: ['C02', 'C06'] } }],
    must: ['2.11', '3.51'], source: 'engine re-derivation: clicks/impressions C02 0.02108427, C06 0.03514517 (observations, directional)' },
  { id: 33, q: 'What attendance will we get if we double paid budget next year?', tools: ['what_if', 'get_strategy_model'],
    calls: [{ tool: 'what_if', args: { kind: 'budget_shift', from_campaign_id: 'C06', to_campaign_id: 'C02', amount_inr: 10000, method: 'diminishing', as_of: '2025-04-20' } }],
    must: ['/scenario|assumption|projection|estimate/i', '/unmeasured|not measured|cannot be measured|no evidence|diminishing|uncertain/i'], mustNot: ['/\\bwill (get|reach|attract|bring)\\b/i'], source: 'marginal returns unmeasured; scenario only' },
  { id: 34, q: 'How did the campaign do?', tools: ['get_funnel'], calls: [{ tool: 'get_funnel', args: {} }],
    must: ['2,050', '/20 Apr|2025-04-20|data close|as of|overall/i'], source: 'ambiguous: defaults to overall at the as-of date' },
];

export const itemById = (id: number) => ITEMS.find((i) => i.id === id)!;
