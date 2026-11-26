import { describe, expect, it } from 'vitest';
import { calc, fmtInr, fmtPct } from '../src';

describe('calc', () => {
  const v = (e: string) => (calc(e) as any).value;
  it('arithmetic and precedence', () => {
    expect(v('1+2*3')).toBe(7);
    expect(v('(1+2)*3')).toBe(9);
    expect(v('2^3^2')).toBe(512);
    expect(v('-3+5')).toBe(2);
    expect(v('10%4')).toBe(2);
    expect(v('300000/2050')).toBeCloseTo(146.34146, 4);
    expect(v('300,000/2,050')).toBeCloseTo(146.34146, 4);
  });
  it('functions', () => {
    expect(v('max(1,2,3)')).toBe(3);
    expect(v('min(4,2)')).toBe(2);
    expect(v('round(2.567, 2)')).toBe(2.57);
    expect(v('sqrt(16)+abs(-2)')).toBe(6);
  });
  it('rejects identifiers, injection, division by zero', () => {
    for (const bad of ['process.exit()', 'constructor', 'foo(1)', '1/0', '1+', '(1', '2 $ 3', 'x', '1 % 0', '__proto__'])
      expect(calc(bad)).toHaveProperty('error');
  });
});
describe('format', () => {
  it('international grouping, em-dash for null', () => {
    expect(fmtInr(274000)).toBe('₹274,000');
    expect(fmtInr(276.4706, 2)).toBe('₹276.47');
    expect(fmtInr(null)).toBe('—');
    expect(fmtPct(0.6875, 2)).toBe('68.75%');
    expect(fmtPct(null)).toBe('—');
  });
});
