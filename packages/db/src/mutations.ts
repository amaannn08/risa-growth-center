import { z } from 'zod';
import { adjudicateExperiment, assumptionError, effectiveSample, normalizeEvidence, validateObservation } from '@gc/core';
import type { Db, Q } from './client';
import { AsyncLocalStorage } from 'node:async_hooks';
import { nextUserN } from './ids';

/** Per-request client id (hashed IP) recorded on every audit row written inside `withClient`. */
export const clientStore = new AsyncLocalStorage<string>();
export const withClient = <R>(clientId: string | undefined, fn: () => Promise<R>): Promise<R> => (clientId ? clientStore.run(clientId, fn) : fn());

export type Actor = 'user' | 'copilot_confirmed' | 'system';
export class MutationError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export interface MutationResult { ok: true; data_revision: number; entity: string; id: string | null; row?: unknown; noop?: boolean; result_ref?: string }

const bad = (code: string, msg: string): never => { throw new MutationError(code, msg); };
const parse = <S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> => {
  const r = schema.safeParse(input);
  if (!r.success) throw new MutationError('VALIDATION', r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  return r.data;
};

/** Timestamps are IST unless an offset is given. Returns canonical `YYYY-MM-DDTHH:MM:SS+05:30`-compatible string. */
export function istTs(s: string): string {
  let v = s.trim().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v += 'T00:00:00';
  if (/T\d{2}:\d{2}$/.test(v)) v += ':00';
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(v)) v += '+05:30';
  if (Number.isNaN(Date.parse(v))) bad('VALIDATION', `Bad timestamp: ${s}`);
  return v;
}
const tsIn = z.string().min(8).transform(istTs);
const dateIn = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');
const nonNeg = z.number().int().min(0).max(100_000_000);
const MAX = (n: number) => z.string().max(n);

const jsonCols = new Set(['evidence', 'guardrails', 'observation', 'params', 'payload', 'before', 'after']);
const prep = (k: string, v: unknown) => (jsonCols.has(k) && v !== null && v !== undefined ? JSON.stringify(v) : v);

async function insertRow(q: Q, table: string, obj: Record<string, unknown>) {
  const ks = Object.keys(obj).filter((k) => obj[k] !== undefined);
  const ph = ks.map((k, i) => (jsonCols.has(k) ? `$${i + 1}::text::jsonb` : `$${i + 1}`));
  const r = await q.query(`INSERT INTO ${table} (${ks.map((k) => `"${k}"`).join(',')}) VALUES (${ph.join(',')}) RETURNING *`, ks.map((k) => prep(k, obj[k])));
  return r[0]!;
}
async function updateRow(q: Q, table: string, where: Record<string, unknown>, patch: Record<string, unknown>) {
  const ks = Object.keys(patch).filter((k) => patch[k] !== undefined);
  if (!ks.length) bad('VALIDATION', 'Nothing to update');
  const wk = Object.keys(where);
  const set = ks.map((k, i) => `"${k}"=${jsonCols.has(k) ? `$${i + 1}::text::jsonb` : `$${i + 1}`}`).join(',');
  const cond = wk.map((k, i) => `"${k}"=$${ks.length + i + 1}`).join(' AND ');
  const r = await q.query(`UPDATE ${table} SET ${set} WHERE ${cond} RETURNING *`, [...ks.map((k) => prep(k, patch[k])), ...wk.map((k) => where[k])]);
  return r[0];
}
const getOne = async (q: Q, table: string, col: string, v: unknown) => (await q.query(`SELECT * FROM ${table} WHERE "${col}"=$1`, [v]))[0];

interface Change { id: string | null; before: unknown; after: unknown; dataset?: boolean; noop?: boolean; result_ref?: string }

/** Audit + revision bump. Must run inside a transaction. */
async function audited(q: Q, actor: Actor, entity: string, action: 'create' | 'update' | 'delete', ch: Change): Promise<MutationResult> {
  if (ch.noop) {
    const [m] = await q.query<{ data_revision: number }>('SELECT data_revision FROM app_meta WHERE id=1');
    return { ok: true, data_revision: m!.data_revision, entity, id: ch.id, noop: true, row: ch.after, result_ref: ch.result_ref };
  }
  const [m] = await q.query<{ data_revision: number }>(
    `UPDATE app_meta SET data_revision=data_revision+1, dataset_revision=dataset_revision+$1::int, edits_since_reset=edits_since_reset+1 WHERE id=1 RETURNING data_revision`, [ch.dataset ? 1 : 0]);
  await q.query(`INSERT INTO audit_log(actor, entity, entity_id, action, before, after, data_revision, client_id) VALUES ($1::actor,$2,$3,$4::audit_action,$5::text::jsonb,$6::text::jsonb,$7,$8)`,
    [actor, entity, ch.id, action, ch.before == null ? null : JSON.stringify(ch.before), ch.after == null ? null : JSON.stringify(ch.after), m!.data_revision, clientStore.getStore() ?? null]);
  return { ok: true, data_revision: m!.data_revision, entity, id: ch.id, row: ch.after, result_ref: ch.result_ref };
}
const run = (db: Db, actor: Actor, entity: string, action: 'create' | 'update' | 'delete', fn: (q: Q) => Promise<Change>) =>
  db.tx(async (q) => audited(q, actor, entity, action, await fn(q)));

const dateOf = (iso: string) => new Date(Date.parse(iso) + 19_800_000).toISOString().slice(0, 10);

async function event(q: Q) {
  const [e] = await q.query<{ history_start: string; history_end: string; event_starts_at: string; event_ends_at: string }>(
    `SELECT (history_start at time zone 'Asia/Kolkata')::date::text AS history_start, (history_end at time zone 'Asia/Kolkata')::date::text AS history_end,
            event_starts_at::text AS event_starts_at, event_ends_at::text AS event_ends_at FROM event LIMIT 1`);
  return e!;
}
async function mustCampaign(q: Q, id: string) {
  const c = await getOne(q, 'campaigns', 'campaign_id', id);
  if (!c) bad('NOT_FOUND', `Campaign ${id} does not exist`);
  return c!;
}

// ---------- daily marketing ----------
const dailyBase = z.object({
  campaign_id: z.string().min(1), activity_date: dateIn, platform: MAX(80).optional(),
  impressions: nonNeg.default(0), clicks: nonNeg.default(0), reported_reach: nonNeg.default(0), landing_page_sessions: nonNeg.default(0), registration_starts: nonNeg.default(0),
  /** Integer INR; negative = credit. */
  marketing_spend_inr: z.number().int().min(-10_000_000).max(10_000_000).default(0),
});
async function checkDate(q: Q, date: string) {
  const e = await event(q);
  if (date < e.history_start || date > e.history_end) bad('OUT_OF_RANGE', `activity_date ${date} is outside the dataset window ${e.history_start} to ${e.history_end}`);
}
export const addDailyMarketing = (db: Db, input: unknown, actor: Actor = 'user') => {
  const v = parse(dailyBase, input);
  return run(db, actor, 'daily_marketing', 'create', async (q) => {
    const c = await mustCampaign(q, v.campaign_id);
    await checkDate(q, v.activity_date);
    const n = await nextUserN(q, 'daily_marketing', 'activity_id', '^AD-.*-U[0-9]+$');
    const id = `AD-${v.campaign_id}-${v.activity_date.slice(5, 7)}${v.activity_date.slice(8, 10)}-U${n}`;
    const row = await insertRow(q, 'daily_marketing', { ...v, platform: v.platform ?? 'manual entry', activity_id: id, campaign_name: c.campaign_name, owner_id: c.owner_id, owner_name: c.owner_name, provenance: 'user' });
    return { id, before: null, after: row, dataset: true };
  });
};
export const updateDailyMarketing = (db: Db, activity_id: string, patch: unknown, actor: Actor = 'user') => {
  const v = parse(dailyBase.partial().omit({ campaign_id: true }), patch);
  return run(db, actor, 'daily_marketing', 'update', async (q) => {
    const before = await getOne(q, 'daily_marketing', 'activity_id', activity_id);
    if (!before) bad('NOT_FOUND', `Row ${activity_id} not found`);
    if (v.activity_date) await checkDate(q, v.activity_date);
    const after = await updateRow(q, 'daily_marketing', { activity_id }, { ...v, provenance: before!.provenance === 'seed' ? 'user' : before!.provenance });
    return { id: activity_id, before, after, dataset: true };
  });
};
export const deleteDailyMarketing = (db: Db, activity_id: string, actor: Actor = 'user') =>
  run(db, actor, 'daily_marketing', 'delete', async (q) => {
    const before = await getOne(q, 'daily_marketing', 'activity_id', activity_id);
    if (!before) bad('NOT_FOUND', `Row ${activity_id} not found`);
    await q.query('DELETE FROM daily_marketing WHERE activity_id=$1', [activity_id]);
    return { id: activity_id, before, after: null, dataset: true };
  });

// ---------- people / registrations / history / check-ins ----------
const personIn = z.object({
  person_name: MAX(120).default('Unnamed'), person_type: z.enum(['external', 'internal', 'staff', 'test']).default('external'),
  first_seen_at: tsIn, first_campaign_id: z.string().nullish(), first_touch_source: MAX(60).optional(),
});
export const addPerson = (db: Db, input: unknown, actor: Actor = 'user') => {
  const v = parse(personIn, input);
  return run(db, actor, 'people', 'create', async (q) => {
    const c = v.first_campaign_id ? await mustCampaign(q, v.first_campaign_id) : null;
    const n = await nextUserN(q, 'people', 'person_id', '^E-U[0-9]+$');
    const id = `E-U${n}`;
    const row = await insertRow(q, 'people', {
      person_id: id, person_name: v.person_name, person_type: v.person_type, first_seen_at: v.first_seen_at,
      first_campaign_id: c?.campaign_id ?? null, first_campaign_name: c?.campaign_name ?? null, owner_id: c?.owner_id ?? null, owner_name: c?.owner_name ?? null,
      first_touch_source: v.first_touch_source ?? (v.person_type !== 'external' ? 'event_access' : c ? 'campaign' : 'walk_in'), provenance: 'user',
    });
    return { id, before: null, after: row, dataset: true };
  });
};

const STATUS = z.enum(['interested', 'confirmed', 'cancelled', 'waitlisted']);
const regIn = z.object({ person_id: z.string().min(1), campaign_id: z.string().min(1), registered_at: tsIn, status: STATUS.default('interested') });
export const addRegistration = (db: Db, input: unknown, actor: Actor = 'user') => {
  const v = parse(regIn, input);
  return run(db, actor, 'registrations', 'create', async (q) => {
    const p = await getOne(q, 'people', 'person_id', v.person_id);
    if (!p) bad('NOT_FOUND', `Person ${v.person_id} does not exist`);
    if (p!.person_type !== 'external') bad('INVALID', 'Only external people can register');
    if (await getOne(q, 'registrations', 'person_id', v.person_id)) bad('DUPLICATE', `${v.person_id} already has a registration (one registration per person)`);
    const c = await mustCampaign(q, v.campaign_id);
    if (Date.parse(v.registered_at) < Date.parse(p!.first_seen_at)) bad('INVALID', 'registered_at must be on or after the person’s first_seen_at');
    const n = await nextUserN(q, 'registrations', 'registration_id', '^R-U[0-9]+$');
    const hn = await nextUserN(q, 'registration_history', 'history_id', '^RH-U[0-9]+$');
    const rid = `R-U${n}`;
    const common = { person_name: p!.person_name, campaign_name: c.campaign_name, owner_id: c.owner_id, owner_name: c.owner_name, provenance: 'user' };
    const reg = await insertRow(q, 'registrations', { registration_id: rid, person_id: v.person_id, campaign_id: v.campaign_id, registered_at: v.registered_at, ...common });
    const h = await insertRow(q, 'registration_history', { history_id: `RH-U${hn}`, registration_id: rid, person_id: v.person_id, campaign_id: v.campaign_id, effective_at: v.registered_at, status: v.status, ...common });
    return { id: rid, before: null, after: { registration: reg, history: h }, dataset: true };
  });
};

const statusIn = z.object({ registration_id: z.string().min(1), status: STATUS, effective_at: tsIn });
export const changeRegistrationStatus = (db: Db, input: unknown, actor: Actor = 'user') => {
  const v = parse(statusIn, input);
  return run(db, actor, 'registration_history', 'create', async (q) => {
    const r = await getOne(q, 'registrations', 'registration_id', v.registration_id);
    if (!r) bad('NOT_FOUND', `Registration ${v.registration_id} does not exist`);
    if (Date.parse(v.effective_at) < Date.parse(r!.registered_at)) bad('INVALID', 'effective_at must be on or after registered_at');
    const clash = await q.query('SELECT 1 FROM registration_history WHERE registration_id=$1 AND effective_at=$2::timestamptz', [v.registration_id, v.effective_at]);
    if (clash.length) bad('DUPLICATE', 'A status version already exists at that exact timestamp (history is append-only; pick a later time)');
    const hn = await nextUserN(q, 'registration_history', 'history_id', '^RH-U[0-9]+$');
    const row = await insertRow(q, 'registration_history', {
      history_id: `RH-U${hn}`, registration_id: v.registration_id, person_id: r!.person_id, campaign_id: r!.campaign_id, effective_at: v.effective_at, status: v.status,
      person_name: r!.person_name, campaign_name: r!.campaign_name, owner_id: r!.owner_id, owner_name: r!.owner_name, provenance: 'user',
    });
    return { id: `RH-U${hn}`, before: null, after: row, dataset: true };
  });
};

const checkinIn = z.object({
  event_id: z.string().min(1).max(40).optional(), person_id: z.string().min(1), occurred_at: tsIn,
  result: z.enum(['admitted', 'denied', 'pending']).default('admitted'), verification: z.enum(['verified', 'unverified']).default('verified'),
  source: z.enum(['scanner', 'manual']).default('manual'), registration_id: z.string().nullish(), campaign_id: z.string().nullish(),
});
export const addCheckin = (db: Db, input: unknown, actor: Actor = 'user') => {
  const v = parse(checkinIn, input);
  return run(db, actor, 'checkins', 'create', async (q) => {
    if (v.event_id) {
      const ex = await getOne(q, 'checkins', 'event_id', v.event_id);
      if (ex) return { id: v.event_id, before: null, after: ex, noop: true };
    }
    const p = await getOne(q, 'people', 'person_id', v.person_id);
    if (!p) bad('NOT_FOUND', `Person ${v.person_id} does not exist`);
    let campaign_id = v.campaign_id ?? null;
    if (v.registration_id) {
      const r = await getOne(q, 'registrations', 'registration_id', v.registration_id);
      if (!r) bad('NOT_FOUND', `Registration ${v.registration_id} does not exist`);
      if (r!.person_id !== v.person_id) bad('INVALID', 'Registration belongs to a different person');
      campaign_id ??= r!.campaign_id;
    }
    const c = campaign_id ? await mustCampaign(q, campaign_id) : null;
    const n = await nextUserN(q, 'checkins', 'event_id', '^CHK-U[0-9]+$');
    const id = v.event_id ?? `CHK-U${n}`;
    const e = await event(q);
    const warn = Date.parse(v.occurred_at) < Date.parse(e.event_starts_at) || Date.parse(v.occurred_at) > Date.parse(e.event_ends_at) ? 'outside event window' : undefined;
    const row = await insertRow(q, 'checkins', {
      event_id: id, person_id: v.person_id, registration_id: v.registration_id ?? null, campaign_id, occurred_at: v.occurred_at, result: v.result, verification: v.verification, source: v.source,
      person_name: p!.person_name, campaign_name: c?.campaign_name ?? null, owner_id: c?.owner_id ?? null, owner_name: c?.owner_name ?? null, provenance: 'user',
    });
    return { id, before: null, after: warn ? { ...row, _warning: warn } : row, dataset: true };
  });
};

// ---------- targets ----------
const targetIn = z.object({
  effective_at: tsIn, target_version: MAX(80).min(1), identified_external_people_goal: z.number().int().positive(), registration_goal: z.number().int().positive(),
  unique_external_visitors_goal: z.number().int().positive(), marketing_budget_inr: z.number().int().positive(), note: MAX(300).nullish(),
});
export const addTargetVersion = (db: Db, input: unknown) => {
  const v = parse(targetIn, input);
  return run(db, 'user', 'target_versions', 'create', async (q) => {
    if ((await q.query('SELECT 1 FROM target_versions WHERE effective_at=$1::timestamptz', [v.effective_at])).length) bad('DUPLICATE', 'A target version already exists at that effective_at');
    const row = await insertRow(q, 'target_versions', { ...v, provenance: 'user' });
    return { id: v.effective_at, before: null, after: row, dataset: true };
  });
};
export const deleteTargetVersion = (db: Db, effective_at: string) => {
  const at = istTs(effective_at);
  return run(db, 'user', 'target_versions', 'delete', async (q) => {
    const before = (await q.query('SELECT * FROM target_versions WHERE effective_at=$1::timestamptz', [at]))[0];
    if (!before) bad('NOT_FOUND', 'No target version at that effective_at');
    const [n] = await q.query<{ n: number }>('SELECT count(*)::int AS n FROM target_versions');
    if (n!.n <= 1) bad('INVALID', 'Cannot delete the only target version');
    await q.query('DELETE FROM target_versions WHERE effective_at=$1::timestamptz', [at]);
    return { id: at, before, after: null, dataset: true };
  });
};

// ---------- campaigns ----------
const campBase = z.object({
  campaign_name: MAX(120).min(1), channel: MAX(60).min(1), owner_id: z.string().nullish(), status: z.enum(['active', 'paused', 'stopped']).default('active'),
  plan_budget_inr: z.number().int().min(0).max(10_000_000).nullish(), planned_start_at: tsIn.nullish(), planned_end_at: tsIn.nullish(), notes: MAX(500).nullish(),
  target_audience: MAX(300).nullish(), objective: MAX(300).nullish(),
});
async function ownerName(q: Q, owner_id?: string | null) {
  if (!owner_id) return null;
  const t = await getOne(q, 'team_members', 'owner_id', owner_id);
  if (!t) bad('NOT_FOUND', `Owner ${owner_id} is not a team member`);
  return t!.name as string;
}
export const createCampaign = (db: Db, input: unknown, actor: Actor = 'user') => {
  const v = parse(campBase, input);
  return run(db, actor, 'campaigns', 'create', async (q) => {
    const [r] = await q.query<{ n: number }>(`SELECT coalesce(max(substring(campaign_id from 2)::int),0)+1 AS n FROM campaigns WHERE campaign_id ~ '^C[0-9]+$'`);
    const id = `C${String(r!.n).padStart(2, '0')}`;
    const row = await insertRow(q, 'campaigns', { ...v, campaign_id: id, owner_name: await ownerName(q, v.owner_id), created_at: new Date().toISOString(), provenance: 'user' });
    return { id, before: null, after: row, dataset: true };
  });
};
export const updateCampaign = (db: Db, campaign_id: string, patch: unknown, actor: Actor = 'user') => {
  const v = parse(campBase.partial(), patch);
  return run(db, actor, 'campaigns', 'update', async (q) => {
    const before = await mustCampaign(q, campaign_id);
    const p: Record<string, unknown> = { ...v };
    if (v.owner_id !== undefined) p.owner_name = await ownerName(q, v.owner_id);
    const after = await updateRow(q, 'campaigns', { campaign_id }, p);
    return { id: campaign_id, before, after, dataset: true };
  });
};
export const deleteCampaign = (db: Db, campaign_id: string, actor: Actor = 'user') =>
  run(db, actor, 'campaigns', 'delete', async (q) => {
    const before = await mustCampaign(q, campaign_id);
    const [u] = await q.query<{ n: number }>(`SELECT (SELECT count(*) FROM daily_marketing WHERE campaign_id=$1) + (SELECT count(*) FROM people WHERE first_campaign_id=$1)
      + (SELECT count(*) FROM registrations WHERE campaign_id=$1) + (SELECT count(*) FROM interactions WHERE campaign_id=$1) + (SELECT count(*) FROM checkins WHERE campaign_id=$1) AS n`, [campaign_id]);
    if (Number(u!.n) > 0) bad('HAS_ACTIVITY', `Campaign ${campaign_id} has recorded activity; set status=stopped instead of deleting`);
    await q.query('UPDATE tasks SET campaign_id=NULL WHERE campaign_id=$1', [campaign_id]);
    await q.query('DELETE FROM campaigns WHERE campaign_id=$1', [campaign_id]);
    return { id: campaign_id, before, after: null, dataset: true };
  });

// ---------- tasks ----------
const taskBase = z.object({
  title: MAX(200).min(1), description: MAX(2000).nullish(), campaign_id: z.string().nullish(), owner_id: z.string().nullish(), due_date: dateIn.nullish(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done']).default('todo'), priority: z.enum(['p0', 'p1', 'p2']).default('p1'),
  experiment_id: z.number().int().nullish(), bet_id: z.string().nullish(), insight_id: MAX(200).nullish(), evidence: z.any().nullish().transform((e) => normalizeEvidence(e)),
  created_via: z.enum(['manual', 'insight', 'copilot']).default('manual'),
});
export type TaskInput = z.input<typeof taskBase>;
async function taskFks(q: Q, v: { campaign_id?: string | null; owner_id?: string | null; bet_id?: string | null; experiment_id?: number | null }) {
  if (v.campaign_id) await mustCampaign(q, v.campaign_id);
  if (v.owner_id) await ownerName(q, v.owner_id);
  if (v.bet_id && !(await getOne(q, 'bets', 'id', v.bet_id))) bad('NOT_FOUND', `Bet ${v.bet_id} does not exist`);
  if (v.experiment_id && !(await getOne(q, 'experiments', 'id', v.experiment_id))) bad('NOT_FOUND', `Experiment ${v.experiment_id} does not exist`);
}
async function createTaskTx(q: Q, input: unknown): Promise<Change> {
  const v = parse(taskBase, input);
  await taskFks(q, v);
  const row = await insertRow(q, 'tasks', v);
  return { id: String(row.id), before: null, after: row, result_ref: `task:${row.id}` };
}
export const createTask = (db: Db, input: unknown, actor: Actor = 'user') => run(db, actor, 'tasks', 'create', (q) => createTaskTx(q, input));
export const updateTask = (db: Db, id: number, patch: unknown, actor: Actor = 'user') => {
  const v = parse(taskBase.partial(), patch);
  return run(db, actor, 'tasks', 'update', async (q) => {
    const before = await getOne(q, 'tasks', 'id', id);
    if (!before) bad('NOT_FOUND', `Task ${id} not found`);
    await taskFks(q, v);
    const after = await updateRow(q, 'tasks', { id }, { ...v, updated_at: new Date().toISOString() });
    return { id: String(id), before, after };
  });
};
export const deleteTask = (db: Db, id: number, actor: Actor = 'user') =>
  run(db, actor, 'tasks', 'delete', async (q) => {
    const before = await getOne(q, 'tasks', 'id', id);
    if (!before) bad('NOT_FOUND', `Task ${id} not found`);
    await q.query('DELETE FROM tasks WHERE id=$1', [id]);
    return { id: String(id), before, after: null };
  });

// ---------- experiments / bets ----------
const expBase = z.object({
  bet_id: z.string().nullish(), name: MAX(160).min(1), hypothesis: MAX(600).nullish(), primary_kpi: MAX(300).nullish(), kpi_unit: MAX(30).nullish(),
  assignment_unit: MAX(160).nullish(), min_sample: z.number().int().min(0).nullish(), scale_op: z.enum(['>=', '>', '<=', '<']).nullish(), scale_value: z.number().nullish(),
  stop_op: z.enum(['>=', '>', '<=', '<']).nullish(), stop_value: z.number().nullish(), change_rule: MAX(300).nullish(), stop_note: MAX(400).nullish(), guardrails: z.any().nullish(),
  readout_date: dateIn.nullish(), status: z.enum(['draft', 'planned', 'running', 'readout', 'scaled', 'changed', 'stopped']).default('planned'), owner_id: z.string().nullish(),
});
export const createExperiment = (db: Db, input: unknown, actor: Actor = 'user') => {
  const v = parse(expBase, input);
  return run(db, actor, 'experiments', 'create', async (q) => {
    if (v.bet_id && !(await getOne(q, 'bets', 'id', v.bet_id))) bad('NOT_FOUND', `Bet ${v.bet_id} does not exist`);
    const row = await insertRow(q, 'experiments', v);
    return { id: String(row.id), before: null, after: row, result_ref: `experiment:${row.id}` };
  });
};
export const updateExperiment = (db: Db, id: number, patch: unknown, actor: Actor = 'user') => {
  const v = parse(expBase.partial(), patch);
  return run(db, actor, 'experiments', 'update', async (q) => {
    const before = await getOne(q, 'experiments', 'id', id);
    if (!before) bad('NOT_FOUND', `Experiment ${id} not found`);
    const after = await updateRow(q, 'experiments', { id }, v);
    return { id: String(id), before, after };
  });
};
const numRec = z.record(z.number().finite().nullable()).optional();
/** The client's `decision` (if any) is ignored: the server adjudicates inside the write transaction. */
const readoutIn = z.object({
  observed_value: z.number().finite().nullish(), observed_n: z.number().int().min(0).nullish(), kpi_numerator: z.number().finite().nullish(), kpi_denominator: z.number().finite().nullish(),
  guardrail_observations: numRec, gate_inputs: numRec,
}).passthrough();
async function readoutTx(q: Q, id: number, input: unknown): Promise<Change> {
  const v = parse(readoutIn, input);
  const before = await getOne(q, 'experiments', 'id', id);
  if (!before) bad('NOT_FOUND', `Experiment ${id} not found`);
  const e = before as any;
  const check = validateObservation(e, v);
  if (check.errors.length) bad('VALIDATION', check.errors.join(' '));
  const observed = check.value;
  const ev = adjudicateExperiment({ ...e, scale_value: e.scale_value === null ? null : Number(e.scale_value), stop_value: e.stop_value === null ? null : Number(e.stop_value) },
    { observed_value: observed, observed_n: v.observed_n, kpi_numerator: v.kpi_numerator, kpi_denominator: v.kpi_denominator, guardrail_observations: v.guardrail_observations, gate_inputs: v.gate_inputs });
  const status = ({ scale: 'scaled', change: 'changed', stop: 'stopped', insufficient_sample: 'readout' } as const)[ev.decision];
  const observation = { kpi_numerator: v.kpi_numerator ?? null, kpi_denominator: v.kpi_denominator ?? null, guardrail_observations: ev.guardrails.map((g) => ({ key: g.key, label: g.label, op: g.op, threshold: g.value, observed: g.observed, passed: g.passed, hard: !!g.hard })), gates: ev.gates, missing: ev.missing, reasons: ev.reasons };
  const after = await updateRow(q, 'experiments', { id }, { observed_value: observed, observed_n: effectiveSample(e, v) ?? null, decision: ev.decision, status, observation });
  return { id: String(id), before, after, result_ref: `experiment:${id}` };
}
export const recordReadout = (db: Db, id: number, input: unknown, actor: Actor = 'user') => run(db, actor, 'experiments', 'update', (q) => readoutTx(q, id, input));

const betPatch = z.object({
  name: MAX(160), mechanism: MAX(600).nullish(), impact: z.number().min(0).max(5), confidence: z.number().min(0).max(5), ease: z.number().min(0).max(5),
  budget_base_inr: z.number().int().min(0).nullish(), budget_stretch_inr: z.number().int().min(0).nullish(), owner_id: z.string().nullish(),
  start_offset_weeks: z.number().int().nullish(), end_offset_weeks: z.number().int().nullish(), status: z.enum(['proposed', 'approved', 'running', 'scaled', 'changed', 'stopped']), rank: z.number().int(),
}).partial();
export const updateBet = (db: Db, id: string, patch: unknown, actor: Actor = 'user') => {
  const v = parse(betPatch, patch);
  return run(db, actor, 'bets', 'update', async (q) => {
    const before = await getOne(q, 'bets', 'id', id);
    if (!before) bad('NOT_FOUND', `Bet ${id} not found`);
    return { id, before, after: await updateRow(q, 'bets', { id }, v) };
  });
};

// ---------- plan assumptions / decision rules ----------
const assumptionIn = z.object({ key: z.string().min(1), scenario: z.enum(['base', 'stretch', 'all']), value: z.number().finite() });
export const upsertAssumption = (db: Db, input: unknown, actor: Actor = 'user') => {
  const v = parse(assumptionIn, input);
  return run(db, actor, 'plan_assumptions', 'update', async (q) => {
    const before = (await q.query('SELECT * FROM plan_assumptions WHERE key=$1 AND scenario=$2::scenario', [v.key, v.scenario]))[0];
    if (!before) bad('NOT_FOUND', `Assumption ${v.key} (${v.scenario}) does not exist`);
    const invalid = assumptionError({ key: v.key, unit: (before as any).unit }, v.value);
    if (invalid) bad('VALIDATION', invalid);
    const after = (await q.query('UPDATE plan_assumptions SET value=$3 WHERE key=$1 AND scenario=$2::scenario RETURNING *', [v.key, v.scenario, v.value]))[0];
    return { id: `${v.key}:${v.scenario}`, before, after };
  });
};
const ruleIn = z.object({
  mode: z.enum(['pre_event', 'post_event']), metric: z.string().min(1), scale_op: z.enum(['>=', '>', '<=', '<']), scale_value: z.number(),
  stop_op: z.enum(['>=', '>', '<=', '<']), stop_value: z.number(), min_registered: z.number().int().min(0).default(50),
});
export const upsertDecisionRule = (db: Db, input: unknown, actor: Actor = 'user') => {
  const v = parse(ruleIn, input);
  return run(db, actor, 'decision_rules', 'update', async (q) => {
    const before = (await q.query('SELECT * FROM decision_rules WHERE mode=$1::rule_mode AND metric=$2', [v.mode, v.metric]))[0];
    const after = (await q.query(`INSERT INTO decision_rules(mode,metric,scale_op,scale_value,stop_op,stop_value,min_registered) VALUES ($1::rule_mode,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (mode, metric) DO UPDATE SET scale_op=$3, scale_value=$4, stop_op=$5, stop_value=$6, min_registered=$7 RETURNING *`,
      [v.mode, v.metric, v.scale_op, v.scale_value, v.stop_op, v.stop_value, v.min_registered]))[0];
    return { id: `${v.mode}:${v.metric}`, before: before ?? null, after };
  });
};

// ---------- drafts (Copilot propose → user confirm) ----------
const draftIn = z.object({ kind: z.enum(['task', 'campaign_update', 'experiment_readout']), payload: z.record(z.any()), evidence: z.any().optional(), conversation_id: z.string().nullish() });
export async function createDraft(db: Db, input: unknown) {
  const v = parse(draftIn, input);
  // validate the payload eagerly so the preview is guaranteed confirmable
  if (v.kind === 'task') parse(taskBase, { ...v.payload, created_via: 'copilot' });
  const [r] = await db.query<{ id: string }>(`INSERT INTO action_drafts(kind, payload, evidence, conversation_id) VALUES ($1::draft_kind,$2::text::jsonb,$3::text::jsonb,$4) RETURNING id`,
    [v.kind, JSON.stringify(v.payload), v.evidence == null ? null : JSON.stringify(v.evidence), v.conversation_id ?? null]);
  return { draft_id: r!.id };
}
export async function getDraft(db: Db | Q, id: string) {
  return (await db.query('SELECT * FROM action_drafts WHERE id=$1::uuid', [id]))[0];
}
/** Exactly-once: the guarded UPDATE succeeds for one caller only; repeats return the existing result_ref. */
export const confirmDraft = (db: Db, id: string, editedPayload?: Record<string, unknown>): Promise<MutationResult & { already?: boolean }> =>
  db.tx(async (q) => {
    const claimed = await q.query(`UPDATE action_drafts SET status='confirmed', resolved_at=now() WHERE id=$1::uuid AND status='pending' RETURNING *`, [id]);
    if (!claimed.length) {
      const d = await getDraft(q, id);
      if (!d) bad('NOT_FOUND', 'Draft not found');
      if (d!.status === 'discarded') bad('DISCARDED', 'Draft was discarded');
      const [m] = await q.query<{ data_revision: number }>('SELECT data_revision FROM app_meta WHERE id=1');
      return { ok: true, already: true, data_revision: m!.data_revision, entity: 'action_drafts', id, result_ref: d!.result_ref as string };
    }
    const d = claimed[0]!;
    const payload = { ...(d.payload as Record<string, unknown>), ...(editedPayload ?? {}) };
    let ch: Change, entity: string, action: 'create' | 'update' = 'create';
    if (d.kind === 'task') {
      ch = await createTaskTx(q, { ...payload, created_via: 'copilot', evidence: d.evidence }); entity = 'tasks';
    } else if (d.kind === 'campaign_update') {
      const { campaign_id, reason: _r, evidence: _e, ...patch } = payload as any;
      const v = parse(campBase.partial(), patch);
      const before = await mustCampaign(q, campaign_id);
      ch = { id: campaign_id, before, after: await updateRow(q, 'campaigns', { campaign_id }, v), dataset: true, result_ref: `campaign:${campaign_id}` }; entity = 'campaigns'; action = 'update';
    } else {
      ch = await readoutTx(q, Number((payload as any).experiment_id), payload); entity = 'experiments'; action = 'update';
    }
    const res = await audited(q, 'copilot_confirmed', entity, action, ch);
    await q.query('UPDATE action_drafts SET result_ref=$2, payload=$3::text::jsonb WHERE id=$1::uuid', [id, ch.result_ref, JSON.stringify(payload)]);
    return { ...res, result_ref: ch.result_ref };
  });
export async function discardDraft(db: Db, id: string) {
  const r = await db.query(`UPDATE action_drafts SET status='discarded', resolved_at=now() WHERE id=$1::uuid AND status='pending' RETURNING id`, [id]);
  return { ok: true as const, discarded: r.length > 0 };
}

// ---------- dispatcher used by /api/mutations/[entity] ----------
export async function applyMutation(db: Db, entity: string, action: string, input: any, actor: Actor = 'user'): Promise<MutationResult> {
  const key = `${entity}.${action}`;
  switch (key) {
    case 'daily_marketing.add': return addDailyMarketing(db, input, actor);
    case 'daily_marketing.update': return updateDailyMarketing(db, String(input.id), input.patch ?? input, actor);
    case 'daily_marketing.delete': return deleteDailyMarketing(db, String(input.id), actor);
    case 'person.add': return addPerson(db, input, actor);
    case 'registration.add': return addRegistration(db, input, actor);
    case 'registration_status.change': return changeRegistrationStatus(db, input, actor);
    case 'checkin.add': return addCheckin(db, input, actor);
    case 'target_version.add': return addTargetVersion(db, input);
    case 'target_version.delete': return deleteTargetVersion(db, String(input.effective_at));
    case 'campaign.create': return createCampaign(db, input, actor);
    case 'campaign.update': return updateCampaign(db, String(input.id), input.patch ?? {}, actor);
    case 'campaign.delete': return deleteCampaign(db, String(input.id), actor);
    case 'task.create': return createTask(db, input, actor);
    case 'task.update': return updateTask(db, Number(input.id), input.patch ?? {}, actor);
    case 'task.delete': return deleteTask(db, Number(input.id), actor);
    case 'experiment.create': return createExperiment(db, input, actor);
    case 'experiment.update': return updateExperiment(db, Number(input.id), input.patch ?? {}, actor);
    case 'experiment.readout': return recordReadout(db, Number(input.id), input, actor);
    case 'bet.update': return updateBet(db, String(input.id), input.patch ?? {}, actor);
    case 'assumption.upsert': return upsertAssumption(db, input, actor);
    case 'decision_rule.upsert': return upsertDecisionRule(db, input, actor);
    default: return bad('UNKNOWN', `Unknown mutation ${key}`);
  }
}
