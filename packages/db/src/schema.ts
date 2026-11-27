import {
  boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

const ts = (n: string) => timestamp(n, { withTimezone: true, mode: 'string' });
const prov = () => text('provenance').notNull().default('seed');

export const campaignStatus = pgEnum('campaign_status', ['active', 'paused', 'stopped']);
export const regStatus = pgEnum('reg_status', ['interested', 'confirmed', 'cancelled', 'waitlisted']);
export const taskStatus = pgEnum('task_status', ['todo', 'in_progress', 'blocked', 'done']);
export const priority = pgEnum('priority', ['p0', 'p1', 'p2']);
export const createdVia = pgEnum('created_via', ['manual', 'insight', 'copilot']);
export const betStatus = pgEnum('bet_status', ['proposed', 'approved', 'running', 'scaled', 'changed', 'stopped']);
export const expStatus = pgEnum('exp_status', ['draft', 'planned', 'running', 'readout', 'scaled', 'changed', 'stopped']);
export const scenarioEnum = pgEnum('scenario', ['base', 'stretch', 'all']);
export const kindEnum = pgEnum('assumption_kind', ['sourced', 'assumption', 'data']);
export const ruleMode = pgEnum('rule_mode', ['pre_event', 'post_event']);
export const draftKind = pgEnum('draft_kind', ['task', 'campaign_update', 'experiment_readout']);
export const draftStatus = pgEnum('draft_status', ['pending', 'confirmed', 'discarded']);
export const actorEnum = pgEnum('actor', ['user', 'copilot_confirmed', 'system']);
export const auditAction = pgEnum('audit_action', ['create', 'update', 'delete', 'reset']);

export const appMeta = pgTable('app_meta', {
  id: integer('id').primaryKey().default(1),
  data_revision: integer('data_revision').notNull().default(1),
  /** Bumped only by writes that affect the analytics dataset (cache key for loadDataset). */
  dataset_revision: integer('dataset_revision').notNull().default(1),
  seeded_at: ts('seeded_at'),
  source_sha256: text('source_sha256'),
  edits_since_reset: integer('edits_since_reset').notNull().default(0),
});

export const event = pgTable('event', {
  event_name: text('event_name').primaryKey(),
  history_start: ts('history_start').notNull(), history_end: ts('history_end').notNull(),
  event_starts_at: ts('event_starts_at').notNull(), event_ends_at: ts('event_ends_at').notNull(),
  timezone: text('timezone').notNull(), currency: text('currency').notNull(), fictional: boolean('fictional').notNull(),
  provenance: prov(),
});

export const targetVersions = pgTable('target_versions', {
  effective_at: ts('effective_at').primaryKey(),
  target_version: text('target_version').notNull(),
  identified_external_people_goal: integer('identified_external_people_goal').notNull(),
  registration_goal: integer('registration_goal').notNull(),
  unique_external_visitors_goal: integer('unique_external_visitors_goal').notNull(),
  marketing_budget_inr: integer('marketing_budget_inr').notNull(),
  note: text('note'),
  provenance: prov(),
});

export const campaigns = pgTable('campaigns', {
  campaign_id: text('campaign_id').primaryKey(),
  campaign_name: text('campaign_name').notNull(), channel: text('channel').notNull(),
  target_audience: text('target_audience'), objective: text('objective'),
  owner_id: text('owner_id'), owner_name: text('owner_name'),
  created_at: ts('created_at'), planned_start_at: ts('planned_start_at'), planned_end_at: ts('planned_end_at'),
  status: campaignStatus('status').notNull().default('active'),
  plan_budget_inr: integer('plan_budget_inr'),
  notes: text('notes'),
  provenance: prov(),
});

export const dailyMarketing = pgTable('daily_marketing', {
  activity_id: text('activity_id').primaryKey(),
  campaign_id: text('campaign_id').notNull().references(() => campaigns.campaign_id),
  activity_date: date('activity_date', { mode: 'string' }).notNull(),
  platform: text('platform'),
  impressions: integer('impressions').notNull(), clicks: integer('clicks').notNull(), reported_reach: integer('reported_reach').notNull(),
  landing_page_sessions: integer('landing_page_sessions').notNull(), registration_starts: integer('registration_starts').notNull(),
  marketing_spend_inr: integer('marketing_spend_inr').notNull(),
  campaign_name: text('campaign_name'), owner_id: text('owner_id'), owner_name: text('owner_name'),
  provenance: prov(),
}, (t) => [index('dm_campaign_date').on(t.campaign_id, t.activity_date)]);

export const people = pgTable('people', {
  person_id: text('person_id').primaryKey(),
  person_name: text('person_name'), person_type: text('person_type').notNull(), first_touch_source: text('first_touch_source'),
  first_seen_at: ts('first_seen_at').notNull(),
  first_campaign_id: text('first_campaign_id').references(() => campaigns.campaign_id),
  first_campaign_name: text('first_campaign_name'), owner_id: text('owner_id'), owner_name: text('owner_name'),
  provenance: prov(),
});

export const interactions = pgTable('interactions', {
  interaction_id: text('interaction_id').primaryKey(),
  person_id: text('person_id').notNull().references(() => people.person_id),
  campaign_id: text('campaign_id').references(() => campaigns.campaign_id),
  occurred_at: ts('occurred_at').notNull(), event_type: text('event_type').notNull(), detail: text('detail'),
  person_name: text('person_name'), campaign_name: text('campaign_name'), owner_id: text('owner_id'), owner_name: text('owner_name'),
  provenance: prov(),
}, (t) => [index('int_person').on(t.person_id), index('int_at').on(t.occurred_at)]);

export const registrations = pgTable('registrations', {
  registration_id: text('registration_id').primaryKey(),
  person_id: text('person_id').notNull().references(() => people.person_id),
  campaign_id: text('campaign_id').references(() => campaigns.campaign_id),
  registered_at: ts('registered_at').notNull(),
  person_name: text('person_name'), campaign_name: text('campaign_name'), owner_id: text('owner_id'), owner_name: text('owner_name'),
  provenance: prov(),
});

export const registrationHistory = pgTable('registration_history', {
  history_id: text('history_id').primaryKey(),
  registration_id: text('registration_id').notNull().references(() => registrations.registration_id),
  person_id: text('person_id').notNull(), campaign_id: text('campaign_id'),
  effective_at: ts('effective_at').notNull(),
  status: regStatus('status').notNull(),
  person_name: text('person_name'), campaign_name: text('campaign_name'), owner_id: text('owner_id'), owner_name: text('owner_name'),
  provenance: prov(),
}, (t) => [
  index('rh_reg').on(t.registration_id, t.effective_at.desc(), t.history_id.desc()),
  uniqueIndex('rh_reg_eff').on(t.registration_id, t.effective_at),
]);

export const checkins = pgTable('checkins', {
  event_id: text('event_id').primaryKey(),
  person_id: text('person_id').notNull().references(() => people.person_id),
  registration_id: text('registration_id').references(() => registrations.registration_id),
  campaign_id: text('campaign_id').references(() => campaigns.campaign_id),
  occurred_at: ts('occurred_at').notNull(),
  result: text('result').notNull(), verification: text('verification').notNull(), source: text('source').notNull(),
  person_name: text('person_name'), campaign_name: text('campaign_name'), owner_id: text('owner_id'), owner_name: text('owner_name'),
  provenance: prov(),
}, (t) => [index('ck_at').on(t.occurred_at), index('ck_person').on(t.person_id)]);

export const fieldGuide = pgTable('field_guide', {
  source_table: text('source_table').notNull(), field: text('field').notNull(), data_type: text('data_type'), meaning: text('meaning'),
}, (t) => [primaryKey({ columns: [t.source_table, t.field] })]);

export const readMe = pgTable('read_me', {
  topic: text('topic').notNull(), description: text('description').notNull(),
}, (t) => [primaryKey({ columns: [t.topic, t.description] })]);

export const importRuns = pgTable('import_runs', {
  id: serial('id').primaryKey(), at: ts('at').notNull().defaultNow(), source_sha256: text('source_sha256'),
  per_table: jsonb('per_table').notNull(), status: text('status').notNull(),
});

export const teamMembers = pgTable('team_members', {
  owner_id: text('owner_id').primaryKey(), name: text('name').notNull(), role: text('role'), from_dataset: boolean('from_dataset').notNull().default(true),
});

export const bets = pgTable('bets', {
  id: text('id').primaryKey(), rank: integer('rank').notNull(), name: text('name').notNull(), mechanism: text('mechanism'),
  impact: numeric('impact', { precision: 3, scale: 1, mode: 'number' }).notNull(),
  confidence: numeric('confidence', { precision: 3, scale: 1, mode: 'number' }).notNull(),
  ease: numeric('ease', { precision: 3, scale: 1, mode: 'number' }).notNull(),
  budget_base_inr: integer('budget_base_inr'), budget_stretch_inr: integer('budget_stretch_inr'),
  owner_id: text('owner_id'), start_offset_weeks: integer('start_offset_weeks'), end_offset_weeks: integer('end_offset_weeks'),
  status: betStatus('status').notNull().default('proposed'), params: jsonb('params'),
});

export const rejectedIdeas = pgTable('rejected_ideas', {
  id: serial('id').primaryKey(), name: text('name').notNull(), mechanism: text('mechanism'), indicative_visitors: text('indicative_visitors'),
  indicative_cost: text('indicative_cost'), decision: text('decision'), reason: text('reason'),
});

export const experiments = pgTable('experiments', {
  id: serial('id').primaryKey(), bet_id: text('bet_id').references(() => bets.id), name: text('name').notNull(), hypothesis: text('hypothesis'),
  primary_kpi: text('primary_kpi'), kpi_unit: text('kpi_unit'), assignment_unit: text('assignment_unit'), min_sample: integer('min_sample'),
  scale_op: text('scale_op'), scale_value: numeric('scale_value', { mode: 'number' }), stop_op: text('stop_op'), stop_value: numeric('stop_value', { mode: 'number' }),
  change_rule: text('change_rule'), stop_note: text('stop_note'), guardrails: jsonb('guardrails'), readout_date: date('readout_date', { mode: 'string' }),
  status: expStatus('status').notNull().default('planned'),
  observed_value: numeric('observed_value', { mode: 'number' }), observed_n: integer('observed_n'), decision: text('decision'), owner_id: text('owner_id'),
  /** server-adjudicated readout record: KPI numerator/denominator, guardrail observations, gate results, reasons, missing inputs */ observation: jsonb('observation'),
});

export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(), title: text('title').notNull(), description: text('description'),
  campaign_id: text('campaign_id').references(() => campaigns.campaign_id),
  owner_id: text('owner_id').references(() => teamMembers.owner_id),
  due_date: date('due_date', { mode: 'string' }), status: taskStatus('status').notNull().default('todo'), priority: priority('priority').notNull().default('p1'),
  experiment_id: integer('experiment_id').references(() => experiments.id), bet_id: text('bet_id').references(() => bets.id),
  insight_id: text('insight_id'), evidence: jsonb('evidence'),
  created_via: createdVia('created_via').notNull().default('manual'),
  created_at: ts('created_at').notNull().defaultNow(), updated_at: ts('updated_at').notNull().defaultNow(),
});

export const planAssumptions = pgTable('plan_assumptions', {
  key: text('key').notNull(), scenario: scenarioEnum('scenario').notNull(), group: text('group').notNull(),
  value: numeric('value', { mode: 'number' }).notNull(), unit: text('unit'), label: text('label'), kind: kindEnum('kind').notNull(), source_ref: text('source_ref'),
}, (t) => [primaryKey({ columns: [t.key, t.scenario] })]);

export const decisionRules = pgTable('decision_rules', {
  mode: ruleMode('mode').notNull(), metric: text('metric').notNull(),
  scale_op: text('scale_op').notNull(), scale_value: numeric('scale_value', { mode: 'number' }).notNull(),
  stop_op: text('stop_op').notNull(), stop_value: numeric('stop_value', { mode: 'number' }).notNull(),
  min_registered: integer('min_registered').notNull().default(50),
}, (t) => [primaryKey({ columns: [t.mode, t.metric] })]);

export const actionDrafts = pgTable('action_drafts', {
  id: uuid('id').primaryKey().defaultRandom(), kind: draftKind('kind').notNull(), payload: jsonb('payload').notNull(), evidence: jsonb('evidence'),
  status: draftStatus('status').notNull().default('pending'), result_ref: text('result_ref'), conversation_id: text('conversation_id'),
  created_at: ts('created_at').notNull().defaultNow(), resolved_at: ts('resolved_at'),
});

export const auditLog = pgTable('audit_log', {
  id: serial('id').primaryKey(), at: ts('at').notNull().defaultNow(), actor: actorEnum('actor').notNull(),
  entity: text('entity').notNull(), entity_id: text('entity_id'), action: auditAction('action').notNull(),
  before: jsonb('before'), after: jsonb('after'), data_revision: integer('data_revision').notNull(), client_id: text('client_id'),
});

/** Durable fixed-window counters (chat rate limit, daily cap, mutation limit). Atomic upsert, expiring. */
export const rateCounters = pgTable('rate_counters', { key: text('key').primaryKey(), count: integer('count').notNull(), expires_at: ts('expires_at').notNull() });

export const chatLogs = pgTable('chat_logs', {
  id: serial('id').primaryKey(), at: ts('at').notNull().defaultNow(), conversation_id: text('conversation_id'), ip_hash: text('ip_hash'),
  question: text('question'), tool_calls: jsonb('tool_calls'), answer: text('answer'), grounding: jsonb('grounding'),
  model: text('model'), latency_ms: integer('latency_ms'), error: text('error'),
});
