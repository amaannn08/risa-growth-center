import { describe, expect, it } from 'vitest';
import { createDb, seedDb } from '@gc/db';
import { makeEnv, parseStep, runJsonLoop, type ToolLogEntry } from '../src';
import { allow } from '../../../apps/web/lib/rateLimit';

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

describe('rate limiter', () => {
  it('sliding window: allows N then blocks, then frees after the window', () => {
    const k = 'k' + Math.random(), t0 = 1_000_000;
    for (let i = 0; i < 20; i++) expect(allow(k, 20, 600_000, t0 + i)).toBe(true);
    expect(allow(k, 20, 600_000, t0 + 100)).toBe(false);
    expect(allow(k, 20, 600_000, t0 + 600_001)).toBe(true);
  });
});
