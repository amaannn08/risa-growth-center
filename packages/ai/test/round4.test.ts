import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, resetToSeed, seedDb, type Db } from '@gc/db';
import { itemProvenance } from '@gc/core';
import { makeEnv, runTool, clarifyingQuestion } from '../src';
import { finalAnswerText, groundingFromCalls } from '../src/grounding';
import { buildEvidence } from '../src/evidence';
import { ITEMS } from '../eval/questions';

let db: Db;
beforeAll(async () => { db = await createDb('pglite:memory'); await seedDb(db); }, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await resetToSeed(db, 'system'); });

const turn = async (calls: [string, Record<string, unknown>][], ctx = {}) => {
  const env = await makeEnv(db, ctx);
  const outs: any[] = [];
  for (const [n, a] of calls) outs.push(await runTool(env, n, a));
  return { env, outs, evidence: env.calls };
};

describe('claims are bound to metric, scope and signed value (round-3 P1-2)', () => {
  it('sign reversal: a credit written positive is unverified; the signed value is verified', async () => {
    const { evidence } = await turn([['get_spend_ledger', { from: '2025-04-16', through: '2025-04-18' }]]);
    const bad = groundingFromCalls('Net spend for 16–18 Apr was +₹2,500 [get_spend_ledger].', evidence);
    expect(bad.ok).toBe(false);
    expect(bad.claim_mismatches[0]!.reason).toMatch(/^sign/);
    expect(bad.claim_mismatches[0]!.canonical).toMatch(/−₹2,500/);
    const good = groundingFromCalls('Net spend for 16–18 Apr was −₹2,500 [get_spend_ledger].', evidence);
    expect(good.claim_mismatches).toEqual([]);
    expect(good.bindings.some((b) => b.signedValue === -2500 && b.unit === 'INR' && /credits_total_inr|net_spend_inr/.test(b.field) && b.callId)).toBe(true);
    expect(good.bindings[0]!.scope).toBe('range 2025-04-16..2025-04-18');
  });
  it('metric relabel: an INR amount described as admissions is unverified (answer and task evidence)', async () => {
    const { evidence } = await turn([['get_spend_ledger', { from: '2025-04-16', through: '2025-04-18' }]]);
    const g = groundingFromCalls('There were 2,500 scanner admissions on those days.', evidence);
    expect(g.ok).toBe(false);
    expect(g.claim_mismatches[0]!.reason).toMatch(/^metric/);
    const ev = buildEvidence([{ tool: 'get_spend_ledger', metric: 'scanner admissions', value: -2500 }], evidence);
    expect(ev!.items[0]!.verified).toBe(false);
    expect(ev!.items[0]!.ref).toBeUndefined();
  });
  it('wrong scope: campaign headroom is not the event-wide field', async () => {
    const { evidence } = await turn([['get_spend_ledger', { campaign_id: 'C07', through: '2025-03-26' }]]);
    const bad = groundingFromCalls('Community Groups has ₹75,200 of headroom left.', evidence);
    expect(bad.ok).toBe(false);
    expect(bad.claim_mismatches[0]!.reason).toMatch(/^scope/);
    const good = groundingFromCalls('Community Groups spent ₹12,800; event-wide headroom is ₹75,200.', evidence);
    expect(good.claim_mismatches).toEqual([]);
    expect(good.ok).toBe(true);
  });
  it('named checkpoint: a data-close figure presented as event close is unverified; the event-close figure is verified', async () => {
    const { evidence } = await turn([['get_spend_ledger', { through: '2025-04-20' }]], { asOf: '2025-04-20' });
    const bad = groundingFromCalls('At event close, net spend was ₹274,000.', evidence);
    expect(bad.ok).toBe(false);
    expect(bad.claim_mismatches[0]!.reason).toMatch(/^scope/);
    const good = groundingFromCalls('At event close, net spend was ₹276,500; at data close ₹274,000.', evidence);
    expect(good.claim_mismatches).toEqual([]);
    expect(good.bindings.find((b) => b.signedValue === 276500)!.asOf).toBe('2025-04-13');
  });
  it('a count presented in ₹ (unit) is unverified', async () => {
    const { evidence } = await turn([['get_funnel', {}]]);
    const g = groundingFromCalls('We had ₹2,050 verified visitors.', evidence);
    expect(g.ok).toBe(false);
    expect(g.claim_mismatches[0]!.reason).toMatch(/^unit/);
    expect(groundingFromCalls('We had 2,050 unique verified visitors and net spend of ₹274,000.', evidence).ok).toBe(true);
  });
  it('task evidence: signed, unit-checked, canonical value; unverified items carry no inherited date or revision', async () => {
    const { evidence } = await turn([['get_spend_ledger', { from: '2025-04-16', through: '2025-04-18' }]]);
    const pos = buildEvidence([{ tool: 'get_spend_ledger', metric: 'credits total', value: 2500 }], evidence)!;
    expect(pos.items[0]!.verified).toBe(false); // reversed sign
    const neg = buildEvidence([{ tool: 'get_spend_ledger', metric: 'credits total', value: '−₹2,500', call_id: evidence[0]!.toolCallId, field: 'credits_total_inr' }], evidence)!;
    expect(neg.items[0]).toMatchObject({ verified: true, value: '−₹2,500' });
    expect(neg.items[0]!.ref).toMatchObject({ signedValue: -2500, unit: 'INR', metricField: 'credits_total_inr', scope: 'range 2025-04-16..2025-04-18', asOf: '2025-04-18' });
    const mixed = buildEvidence([{ tool: 'get_spend_ledger', metric: 'credits total', value: -2500 }, { tool: 'get_spend_ledger', metric: 'scanner admissions', value: -2500 }], evidence)!;
    expect(mixed.as_of).toBeNull(); expect(mixed.data_revision).toBeNull();
    expect(itemProvenance(mixed.items[1]!, { as_of: '2025-04-18', data_revision: 9 })).toBe(' (unverified)');
  });
  it('checkpoint args resolve to explicit dates and are echoed', async () => {
    const { outs } = await turn([['get_funnel', { checkpoint: 'event_close' }], ['get_spend_ledger', { checkpoint: 'event_close' }], ['get_funnel', { checkpoint: 'day_1' }]], { asOf: '2025-04-20' });
    expect(outs.map((o) => o.as_of)).toEqual(['2025-04-13', '2025-04-13', '2025-04-12']);
    expect(outs[0].checkpoint).toEqual({ name: 'event_close', date: '2025-04-13' });
    expect(outs[1]).toMatchObject({ net_spend_inr: 276500, gross_positive_spend_inr: 280500, credits_total_inr: -4000 });
  });
  it('definitions, formulas and superseded figures are not claims; the answer is not penalised for them', async () => {
    const { evidence } = await turn([['get_funnel', { as_of: '2025-04-11' }]]);
    const g = groundingFromCalls('At 2025-04-11 (event had not started; day 1 = 2025-04-12), confirmed were 2,500 [get_funnel · 2025-04-11]; share = 2500/2800 ×100. Correction: not 66.67%, the earlier answer said so.', evidence);
    expect(g.claim_mismatches).toEqual([]);
    expect(g.unmatched).toEqual([]);
    expect(g.superseded).toContain('66.67%');
    // but an unmarked untraced figure is still flagged
    expect(groundingFromCalls('Confirmed were 2,501.', evidence).unmatched).toContain('2,501');
  });
  it('only the final step text is the answer', () => {
    expect(finalAnswerText([{ type: 'text', text: 'I will check…' }, { type: 'tool-get_funnel', state: 'output-available' }, { type: 'text', text: 'Final: 2,050.' }])).toBe('Final: 2,050.');
    expect(finalAnswerText([{ type: 'text', text: 'No tools needed.' }])).toBe('No tools needed.');
  });
});

describe('ranged ledger and attendance scope (P2-7)', () => {
  it('credits are filtered with the same bounds as the totals; headroom is named event-wide', async () => {
    const { outs } = await turn([['get_spend_ledger', { from: '2025-04-16', through: '2025-04-18' }]]);
    const o = outs[0];
    expect(o.credits.map((c: any) => [c.date, c.campaign_id, c.amount])).toEqual([['2025-04-16', 'C03', -2000], ['2025-04-18', 'C05', -500]]);
    expect(o.credits.reduce((s: number, c: any) => s + c.amount, 0)).toBe(o.credits_total_inr);
    expect(o.range).toEqual({ from: '2025-04-16', through: '2025-04-18', cumulative: false });
    expect(o.event_wide_headroom_inr).toBe(26000);
    expect(o.headroom_inr).toBeUndefined();
  });
  it('get_attendance exposes dated scanner attempts / verified admissions with event and people denominators', async () => {
    const { outs } = await turn([['get_attendance', {}]]);
    const sat = outs[0].by_day.find((d: any) => d.date === '2025-04-12');
    expect(sat).toMatchObject({ scanner_attempt_events: 1760, scanner_verified_admission_events: 1710, distinct_visitors: 1430, manual_verified_admission_events: 195, scanner_verified_people: 1310, all_attempt_people: 1467 });
    expect(Math.round((1710 / 1760) * 10000) / 100).toBe(97.16);
  });
});

describe('comparison axis before subject count (P2-6)', () => {
  it('one subject at two dates is a time comparison (A6) and is answered with tools', () => {
    expect(clarifyingQuestion('Compare cumulative Paid Social spend on 23 Feb and 2 Mar within the same channel.')).toBeNull();
    expect(clarifyingQuestion('Which was higher for Paid Social, net spend at event close or at data close?')).toBeNull();
  });
  it('a missing campaign pair is still asked for (A5) and a missing measure too (A19-shape)', () => {
    expect(clarifyingQuestion('Which of the two had more registrations through 26 Feb?')).toMatch(/Which campaigns/);
    expect(clarifyingQuestion('Compare Ambassadors and Referrals on 3 Apr; which is better?')).toMatch(/measure/);
  });
  it('every eval question that has deterministic calls is not wrongly clarified', () => {
    for (const i of ITEMS.filter((x) => !x.noTools)) {
      const q = clarifyingQuestion(i.q, (i.context ?? {}) as any, (i.before ?? []).map((t) => ({ role: 'user' as const, text: t })));
      expect(q, `#${i.id} ${i.q}`).toBeNull();
    }
  });
});

describe('assumption what-if shares are validated (P2-9)', () => {
  it('Copilot what-if rejects a 120% opt-in and accepts a 0–1 share', async () => {
    const { outs } = await turn([['what_if', { kind: 'assumption_change', assumption_key: 'b4_optin', assumption_value: 1.2 }], ['what_if', { kind: 'assumption_change', assumption_key: 'b4_optin', assumption_value: 0.8 }]]);
    expect(outs[0].error.code).toBe('INVALID_ASSUMPTION');
    expect(outs[1].error).toBeUndefined();
  });
});

describe('earlier-answer columns are quoted history, not claims', () => {
  it('cells under a header that says "earlier answer" are listed as superseded and never flagged', async () => {
    const { evidence } = await turn([['get_funnel', { as_of: '2025-04-11' }]]);
    const g = groundingFromCalls('| Metric | 2025-04-11 | 2025-03-03 (earlier answer) |\n|---|---|---|\n| Confirmed | 2,500 | 215 |\n| Cancelled | 183 | 13 |', evidence);
    expect(g.unmatched).toEqual([]);
    expect(g.superseded).toEqual(expect.arrayContaining(['215', '13']));
    expect(groundingFromCalls('| Metric | Value |\n|---|---|\n| Confirmed | 2,501 |', evidence).unmatched).toContain('2,501');
  });
});
