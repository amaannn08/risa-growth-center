import { describe, expect, it } from 'vitest';
import { addDays, eodExclusive, isoIST, istDate, weekdayMon0, weekStart } from '../src';
import { snapshot } from '../src';
import { ds } from './helpers';

describe('time', () => {
  it('EOD boundary: 23:59:59 IST is in, 00:00 next day is out', () => {
    const end = eodExclusive('2025-03-14');
    expect(end).toBe(Date.parse('2025-03-15T00:00:00+05:30'));
    expect(Date.parse('2025-03-14T23:59:59+05:30') < end).toBe(true);
    expect(Date.parse('2025-03-15T00:00:00+05:30') < end).toBe(false);
  });
  it('IST date and iso round-trip', () => {
    const ms = Date.parse('2025-03-15T09:00:00+05:30');
    expect(istDate(ms)).toBe('2025-03-15');
    expect(isoIST(ms)).toBe('2025-03-15T09:00:00+05:30');
    expect(istDate(Date.parse('2025-03-14T20:00:00Z'))).toBe('2025-03-15'); // 01:30 IST next day
  });
  it('weekday Mon=0 and week start', () => {
    expect(weekdayMon0('2025-01-15')).toBe(2); // Wednesday
    expect(weekStart('2025-03-12')).toBe('2025-03-10');
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01');
  });
  it('target 03-14 = launch, 03-15 = revised (09:00 < EOD)', () => {
    const d = ds();
    expect(snapshot(d, '2025-03-14', false).target?.target_version).toBe('Attendee launch plan');
    expect(snapshot(d, '2025-03-15', false).target?.target_version).toBe('Attendee revised plan');
  });
  it('activity_date inclusive: spend on a date is included on that as-of date', () => {
    const d = ds();
    const a = snapshot(d, '2025-04-15', false).overall.marketing_spend_inr;
    const b = snapshot(d, '2025-04-16', false).overall.marketing_spend_inr;
    const day16 = d.daily.filter((r) => r.activity_date === '2025-04-16').reduce((s, r) => s + r.marketing_spend_inr, 0);
    expect(b - a).toBe(day16);
  });
});
