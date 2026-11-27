import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMutation, confirmDraft, createDb, resetToSeed, seedDb, type Db } from '@gc/db';
import { addDays, weeklySeries } from '@gc/core';
import { makeEnv, runTool } from '../src';
import { badCitations, groundingFromCalls, parseCitations, stripBadCitations } from '../src/grounding';
import { buildEvidence, issueRefs, stripEvidence } from '../src/evidence';

let db: Db;
beforeAll(async () => { db = await createDb('pglite:memory'); await seedDb(db); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await resetToSeed(db, 'system'); });

describe('get_trend honours the as-of cutoff and date-bounded partial periods (P2-4)', () => {
  it('24 Feb–5 Mar for Paid Social: full week = 105, the running week is retrievable (16) and flagged partial', async () => {
    const env = await makeEnv(db, { asOf: '2025-03-05' });
    const o = await runTool(env, 'get_trend', { metric: 'registrations', campaign_id: 'C02', granularity: 'week', from: '2025-02-24' });
    expect(o.error).toBeUndefined();
    expect(o.cutoff).toBe('2025-03-05');
    expect(o.series.map((p: any) => [p.period_start, p.period_end, p.value, p.partial])).toEqual([['2025-02-24', '2025-03-02', 105, false], ['2025-03-03', '2025-03-05', 16, true]]);
    expect(o.series[1].days).toBe(3);
    expect(o.series_text[1]).toMatch(/2025-03-03→2025-03-05: 16.*\[partial, 3 d\]/);
  });
  it('defaults to the context date: nothing after the cutoff is returned; an explicit through still wins', async () => {
    const env = await makeEnv(db, { asOf: '2025-03-05' });
    const all = await runTool(env, 'get_trend', { metric: 'registrations', granularity: 'week' });
    expect(all.series.at(-1).period_end).toBe('2025-03-05');
    expect(all.series.at(-1).partial).toBe(true);
    const later = await runTool(env, 'get_trend', { metric: 'registrations', granularity: 'week', through: '2025-03-16' });
    expect(later.series.at(-1).period_end).toBe('2025-03-16');
    const noCtx = await runTool(await makeEnv(db), 'get_trend', { metric: 'registrations', granularity: 'week' });
    expect(noCtx.series.at(-1).period_end).toBe(env.covEnd);
  });
  it('the running/partial period is excluded from biggest_changes by default and ranked only on request', async () => {
    const env = await makeEnv(db, { asOf: '2025-03-12' });
    const dflt = await runTool(env, 'get_trend', { metric: 'registrations', campaign_id: 'C02', granularity: 'week' });
    expect(dflt.series.at(-1).partial).toBe(true);
    expect(dflt.biggest_changes.every((c: any) => c.to_period_end !== '2025-03-12' && c.from_period_end !== '2025-03-12')).toBe(true);
    const incl = await runTool(env, 'get_trend', { metric: 'registrations', campaign_id: 'C02', granularity: 'week', include_partial_in_ranking: true });
    expect(incl.ranking_note).toMatch(/included/);
  });
  it('full weeks equal the Diagnose weekly series (same period increments), for overall and per campaign', async () => {
    const env = await makeEnv(db);
    for (const cid of [undefined, 'C04']) {
      const o = await runTool(env, 'get_trend', { metric: 'registrations', campaign_id: cid, granularity: 'week' });
      for (const w of weeklySeries(env.ds)) {
        const want = Object.entries(w.campaigns).filter(([k]) => !cid || k === cid).reduce((s, [, r]) => s + r.first_touch.period_increment.registered_people, 0);
        const got = o.series.find((p: any) => p.period_end === w.through && p.period_start === w.from);
        expect(got?.value, `${cid ?? 'overall'} ${w.from}`).toBe(want);
      }
    }
  });
  it('a mid-week `from` gives a date-bounded partial first period', async () => {
    const env = await makeEnv(db);
    const o = await runTool(env, 'get_trend', { metric: 'registrations', campaign_id: 'C02', granularity: 'week', from: '2025-02-26', through: '2025-03-09' });
    expect(o.series.map((p: any) => [p.period_start, p.period_end, p.partial])).toEqual([['2025-02-26', '2025-03-02', true], ['2025-03-03', '2025-03-09', false]]);
  });
});

describe('server-issued evidence refs (P1-3)', () => {
  it('every tool call is issued refs {toolCallId, tool, metricField, unit, signedValue, attribution, asOf, revision}; the model never sees them', async () => {
    const env = await makeEnv(db);
    const o = await runTool(env, 'get_funnel', {}, 'call_abc');
    const ce = o._evidence;
    expect(ce).toMatchObject({ toolCallId: 'call_abc', tool: 'get_funnel', asOf: '2025-04-20', revision: env.meta.data_revision });
    const visitors = ce.refs.find((r: any) => r.metricField === 'people.visitors_unique_verified');
    expect(visitors).toMatchObject({ toolCallId: 'call_abc', tool: 'get_funnel', signedValue: 2050, attribution: 'first_touch', asOf: '2025-04-20', revision: env.meta.data_revision });
    expect(env.calls).toHaveLength(1);
    expect(JSON.stringify(stripEvidence(o))).not.toContain('toolCallId');
    expect(issueRefs('x', 'get_funnel', { error: { code: 'E' } })).toEqual([]);
  });
  it('signed values are preserved (credits are negative) and units are typed', async () => {
    const env = await makeEnv(db);
    const o = await runTool(env, 'get_spend_ledger', { through: '2025-04-20' });
    const credits = o._evidence.refs.find((r: any) => r.metricField === 'credits_total_inr');
    expect(credits.signedValue).toBeLessThan(0); expect(credits.unit).toBe('INR');
  });
  it('all citation forms are parsed and validated, including the abbreviated [calculate · r69]', () => {
    const t = 'a [get_funnel · 2025-04-20 · r7], b [calculate · r69], c [get_funnel · rev 7], d [what_if], e [see the table] and [link](http://x).';
    expect(parseCitations(t).map((c) => [c.tool, c.asOf, c.revision])).toEqual([['get_funnel', '2025-04-20', 7], ['calculate', null, 69], ['get_funnel', null, 7], ['what_if', null, null]]);
    const executed = [{ name: 'get_funnel', as_of: '2025-04-20', data_revision: 7 }];
    expect(badCitations(t, executed)).toEqual(['[calculate · r69]', '[what_if]']);
    expect(stripBadCitations('x [calculate · r69] y', executed)).toBe('x [unverified citation removed] y');
    expect(badCitations('x [calculate · r69]', [...executed, { name: 'calculate', as_of: null, data_revision: 69 }])).toEqual([]);
    expect(badCitations('x [calculate · r70]', [{ name: 'calculate', as_of: null, data_revision: 69 }])).toEqual(['[calculate · r70]']); // stale revision
  });
  it('Q3 regression: an answer citing [calculate · rN] when only funnel calls ran is unverified; badge uses this turn\'s refs, not earlier-turn overlap', async () => {
    const env = await makeEnv(db);
    const f = await runTool(env, 'get_funnel', {});
    const rev = env.meta.data_revision;
    const bad = groundingFromCalls(`Visitors 2,050 [get_funnel · 2025-04-20 · r${rev}], rate recomputed [calculate · r${rev}].`, env.calls);
    expect(bad.ok).toBe(false); expect(bad.bad_citations).toEqual([`[calculate · r${rev}]`]);
    await runTool(env, 'calculate', { expression: '2050/2800' });
    expect(groundingFromCalls(`Visitors 2,050 [get_funnel · 2025-04-20 · r${rev}], 0.73 [calculate · r${rev}].`, env.calls).bad_citations).toEqual([]);
    // a figure that only appeared in a PREVIOUS turn's output (not in this turn's refs) is not traced
    expect(groundingFromCalls('There were 4,321 people.', env.calls).ok).toBe(false);
    expect(f._evidence.refs.length).toBeGreaterThan(10);
  });
  it('stale ref: a citation for revision N is unverified once the turn ran at revision N+1', async () => {
    const env0 = await makeEnv(db);
    const r0 = env0.meta.data_revision;
    await applyMutation(db, 'task', 'create', { title: 'bump revision' });
    const env1 = await makeEnv(db);
    await runTool(env1, 'get_funnel', {});
    expect(env1.meta.data_revision).toBe(r0 + 1);
    const g = groundingFromCalls(`Visitors 2,050 [get_funnel · 2025-04-20 · r${r0}].`, env1.calls);
    expect(g.bad_citations).toEqual([`[get_funnel · 2025-04-20 · r${r0}]`]); expect(g.ok).toBe(false);
  });
  it('Q19 regression: page date 20 Apr, explicit 12 Apr data → the task chip carries 12 Apr and the tool run\'s revision, not the page date', async () => {
    const env = await makeEnv(db, { asOf: '2025-04-20' }, 'q19');
    const f = await runTool(env, 'get_funnel', { as_of: '2025-04-12' });
    const registered = f.people.registered, showUp = f.people.registered_and_attended;
    const d = await runTool(env, 'propose_task', { title: 'Review registered show-up', priority: 'p1', owner_id: 'Meera', due_date: '2026-01-20',
      evidence: [{ tool: 'get_funnel', metric: 'registered_and_attended', value: showUp }, { tool: 'get_funnel', metric: 'registered', value: registered }, { tool: 'get_funnel', metric: 'made_up_metric', value: 98765 }] });
    expect(d.error).toBeUndefined();
    const items = d.evidence;
    expect(items[0]).toMatchObject({ verified: true, ref: { asOf: '2025-04-12', revision: env.meta.data_revision, toolCallId: f._evidence.toolCallId } });
    expect(items[2].verified).toBe(false); expect(items[2].ref ?? null).toBeNull(); expect(d.evidence_unverified).toBe(1);
    const res = await confirmDraft(db, d.draft_id);
    const row = (await db.query('SELECT evidence FROM tasks WHERE id=$1', [Number(res.id)]))[0] as any;
    expect(row.evidence.as_of).toBeNull(); // one item is unverified: no wrapper date/revision is inherited by anything (round 4); the verified item keeps its own ref date
    expect(row.evidence.items[0].ref).toMatchObject({ asOf: '2025-04-12' });
    expect(JSON.stringify(row.evidence)).not.toContain('2025-04-20');
  });
  it('buildEvidence: wrapper date/revision only when every verified item agrees; chips never take the page date', async () => {
    const env = await makeEnv(db, { asOf: '2025-04-20' });
    await runTool(env, 'get_funnel', { as_of: '2025-04-12' });
    await runTool(env, 'get_funnel', { as_of: '2025-04-20' });
    const same = buildEvidence([{ tool: 'get_funnel', metric: 'registered', value: 2800 }], env.calls)!;
    expect(same.items[0]!.ref!.asOf).toBe('2025-04-20'); expect(same.as_of).toBe('2025-04-20'); // same figure in two runs → the latest run wins
    const mixed = buildEvidence([{ tool: 'get_funnel', metric: 'registered_and_attended', value: 1350 }, { tool: 'get_funnel', metric: 'registered_and_attended', value: 1925 }], env.calls)!;
    expect(mixed.items.map((i) => i.ref?.asOf)).toEqual(['2025-04-12', '2025-04-20']); expect(mixed.as_of).toBeNull();
  });
});

describe('clarification guard never swallows an eval question that needs tools (P2-6)', () => {
  it('asks only for the items whose correct behaviour is a clarifying question', async () => {
    const { ITEMS } = await import('../eval/questions');
    const { clarifyingQuestion } = await import('../src/clarify');
    for (const it of ITEMS) {
      const q = clarifyingQuestion(it.q, (it.context ?? {}) as any, it.before ?? []);
      if (it.noTools) expect(q, `#${it.id} should ask`).not.toBeNull(); else expect(q, `#${it.id} must reach the tools`).toBeNull();
    }
  });
});
