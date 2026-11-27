import { existsSync, readFileSync } from 'node:fs';
import { BETS, DECISION_RULE_SEEDS, DEFAULT_ASSUMPTIONS, DEFAULT_PLAN_BUDGETS, EXPERIMENTS, REJECTED_IDEAS, dedupe, type TableQuality } from '@gc/core';
import { REPO_ROOT, migrate, type Db, type Q } from './client';

const RAW = `${REPO_ROOT}/data/source/raw`;
const readRaw = (slug: string): Record<string, unknown>[] => JSON.parse(readFileSync(`${RAW}/${slug}.json`, 'utf8'));

/** Tables copied into the pristine `seed` schema (FK order). */
export const SEED_TABLES = [
  'event', 'target_versions', 'campaigns', 'team_members', 'daily_marketing', 'people', 'interactions', 'registrations',
  'registration_history', 'checkins', 'bets', 'rejected_ideas', 'experiments', 'tasks', 'plan_assumptions', 'decision_rules',
] as const;

/** Insert rows via jsonb_populate_recordset (1 param per chunk; handles timestamptz/enum coercion). */
export async function bulkInsert(q: Q, table: string, rows: Record<string, unknown>[], chunk = 1000, conflict = 'ON CONFLICT DO NOTHING') {
  for (let i = 0; i < rows.length; i += chunk) {
    await q.query(`INSERT INTO ${table} SELECT * FROM jsonb_populate_recordset(null::${table}, $1::text::jsonb) ${conflict}`, [JSON.stringify(rows.slice(i, i + chunk))]);
  }
}

const D = (n: number) => `2026-${String(Math.floor(n / 100)).padStart(2, '0')}-${String(n % 100).padStart(2, '0')}`;

export const TEAM = [
  { owner_id: 'T00', name: 'Aman Gupta', role: 'Growth lead', from_dataset: false },
  { owner_id: 'T03', name: 'Meera Iyer', role: 'Campus & partnerships', from_dataset: true },
  { owner_id: 'T04', name: 'Arjun Verma', role: 'Performance & organic', from_dataset: true },
  { owner_id: 'T05', name: 'Nisha Rao', role: 'Creators & community', from_dataset: true },
  { owner_id: 'T06', name: 'Dev Malhotra', role: 'Referrals & growth engineering', from_dataset: true },
];

const NE = ' (next edition)';
const STARTER_TASKS = [
  { id: 1, title: 'Audit Paid Social landing page drop (wk of 9 Mar: 105→35 regs)', description: 'Registrations per click fell from 10.6% to 4.0% in the week of 9 Mar 2025. Cause is not in the data; check landing page, posting schedule and cohort lag.' + NE, campaign_id: 'C02', owner_id: 'T04', due_date: D(115), status: 'todo', priority: 'p0', insight_id: 'trend_break:C02:2025-03-09', evidence: [{ tool: 'diagnose_bottlenecks', metric: 'registrations_per_click', value: '10.6% → 4.0%' }], created_via: 'insight' },
  { id: 2, title: 'Interview 5 College Partnership organisers about zero-reg week of 9 Mar', description: 'C04 registered 0 on 464 clicks that week, then 64/77/80/97. Find out what happened.' + NE, campaign_id: 'C04', owner_id: 'T03', due_date: D(122), status: 'todo', priority: 'p1', insight_id: 'trend_break:C04:2025-03-09', evidence: [{ tool: 'diagnose_bottlenecks', metric: 'registrations', value: '0 on 464 clicks' }], created_via: 'insight' },
  { id: 3, title: 'Draft group-pass slot flow (B1)', description: 'Slot reservation, roster, waitlist.' + NE, owner_id: 'T03', due_date: D(131), status: 'in_progress', priority: 'p1', bet_id: 'B1' },
  { id: 4, title: 'Ambassador leaderboard rules + fraud checks (B2)', description: 'Eligibility, caps, duplicate detection.' + NE, owner_id: 'T03', due_date: D(207), status: 'todo', priority: 'p1', bet_id: 'B2' },
  { id: 5, title: 'Referral link + reward unlock at verified admission (B3)', description: 'Unique links, attribution, abuse monitoring.' + NE, owner_id: 'T06', due_date: D(214), status: 'todo', priority: 'p1', bet_id: 'B3' },
  { id: 6, title: 'WhatsApp template approval + opt-in copy (B4)', description: 'Templates for T−7, T−2 and event morning.' + NE, owner_id: 'T00', due_date: D(228), status: 'todo', priority: 'p1', bet_id: 'B4' },
  { id: 7, title: 'Retargeting audience + registrant exclusion (B5)', description: 'Consented warm audience; exclude registrants.' + NE, owner_id: 'T04', due_date: D(306), status: 'todo', priority: 'p2', bet_id: 'B5' },
  { id: 8, title: 'Hold creator spend until show-up test passes', description: '2025 Creator Partners: ₹337/visitor at 50% show-up.' + NE, campaign_id: 'C03', owner_id: 'T05', due_date: D(215), status: 'blocked', priority: 'p1' },
];

export function managementSeed(plan: Record<string, number> = DEFAULT_PLAN_BUDGETS) {
  const betBudget = (id: string, s: 'base' | 'stretch') => {
    const k = `${id.toLowerCase()}_budget`;
    return DEFAULT_ASSUMPTIONS.find((a) => a.key === k && a.scenario === s)!.value;
  };
  const bets = BETS.map((b) => ({
    id: b.id, rank: b.rank, name: b.name, mechanism: b.mechanism, impact: b.impact, confidence: b.confidence, ease: b.ease,
    budget_base_inr: betBudget(b.id, 'base'), budget_stretch_inr: betBudget(b.id, 'stretch'), owner_id: b.owner_id,
    start_offset_weeks: b.start_offset_weeks, end_offset_weeks: b.end_offset_weeks, status: 'proposed', params: { dependencies: b.dependencies, owner_label: b.owner },
  }));
  const experiments = EXPERIMENTS.map((e, i) => ({
    id: i + 1, bet_id: e.bet_id, name: e.name, hypothesis: e.hypothesis, primary_kpi: e.primary_kpi, kpi_unit: e.kpi_unit,
    assignment_unit: e.assignment_unit, min_sample: e.min_sample, scale_op: e.scale_op, scale_value: e.scale_value, stop_op: e.stop_op,
    stop_value: e.stop_value, change_rule: e.change_rule, stop_note: e.stop_note, guardrails: e.guardrails,
    readout_date: `2026-03-${String(2 + i * 4).padStart(2, "0")}`, status: 'planned', owner_id: BETS.find((b) => b.id === e.bet_id)!.owner_id,
  }));
  const rejected = REJECTED_IDEAS.map((r, i) => ({ id: i + 1, name: r.name, mechanism: r.mechanism, indicative_visitors: r.indicative_visitors, indicative_cost: r.indicative_cost, decision: r.decision, reason: r.reason }));
  const now = new Date().toISOString();
  const tasks = STARTER_TASKS.map((t) => ({ created_at: now, updated_at: now, ...t, evidence: (t as any).evidence ?? null, created_via: (t as any).created_via ?? 'manual' }));
  return { plan, bets, experiments, rejected, tasks };
}

export async function seedDb(db: Db, opts: { force?: boolean } = {}): Promise<{ skipped: boolean }> {
  await migrate(db);
  const existing = await db.query('SELECT 1 FROM app_meta WHERE id=1');
  if (existing.length && !opts.force) return { skipped: true };
  const sha = JSON.parse(readFileSync(`${REPO_ROOT}/data/source/manifest.json`, 'utf8')).sha256 as string;
  const perTable: Record<string, TableQuality> = {};
  const clean = (slug: string) => {
    const r = dedupe(slug, readRaw(slug));
    perTable[slug] = r.quality;
    return r.rows;
  };
  const sources = ['read_me', 'field_guide', 'event', 'targets', 'campaigns', 'daily_marketing', 'people', 'interactions', 'registrations', 'registration_history', 'checkins']
    .reduce((m, s) => ({ ...m, [s]: clean(s) }), {} as Record<string, Record<string, unknown>[]>);
  const mg = managementSeed();
  const withProv = (rows: Record<string, unknown>[]) => rows.map((r) => ({ provenance: 'seed', ...r }));
  const campaigns = sources.campaigns!.map((c) => ({ ...c, status: 'active', plan_budget_inr: mg.plan[c.campaign_id as string] ?? null, provenance: 'seed' }));

  await db.tx(async (q) => {
    if (opts.force) {
      await q.query(`TRUNCATE ${SEED_TABLES.join(', ')}, field_guide, read_me, action_drafts RESTART IDENTITY CASCADE`);
      await q.query('DELETE FROM app_meta');
    }
    await bulkInsert(q, 'event', withProv(sources.event!));
    await bulkInsert(q, 'target_versions', withProv(sources.targets!));
    await bulkInsert(q, 'campaigns', campaigns);
    await bulkInsert(q, 'team_members', TEAM);
    await bulkInsert(q, 'daily_marketing', withProv(sources.daily_marketing!));
    await bulkInsert(q, 'people', withProv(sources.people!));
    await bulkInsert(q, 'interactions', withProv(sources.interactions!));
    await bulkInsert(q, 'registrations', withProv(sources.registrations!));
    await bulkInsert(q, 'registration_history', withProv(sources.registration_history!));
    await bulkInsert(q, 'checkins', withProv(sources.checkins!));
    await bulkInsert(q, 'field_guide', sources.field_guide!);
    await bulkInsert(q, 'read_me', sources.read_me!);
    await bulkInsert(q, 'bets', mg.bets);
    await bulkInsert(q, 'rejected_ideas', mg.rejected);
    await bulkInsert(q, 'experiments', mg.experiments);
    await bulkInsert(q, 'tasks', mg.tasks);
    await bulkInsert(q, 'plan_assumptions', DEFAULT_ASSUMPTIONS.map((a) => ({ ...a })));
    await bulkInsert(q, 'decision_rules', DECISION_RULE_SEEDS.map((r) => ({ ...r })));
    await syncSequences(q);
    for (const t of SEED_TABLES) {
      await q.query(`TRUNCATE seed.${t}`);
      await q.query(`INSERT INTO seed.${t} SELECT * FROM public.${t}`);
    }
    await q.query('INSERT INTO import_runs(source_sha256, per_table, status) VALUES ($1,$2::text::jsonb,$3)', [sha, JSON.stringify(perTable), 'ok']);
    await q.query('INSERT INTO app_meta(id, data_revision, dataset_revision, seeded_at, source_sha256, edits_since_reset) VALUES (1,1,1,now(),$1,0)', [sha]);
  });
  return { skipped: false };
}

export async function syncSequences(q: Q) {
  for (const t of ['tasks', 'experiments', 'rejected_ideas']) {
    await q.query(`SELECT setval(pg_get_serial_sequence('public.${t}','id'), greatest(coalesce((SELECT max(id) FROM public.${t}),0),1), (SELECT count(*) FROM public.${t}) > 0)`);
  }
}
