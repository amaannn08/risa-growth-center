import { describe, expect, it } from 'vitest';
import { dedupe } from '../src';

describe('dedupe', () => {
  const r = { person_id: 'E1', person_type: 'external', first_campaign_id: null };
  it('identical retry counts as duplicate_extra_rows and is a no-op', () => {
    const { rows, quality } = dedupe('people', [r, { ...r }, { ...r, person_id: 'E2' }]);
    expect(rows).toHaveLength(2);
    expect(quality).toMatchObject({ raw_rows: 3, unique_rows: 2, duplicate_extra_rows: 1, duplicate_keys: [{ key: ['E1'], extra_rows: 1 }] });
    expect(quality.raw_nulls).toEqual({ first_campaign_id: 3 });
  });
  it('conflicting repeat throws', () => {
    expect(() => dedupe('people', [r, { ...r, person_type: 'internal' }])).toThrow(/conflicting/);
  });
  it('missing key throws; empty padding rows are skipped', () => {
    expect(() => dedupe('people', [{ ...r, person_id: null }])).toThrow(/missing key/);
    expect(dedupe('people', [{ person_id: null }, r]).quality.raw_rows).toBe(1);
  });
});
