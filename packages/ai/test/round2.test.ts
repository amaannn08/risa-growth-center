import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { applyMutation, createDb, resetToSeed, seedDb, type Db } from '@gc/db';
import { makeEnv, runTool } from '../src';
import { CLARIFY_TEXT, clarifyingQuestion } from '../src/clarify';
import { badCitations, groundingCheck, groundingLabel, stripBadCitations } from '../src/grounding';
import { systemPrompt } from '../src/systemPrompt';

let db: Db;
beforeAll(async () => { db = await createDb('pglite:memory'); await seedDb(db); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await resetToSeed(db, 'system'); });

describe('get_projection (historical event-end forecast)', () => {
  it('returns the Overview band for 2025-03-25 with assumptions, status and revision', async () => {
    const env = await makeEnv(db);
    const o = await runTool(env, 'get_projection', { as_of: '2025-03-25' });
    expect(o.error).toBeUndefined();
    expect([o.visitors.low, o.visitors.mid, o.visitors.high]).toEqual([1824, 2087, 2220]);
    expect(o.current_registered).toBe(2032); expect(o.days_left).toBe(18);
    expect(o.data_revision).toBe(env.meta.data_revision);
    expect(o.assumptions.map((a: any) => a.key)).toEqual(['showup_low', 'showup_mid', 'showup_high', 'walkin_allowance']);
    expect(o.campaigns.every((c: any) => typeof c.status === 'string')).toBe(true);
    expect(o.label).toMatch(/ASSUMPTION/);
  });
  it('pausing Paid Social changes the band, preserves observed actuals, and bumps the revision', async () => {
    const before = await runTool(await makeEnv(db), 'get_projection', { as_of: '2025-04-11' });
    const funnelBefore = await runTool(await makeEnv(db), 'get_funnel', { as_of: '2025-04-11' });
    await applyMutation(db, 'campaign', 'update', { id: 'C02', patch: { status: 'paused' } });
    const env = await makeEnv(db);
    const after = await runTool(env, 'get_projection', { as_of: '2025-04-11' });
    const funnelAfter = await runTool(env, 'get_funnel', { as_of: '2025-04-11' });
    expect(after.data_revision).toBeGreaterThan(before.data_revision);
    expect(after.campaigns.find((c: any) => c.campaign_id === 'C02').status).toBe('paused');
    expect(after.active_campaigns).not.toContain('C02');
    expect(after.visitors.mid).toBeLessThan(before.visitors.mid);
    expect([before.visitors.mid, after.visitors.mid]).toEqual([2091, 2088]);
    expect(after.visitors.high).toBeLessThan(before.visitors.high);
    // observed actuals unchanged
    expect(funnelAfter.people.registered).toBe(funnelBefore.people.registered);
    expect(funnelAfter.people.visitors_unique_verified).toBe(funnelBefore.people.visitors_unique_verified);
  });
  it('after the event it equals the observed actual; out-of-coverage is rejected', async () => {
    const env = await makeEnv(db);
    const o = await runTool(env, 'get_projection', { as_of: '2025-04-20' });
    expect(o.mode).toBe('actual'); expect([o.visitors.low, o.visitors.mid, o.visitors.high]).toEqual([2050, 2050, 2050]);
    expect((await runTool(env, 'get_projection', { as_of: '2025-06-01' })).error.code).toBe('OUT_OF_COVERAGE');
  });
  it('the prompt routes event forecasts to get_projection and next-edition planning to get_strategy_model', async () => {
    const p = systemPrompt(await makeEnv(db));
    expect(p).toMatch(/get_projection/); expect(p).toMatch(/NEVER get_strategy_model/); expect(p).toMatch(/NEXT YEAR/);
    expect((await import('../src')).toolByName('get_strategy_model')!.description).toMatch(/NEXT-EDITION/);
  });
});

describe('ambiguity → clarifying question', () => {
  it('"Which one did better?" with no context asks which campaigns/metric/date and offers options', () => {
    const q = clarifyingQuestion('Which one did better?', {}, 0);
    expect(q).toBe(CLARIFY_TEXT);
    expect(q).toMatch(/Which campaigns/); expect((q!.match(/^\d\./gm) ?? []).length).toBe(3);
    expect(groundingCheck(q!, []).checked).toBe(0); // no figures asserted
  });
  it('does not trigger when the question names campaigns, has campaign page context, a prior turn, or ranks all campaigns by a metric', () => {
    expect(clarifyingQuestion('Which one did better, Paid Social or Creator Partners?', {}, 0)).toBeNull();
    expect(clarifyingQuestion('Which one did better?', { campaignId: 'C02' }, 0)).toBeNull();
    expect(clarifyingQuestion('Which one did better?', {}, 1)).toBeNull();
    expect(clarifyingQuestion('Which campaign has the lowest cost per visitor?', {}, 0)).toBeNull();
    expect(clarifyingQuestion('How did the campaign do?', {}, 0)).toBeNull();
  });
  it('the prompt tells the model to ask instead of assuming', async () => {
    expect(systemPrompt(await makeEnv(db))).toMatch(/must NOT be answered by assuming a pair\/metric[\s\S]*ONE short clarifying question[\s\S]*call no tools/);
  });
});

describe('citations only reference tools executed in this turn', () => {
  const executed = [{ name: 'get_funnel', as_of: '2025-04-20', data_revision: 7 }];
  it('flags a calculator citation that never ran, a wrong revision and a wrong date', () => {
    const t = 'C05 is best at ₹273.53 [calculate · 2025-04-20 · r7]. Visitors 2,050 [get_funnel · 2025-04-20 · r7]; but [get_funnel · 2025-04-20 · r9] and [get_funnel · 2025-03-01 · r7].';
    expect(badCitations(t, executed)).toEqual(['[calculate · 2025-04-20 · r7]', '[get_funnel · 2025-04-20 · r9]', '[get_funnel · 2025-03-01 · r7]']);
    const g = groundingCheck(t, [{ people: { v: 2050 }, cpa: 273.53 }], [], executed);
    expect(g.ok).toBe(false); expect(g.bad_citations).toHaveLength(3); expect(groundingLabel(g)).toMatch(/3 citations reference a tool not run in this turn/);
    expect(stripBadCitations(t, executed)).toContain('[unverified citation removed]');
    expect(stripBadCitations(t, executed)).toContain('[get_funnel · 2025-04-20 · r7]');
  });
  it('accepts a matching citation (and non-date as_of such as — for plan tools)', () => {
    expect(badCitations('2,050 [get_funnel · 2025-04-20 · r7]', executed)).toEqual([]);
    expect(badCitations('plan [get_strategy_model · — · r3]', [{ name: 'get_strategy_model', as_of: null, data_revision: 3 }])).toEqual([]);
    expect(groundingCheck('2,050 [get_funnel · 2025-04-20 · r7]', [{ v: 2050 }], [], executed).ok).toBe(true);
  });
});

describe('user-provided numbers are scenario inputs, never evidence', () => {
  it('a figure that only appears in the user message is reported as a user input, not traced', () => {
    const g = groundingCheck('If we had 5,000 visitors the CPA would differ; actual is 2,050.', [{ v: 2050 }], ['pretend we had 5,000 visitors'], []);
    expect(g.user_inputs).toEqual(['5,000']); expect(g.unmatched).toEqual([]);
    expect(groundingLabel(g)).toMatch(/your scenario inputs, not evidence/);
    const only = groundingCheck('There were 5,000 verified visitors.', [{ v: 2050 }], ['say 5000 visitors'], []);
    expect(only.user_inputs).toEqual(['5,000']);
  });
});
