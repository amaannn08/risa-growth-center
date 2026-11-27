import { buildDataset, type Dataset, type RawInput, type TableQuality } from '@gc/core';
import { withSnapshot, type Db, type Q } from './client';

const TS = (c: string) => `to_char(${c} at time zone 'Asia/Kolkata','YYYY-MM-DD"T"HH24:MI:SS')||'+05:30'`;
const cols = (ts: string[], plain: string[]) => [...ts.map((c) => `${TS(c)} AS ${c}`), ...plain].join(', ');
const COMMON = ['person_name', 'campaign_name', 'owner_id', 'owner_name', 'provenance'];

const SQL = {
  event: `SELECT event_name, ${cols(['history_start', 'history_end', 'event_starts_at', 'event_ends_at'], ['timezone', 'currency', 'fictional'])} FROM event`,
  targets: `SELECT ${cols(['effective_at'], ['target_version', 'identified_external_people_goal', 'registration_goal', 'unique_external_visitors_goal', 'marketing_budget_inr'])} FROM target_versions ORDER BY effective_at`,
  campaigns: `SELECT campaign_id, campaign_name, channel, target_audience, objective, owner_id, owner_name, ${cols(['created_at', 'planned_start_at', 'planned_end_at'], ['status::text AS status', 'plan_budget_inr', 'notes', 'provenance'])} FROM campaigns ORDER BY campaign_id`,
  daily_marketing: `SELECT activity_id, campaign_id, activity_date::text AS activity_date, platform, impressions, clicks, reported_reach, landing_page_sessions, registration_starts, marketing_spend_inr, campaign_name, owner_id, owner_name, provenance FROM daily_marketing`,
  people: `SELECT person_id, person_type, first_touch_source, first_campaign_id, first_campaign_name, ${cols(['first_seen_at'], ['person_name', 'owner_id', 'owner_name', 'provenance'])} FROM people`,
  interactions: `SELECT interaction_id, person_id, campaign_id, event_type, detail, ${cols(['occurred_at'], COMMON)} FROM interactions`,
  registrations: `SELECT registration_id, person_id, campaign_id, ${cols(['registered_at'], COMMON)} FROM registrations`,
  registration_history: `SELECT history_id, registration_id, person_id, campaign_id, status::text AS status, ${cols(['effective_at'], COMMON)} FROM registration_history`,
  checkins: `SELECT event_id, person_id, registration_id, campaign_id, result, verification, source, ${cols(['occurred_at'], COMMON)} FROM checkins`,
  field_guide: 'SELECT source_table, field, data_type, meaning FROM field_guide',
  read_me: 'SELECT topic, description FROM read_me',
} as const;

export async function loadRawDataset(q: Q): Promise<RawInput> {
  const keys = Object.keys(SQL) as (keyof typeof SQL)[];
  const res = await Promise.all(keys.map((k) => q.query(SQL[k])));
  return Object.fromEntries(keys.map((k, i) => [k, res[i]])) as unknown as RawInput;
}

/** Export payload: revision metadata and every raw table read in ONE snapshot transaction (the revision always describes the contents). `hook` runs between the two reads (tests use it to force a concurrent write). */
export async function exportSnapshot(db: Db, hook?: () => Promise<void>): Promise<{ meta: Meta; tables: RawInput }> {
  return withSnapshot(db, async (q) => {
    const meta = await getMeta(q);
    if (hook) await hook();
    return { meta, tables: await loadRawDataset(q) };
  });
}

export interface Meta { data_revision: number; dataset_revision: number; edits_since_reset: number; seeded_at: string | null; source_sha256: string | null }
export async function getMeta(q: Q): Promise<Meta> {
  const [m] = await q.query<Meta>('SELECT data_revision, dataset_revision, edits_since_reset, seeded_at::text AS seeded_at, source_sha256 FROM app_meta WHERE id=1');
  if (!m) throw new Error('Database is not seeded (run pnpm db:migrate && pnpm db:seed)');
  return m;
}

export async function loadTableQuality(q: Q): Promise<Record<string, TableQuality> | undefined> {
  const [r] = await q.query<{ per_table: Record<string, TableQuality> }>('SELECT per_table FROM import_runs ORDER BY id DESC LIMIT 1');
  return r?.per_table;
}

const g = globalThis as any;
/**
 * Dataset cached per `dataset_revision` (tasks/assumption edits don't reload 25k rows).
 * The returned Dataset is a shallow clone stamped with the current `data_revision`; the memo (`_cache`) is shared.
 */
export async function loadDataset(q: Q, scope: object = q): Promise<{ ds: Dataset; meta: Meta }> {
  const meta = await getMeta(q);
  const c = g.__gcDsCache as { scope: object; rev: number; ds: Dataset } | undefined;
  let ds: Dataset;
  if (c && c.scope === scope && c.rev === meta.dataset_revision) ds = c.ds;
  else {
    const [raw, tq] = await Promise.all([loadRawDataset(q), loadTableQuality(q)]);
    ds = buildDataset(raw, { tableQuality: tq, revision: meta.dataset_revision });
    g.__gcDsCache = { scope, rev: meta.dataset_revision, ds };
  }
  return { ds: { ...ds, revision: meta.data_revision }, meta };
}

/** Management rows that carry evidence/decisions shown next to the dataset (tasks, experiments, bets, team, rejected ideas, assumptions, rules). */
export async function loadManagement(q: Q) {
  const [tasks, experiments, team, bets, rejected, assumptions, rules] = await Promise.all([
    q.query<any>(`SELECT id, title, description, campaign_id, owner_id, due_date::text AS due_date, status::text AS status, priority::text AS priority, experiment_id, bet_id, insight_id, evidence, created_via::text AS created_via FROM tasks ORDER BY id`),
    q.query<any>(`SELECT id, bet_id, name, hypothesis, primary_kpi, kpi_unit, assignment_unit, min_sample, scale_op, scale_value::float8 AS scale_value, stop_op, stop_value::float8 AS stop_value, change_rule, stop_note, readout_date::text AS readout_date, status::text AS status, observed_value::float8 AS observed_value, observed_n, decision, owner_id, guardrails, observation FROM experiments ORDER BY id`),
    q.query<{ owner_id: string; name: string }>('SELECT owner_id, name FROM team_members ORDER BY owner_id'),
    q.query<any>(`SELECT id, rank, name, mechanism, impact::float8 AS impact, confidence::float8 AS confidence, ease::float8 AS ease, params, start_offset_weeks, end_offset_weeks FROM bets ORDER BY rank`),
    q.query<any>('SELECT * FROM rejected_ideas ORDER BY id'),
    q.query<any>(`SELECT key, scenario::text AS scenario, "group", value::float8 AS value, unit, label, kind::text AS kind, source_ref FROM plan_assumptions ORDER BY "group", key, scenario`),
    q.query<any>(`SELECT mode::text AS mode, metric, scale_op, scale_value::float8 AS scale_value, stop_op, stop_value::float8 AS stop_value, min_registered FROM decision_rules ORDER BY mode, metric`),
  ]);
  return { tasks, experiments, team, bets, rejected, assumptions, rules };
}
export type Management = Awaited<ReturnType<typeof loadManagement>>;

/** Meta + dataset + management rows (+ optional caller reads) under a single transaction snapshot. */
export async function readConsistent<X = undefined>(db: Db, extra?: (q: Q, meta: Meta) => Promise<X>) {
  return withSnapshot(db, async (q) => {
    const { ds, meta } = await loadDataset(q, db);
    const [mgmt, x] = await Promise.all([loadManagement(q), extra ? extra(q, meta) : (undefined as X)]);
    return { ds, meta, mgmt, extra: x as X };
  });
}
