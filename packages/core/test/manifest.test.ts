import { describe, expect, it } from 'vitest';
import { manifest } from './helpers';

describe('manifest (raw/unique counts match data_audit.md)', () => {
  const m = manifest();
  const expected: Record<string, [number, number]> = {
    daily_marketing: [483, 481], people: [3685, 3685], interactions: [11650, 11650], registrations: [2840, 2840],
    registration_history: [5911, 5907], checkins: [3390, 3370], targets: [2, 2], campaigns: [7, 7], event: [1, 1],
    field_guide: [86, 86], read_me: [8, 8],
  };
  it('sha256', () => expect(m.sha256.startsWith('d63f3e01')).toBe(true));
  for (const [slug, [raw, uniq]] of Object.entries(expected))
    it(slug, () => expect([m.sheets[slug].raw_rows, m.sheets[slug].unique_rows]).toEqual([raw, uniq]));
});
