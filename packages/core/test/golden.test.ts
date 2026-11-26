import { readFileSync } from 'node:fs';
import { loadRaw } from './helpers';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  attendanceByDay, buildDataset, dailyOverall, dailyStatusTrend, dataQuality, snapshot, weeklySeries,
} from '../src';

const ROOT = resolve(__dirname, '../../..');
const metrics = JSON.parse(readFileSync(`${ROOT}/data/reference/metrics.json`, 'utf8'));

/** Keys deliberately excluded from comparison. Must stay empty. */
const IGNORED_KEYS: string[] = [];

/** Deep compare; returns the first mismatching key paths. Numbers within 1e-7; everything else exact. */
export function diff(exp: any, act: any, path = '$', out: string[] = []): string[] {
  if (out.length > 10) return out;
  if (typeof exp === 'number') {
    if (typeof act !== 'number' || Math.abs(exp - act) > 1e-7) out.push(`${path}: expected ${exp}, got ${act}`);
  } else if (exp === null || typeof exp !== 'object') {
    if (exp !== act) out.push(`${path}: expected ${JSON.stringify(exp)}, got ${JSON.stringify(act)}`);
  } else if (Array.isArray(exp)) {
    if (!Array.isArray(act) || act.length !== exp.length) out.push(`${path}: array length ${exp.length} vs ${act?.length}`);
    else exp.forEach((e, i) => diff(e, act[i], `${path}[${i}]`, out));
  } else {
    if (act === null || typeof act !== 'object') { out.push(`${path}: expected object, got ${act}`); return out; }
    for (const k of Object.keys(exp)) {
      if (IGNORED_KEYS.includes(k)) continue;
      if (!(k in act)) out.push(`${path}.${k}: missing`);
      else diff(exp[k], act[k], `${path}.${k}`, out);
    }
    for (const k of Object.keys(act)) if (!(k in exp) && !IGNORED_KEYS.includes(k)) out.push(`${path}.${k}: unexpected key`);
  }
  return out;
}

const ds = buildDataset(loadRaw());

describe('golden vs audit.py metrics.json', () => {
  it('event, targets, catalog', () => {
    expect(diff(metrics.event, ds.event)).toEqual([]);
    expect(diff(metrics.target_versions, ds.targets.map(({ t, ...r }) => r))).toEqual([]);
    expect(diff(metrics.campaign_catalog, ds.campaigns)).toEqual([]);
  });
  for (const date of Object.keys(metrics.snapshots)) {
    it(`snapshot ${date}`, () => {
      expect(diff(metrics.snapshots[date], snapshot(ds, date))).toEqual([]);
    });
  }
  it('96 daily_overall rows', () => {
    const t0 = Date.now();
    const rows = dailyOverall(ds);
    expect(rows).toHaveLength(96);
    expect(diff(metrics.daily_overall, rows)).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it('daily_status_trend', () => expect(diff(metrics.daily_status_trend, dailyStatusTrend(ds))).toEqual([]));
  it('attendance_by_event_day', () => expect(diff(metrics.attendance_by_event_day, attendanceByDay(ds))).toEqual([]));
  it('weekly_campaigns (both modes)', () => expect(diff(metrics.weekly_campaigns, weeklySeries(ds))).toEqual([]));
  it('data_quality (full, incl. tables)', () => expect(diff(metrics.data_quality, JSON.parse(JSON.stringify(dataQuality(ds))))).toEqual([]));
});
