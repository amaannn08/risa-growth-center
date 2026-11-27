import { describe, expect, it } from 'vitest';
import { createDb, hit, seedDb } from '@gc/db';
import { makeEnv, parseStep, runJsonLoop, type ToolLogEntry } from '../src';

describe('json fallback parser', () => {
  it('parses tool calls and finals, tolerates fences/prose, rejects junk', () => {
    expect(parseStep('{"tool":"get_funnel","args":{"as_of":"2025-04-20"}}')).toEqual({ tool: 'get_funnel', args: { as_of: '2025-04-20' } });
    expect(parseStep('```json\n{"final":"ok"}\n```')).toEqual({ final: 'ok' });
    expect(parseStep('Sure! {"tool":"calculate","args":{"expression":"1+1"}} thanks')).toEqual({ tool: 'calculate', args: { expression: '1+1' } });
    expect(parseStep('no json')).toBeNull();
    expect(parseStep('{"foo":1}')).toBeNull();
  });
  it('loop: retries once on a parse failure, runs the tool, returns the final', async () => {
    const db = await createDb('pglite:memory'); await seedDb(db);
    const env = await makeEnv(db);
    const script = ['garbage', '{"tool":"calculate","args":{"expression":"300000/2050"}}', '{"final":"₹146.34"}'];
    let i = 0; const log: ToolLogEntry[] = [];
    const text = await runJsonLoop(env, [{ role: 'user', content: 'cpa?' }], log, 6, async () => script[i++]!);
    expect(text).toBe('₹146.34'); expect(log).toHaveLength(1); expect(log[0]!.output.value).toBeCloseTo(146.34, 2);
    await db.close();
  });
});

describe('durable rate limiter (Postgres fixed window, atomic upsert)', () => {
  it('allows N, blocks the rest, is atomic under concurrency, and frees after expiry', async () => {
    const db = await createDb('pglite:memory'); await seedDb(db);
    const r = await Promise.all(Array.from({ length: 12 }, () => hit(db, 'chat:t', 5, 600)));
    expect(r.filter((x) => x.allowed)).toHaveLength(5);
    expect((await hit(db, 'chat:t', 5, 600)).allowed).toBe(false);
    expect((await hit(db, 'chat:other', 5, 600)).allowed).toBe(true); // keys are independent
    await db.query(`UPDATE rate_counters SET expires_at = now() - interval '1 second' WHERE key='chat:t'`);
    expect(await hit(db, 'chat:t', 5, 600)).toMatchObject({ allowed: true, count: 1 });
    await db.close();
  });
  it('daily provider-budget reservation counts the request BEFORE the provider call', async () => {
    const db = await createDb('pglite:memory'); await seedDb(db);
    expect((await hit(db, 'chat:daily', 1, 86400)).allowed).toBe(true);
    expect((await hit(db, 'chat:daily', 1, 86400)).allowed).toBe(false);
    await db.close();
  });
});
