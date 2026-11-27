import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSUMPTIONS, slideContent, slideText, strategyModel } from '../src';

const root = resolve(__dirname, '../../..');
const m = strategyModel(DEFAULT_ASSUMPTIONS);
// numbers every document must carry (plan §7)
const NUMS = ['2,400', '2,850', '2,972', '3,397', '2,690', '3,097', '2,276', '2,725', '2,229', '0.7 pp', '₹273,000', '₹279,000', '₹27,000', '2,206', '92', '85', '80', '71', '54'];

describe('docs consistency (§7 model = README = slides)', () => {
  it('model defaults produce the documented numbers', () => {
    expect([m.base.headline, m.stretch.headline, m.base.registrations, m.stretch.registrations, m.base.confirmed, m.stretch.confirmed]).toEqual([2400, 2850, 2972, 3397, 2690, 3097]);
    expect([m.base.registered_visitors, m.stretch.registered_visitors, m.base.spend, m.stretch.spend, m.base.reserve, m.sensitivity.base.no_reminders_no_walkins]).toEqual([2276, 2725, 273000, 279000, 27000, 2206]);
  });
  it('/slides content module carries every number', () => {
    const t = slideText(slideContent(m));
    for (const n of NUMS) expect(t, `slides missing ${n}`).toContain(n);
    for (const sc of ['92', '85', '80', '71', '54']) expect(slideContent(m).slide2.bets.map((b) => String(b.score))).toContain(sc);
    expect(slideContent(m).slide1.byline).toContain('Aman Gupta');
  });
  it('README carries every number', () => {
    const t = readFileSync(resolve(root, 'README.md'), 'utf8');
    for (const n of NUMS) expect(t, `README missing ${n}`).toContain(n);
    expect(t).toMatch(/92\s*\/\s*85\s*\/\s*80\s*\/\s*71\s*\/\s*54|92, 85, 80, 71, 54|\b92\b[\s\S]{0,400}\b54\b/);
  });
});
