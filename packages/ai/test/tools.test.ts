import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMutation, confirmDraft, createDb, resetToSeed, seedDb, type Db } from '@gc/db';
import { makeEnv, runTool } from '../src';
import { allowedFrom, extractNumbers, figureMatches } from '../src/grounding';
import { ITEMS } from '../eval/questions';

let db: Db;
beforeAll(async () => { db = await createDb('pglite:memory'); await seedDb(db); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await resetToSeed(db, 'system'); });

const NUM = /^[₹−-]?\d[\d,]*(\.\d+)?%?$/;
// plain-text expectations that must be literally present in the tool output (names/phrases the model will quote)
const TEXT_IN_OUTPUT: Record<number, string[]> = {
  4: ['Attendee launch plan', 'Attendee revised plan'], 11: ['Student Referrals'], 13: ['Paid Social'], 24: ['Audit Paid Social landing page'], 29: ['paused'],
  30: ['Eval stretch plan'], 22: [], 16: ['non-unique'],
};

describe('eval items: deterministic tool ground truth (no LLM)', () => {
  for (const item of ITEMS) {
    it(`#${item.id} ${item.q.slice(0, 60)}`, async () => {
      for (const s of item.setup ?? []) await applyMutation(db, s.entity, s.action, s.input);
      const env = await makeEnv(db, (item.context ?? {}) as any, `t${item.id}`);
      const outs: any[] = [];
      for (const c of item.calls) {
        const o = await runTool(env, c.tool, c.args);
        expect(o.error, `${c.tool} ${JSON.stringify(c.args)} → ${JSON.stringify(o.error)}`).toBeUndefined();
        expect(o.tool).toBe(c.tool);
        expect(o.data_revision).toBe(env.meta.data_revision);
        outs.push(o);
      }
      const allowed = allowedFrom(outs);
      const text = JSON.stringify(outs).toLowerCase();
      for (const m of item.must.filter((x) => NUM.test(x))) {
        const e = extractNumbers(m, { keepSmallInts: true })[0]!;
        expect(allowed.some((a) => figureMatches(e.value, e.dp, a)), `expected ${m} in tool output of #${item.id}`).toBe(true);
      }
      for (const t of TEXT_IN_OUTPUT[item.id] ?? []) expect(text).toContain(t.toLowerCase());
    });
  }
});

describe('tool behaviour', () => {
  it('rejects bad dates (zod) and out-of-coverage', async () => {
    const env = await makeEnv(db);
    expect((await runTool(env, 'get_funnel', { as_of: '20-04-2025' })).error.code).toBe('BAD_ARGUMENTS');
    expect((await runTool(env, 'get_funnel', { as_of: '2024-01-01' })).error.code).toBe('OUT_OF_COVERAGE');
    expect((await runTool(env, 'get_funnel', { as_of: '2025-05-01' })).error.code).toBe('OUT_OF_COVERAGE');
    expect((await runTool(env, 'nope', {})).error.code).toBe('UNKNOWN_TOOL');
  });
  it('resolves campaign names to ids, case-insensitively', async () => {
    const env = await makeEnv(db);
    for (const n of ['paid social', 'PAID SOCIAL', 'C02', 'c02', 'Paid']) expect((await runTool(env, 'get_funnel', { campaign_id: n })).scope).toBe('C02');
    expect((await runTool(env, 'get_funnel', { campaign_id: 'unattributed' })).scope).toBe('unattributed');
    expect((await runTool(env, 'get_funnel', { campaign_id: 'Mars' })).error.code).toBe('UNKNOWN_CAMPAIGN');
  });
  it('inherits context as_of / campaign', async () => {
    const env = await makeEnv(db, { asOf: '2025-04-13', campaignId: 'C02' });
    const o = await runTool(env, 'get_funnel', {});
    expect(o.as_of).toBe('2025-04-13'); expect(o.scope).toBe('C02');
  });
  it('what_if never persists', async () => {
    const env = await makeEnv(db);
    const before = (await db.query<any>('SELECT data_revision FROM app_meta'))[0].data_revision;
    const o = await runTool(env, 'what_if', { kind: 'budget_shift', from_campaign_id: 'C02', to_campaign_id: 'C04', amount_inr: 10000 });
    expect(o.label).toBe('SCENARIO — not evidence'); expect(o.persisted).toBe(false);
    expect((await db.query<any>('SELECT data_revision FROM app_meta'))[0].data_revision).toBe(before);
    expect(o.deltas.to).toBeCloseTo(124.19, 2); expect(o.deltas.from).toBeCloseTo(-36.56, 2);
    const a = await runTool(env, 'what_if', { kind: 'assumption_change', assumption_key: 'b1_clubs', assumption_value: 16 });
    expect(a.after.base).toBeGreaterThan(a.before.base);
  });
  it('calculate is safe', async () => {
    const env = await makeEnv(db);
    expect((await runTool(env, 'calculate', { expression: '1+1; process.exit()' })).error.code).toBe('CALC_ERROR');
    expect((await runTool(env, 'calculate', { expression: '1/0' })).error.code).toBe('CALC_ERROR');
    expect((await runTool(env, 'calculate', { expression: 'round(300000/2050*100)/100' })).value).toBe(146.34);
  });
  it('propose_task creates a pending draft only; confirm is exactly-once', async () => {
    const env = await makeEnv(db, {}, 'c1');
    const tasks0 = (await db.query<any>('SELECT count(*)::int n FROM tasks'))[0].n;
    const o = await runTool(env, 'propose_task', { title: 'Launch group-pass pilot', owner_id: 'Meera', due_date: '2026-01-20', priority: 'p1', bet_id: 'B1', evidence: [{ tool: 'get_funnel', metric: 'x', value: 1 }] });
    expect(o.draft_id).toBeTruthy(); expect(o.status).toBe('pending'); expect(o.payload.owner_id).toBe('T03');
    expect((await db.query<any>('SELECT count(*)::int n FROM tasks'))[0].n).toBe(tasks0);
    const [a, b] = await Promise.all([confirmDraft(db, o.draft_id), confirmDraft(db, o.draft_id)]);
    expect([a.already, b.already].filter(Boolean).length).toBe(1);
    expect((await db.query<any>('SELECT count(*)::int n FROM tasks'))[0].n).toBe(tasks0 + 1);
    const bad = await runTool(env, 'propose_task', { title: 'x task', owner_id: 'Zed', priority: 'p1', evidence: [] });
    expect(bad.error.code).toBe('UNKNOWN_OWNER');
  });
  it('propose_campaign_change drafts only', async () => {
    const env = await makeEnv(db);
    const o = await runTool(env, 'propose_campaign_change', { campaign_id: 'Paid Social', status: 'paused', reason: '50% show-up', evidence: [] });
    expect(o.status).toBe('pending');
    expect((await db.query<any>(`SELECT status::text s FROM campaigns WHERE campaign_id='C02'`))[0].s).toBe('active');
  });
  it('get_trend daily needs ≤31 days', async () => {
    const env = await makeEnv(db);
    expect((await runTool(env, 'get_trend', { metric: 'clicks', granularity: 'day' })).error.code).toBe('RANGE_TOO_LARGE');
    const o = await runTool(env, 'get_trend', { metric: 'registrations', granularity: 'day', from: '2025-04-01', through: '2025-04-05' });
    expect(o.series).toHaveLength(5);
  });
});
