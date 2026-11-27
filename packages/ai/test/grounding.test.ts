import { describe, expect, it } from 'vitest';
import { extractNumbers, groundingCheck, groundingLabel } from '../src/grounding';
import { matches } from '../eval/score';

const out = [{ tool: 'get_funnel', as_of: '2025-04-20', data_revision: 7, people: { visitors: 2050, registered: 2800 }, rates: { show: 0.6875, headline: 0.73214286 }, spend: 274000, cpa: 276.47058 }];

describe('grounding extractor', () => {
  it('ignores dates, ids, citations, ordinals, years, T-offsets and small counts', () => {
    const t = 'On 9 Mar and 2025-04-20, C02 and R0001 (T−14) in 2025: top 3 campaigns [get_funnel · 2025-04-20 · r7]\n1. First';
    expect(extractNumbers(t)).toEqual([]);
  });
  it('parses INR, percent, k suffix and thousands separators', () => {
    const v = extractNumbers('₹274,000 and 68.75% and ₹10k and 2,050').map((x) => x.value);
    expect(v).toEqual([274000, 68.75, 10000, 2050]);
  });
  it('traces figures incl. fractions ×100 and rounding', () => {
    const g = groundingCheck('2,050 visitors of 2,800 (73.21%), spend ₹274,000, CPA ₹276.47, show-up 68.75% [get_funnel · 2025-04-20 · r7]', out);
    expect(g.unmatched).toEqual([]); expect(g.ok).toBe(true); expect(g.checked).toBe(6);
    expect(groundingLabel(g)).toMatch(/All 6 figures traced/);
  });
  it('flags untraced figures', () => {
    const g = groundingCheck('We got 2,050 visitors and 3,333 registrations, 41.2% show-up.', out);
    expect(g.unmatched).toEqual(['3,333', '41.2%']); expect(g.ok).toBe(false);
    expect(groundingLabel(g)).toMatch(/2 figures not traced/);
  });
  it('allows numbers the user typed, and sums/differences of two traced figures shown in the answer', () => {
    expect(groundingCheck('You asked about ₹10k: fine', out, ['move ₹10k']).ok).toBe(true);
    const g = groundingCheck('Visitors 2,050 vs registered 2,800: gap 750', out);
    expect(g.ok).toBe(true); expect(g.derived).toEqual(['750']);
    const c = groundingCheck('Show-up 68.75%, so 31.25% did not attend', out); expect(c.ok).toBe(true); expect(c.derived).toEqual(['31.25%']);
    expect(groundingCheck('gap of 9,999 and visitors 2,050', out).ok).toBe(false);
  });
});

describe('eval matcher', () => {
  it('numeric tolerance by precision, regex and substring', () => {
    expect(matches('rate 10.63% here', '10.6')).toBe(true);
    expect(matches('₹274,000', '274,000')).toBe(true);
    expect(matches('68.75%', '68.7')).toBe(true);
    expect(matches('68.0%', '68.75')).toBe(false);
    expect(matches('Draft only; click Confirm', '/confirm/i')).toBe(true);
    expect(matches('Student Referrals', 'student referrals')).toBe(true);
  });
});
