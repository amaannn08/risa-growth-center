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
    const q = clarifyingQuestion('Which one did better?', {}, []);
    expect(q).toBe(CLARIFY_TEXT);
    expect(q).toMatch(/Which campaigns/); expect((q!.match(/^\d\./gm) ?? []).length).toBe(3);
    expect(groundingCheck(q!, []).checked).toBe(0); // no figures asserted
  });
  it('does not trigger when the question names campaigns, has campaign page context, a prior turn, or ranks all campaigns by a metric', () => {
    expect(clarifyingQuestion('Which one spent less, Paid Social or Creator Partners?', {}, [])).toBeNull();
    expect(clarifyingQuestion('Which campaign has the lowest cost per visitor?', {}, [])).toBeNull();
    expect(clarifyingQuestion('How did the campaign do?', {}, [])).toBeNull();
    expect(clarifyingQuestion('Did Paid Social do better than target?', {}, [])).toBeNull(); // not a comparison between campaigns
    for (const q of ['What was our spend at event close vs data close, and why are they different?', 'Which target applied on 14 March vs 15 March and what moved?', 'What is our progress vs the visitor target at event close?', 'Which target applied at data close?'])
      expect(clarifyingQuestion(q, {}, []), q).toBeNull(); // not campaign comparisons: must reach the tools
  });
  it('asks ONLY for unresolved inputs (Q9: pair known, measure unset; Q10: measure+date known, pair unknown) and never re-asks a resolved follow-up', () => {
    const q9 = clarifyingQuestion('Organic Search or Community Groups for one slot, with no success metric chosen?', {}, [])!;
    expect(q9).toMatch(/On what measure should I compare Organic Search and Community Groups/); expect(q9).not.toMatch(/Which campaigns/);
    const q10 = clarifyingQuestion('Which of those two spent less by March 21, 2025?', {}, [])!;
    expect(q10).toMatch(/Which campaigns do you mean/); expect(q10).toMatch(/measure.* already clear/); expect(q10).not.toMatch(/On what measure/);
    // the same sentence after the pair was named is fully resolved → no question (tools run)
    expect(clarifyingQuestion('Which of those two spent less by March 21, 2025?', {}, ['Compare Organic Search and Community Groups'])).toBeNull();
    expect(clarifyingQuestion('Which one did better?', {}, ['Compare Organic Search and Community Groups on registrations', 'Here is the table…'])).toBeNull();
    // a measure given in the previous user turn carries into "what about …" follow-ups; a judgement word alone does not supply one
    expect(clarifyingQuestion('Which one did better?', {}, ['Organic Search vs Community Groups'])).toMatch(/On what measure/);
    // nothing in the thread names a pair → ask for it
    expect(clarifyingQuestion('Which of those two spent less?', {}, ['What was our spend at data close?'])).toMatch(/Which campaigns do you mean/);
    // an assistant answer that introduced a pair resolves "those two"; an assistant's words never supply a measure
    expect(clarifyingQuestion('Which of those two spent less?', {}, [{ role: 'assistant', text: 'College Partnerships and Creator Partners are the two biggest.' }])).toBeNull();
    expect(clarifyingQuestion('Which one did better?', {}, [{ role: 'user', text: 'Organic Search vs Community Groups' }, { role: 'assistant', text: 'Registrations and visitors are shown below.' }])).toMatch(/On what measure/);
    // a single campaign judgement needs only the measure when the campaign is on the page
    expect(clarifyingQuestion('Was that campaign worth the money?', { campaignId: 'C02' }, [])).toMatch(/On what measure/);
  });
  it('the prompt tells the model to ask instead of assuming', async () => {
    expect(systemPrompt(await makeEnv(db))).toMatch(/Ask ONLY for what is still unresolved, BEFORE any comparison tool runs[\s\S]*ONE short question[\s\S]*calls no tools/);
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
