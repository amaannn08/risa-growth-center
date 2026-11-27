import { readFileSync } from 'node:fs';
import { attendanceByDay, dailyOverall, dailyStatusTrend, dataQuality, deepDiff, snapshot, weeklySeries } from '@gc/core';
import { REPO_ROOT, type Q } from './client';
import { loadDataset } from './load';

const MGMT_KEYS = ['status', 'plan_budget_inr', 'notes', 'provenance', 'target_audience_', 'note'];

/** DB → engine → deep-compare with the Python-audit oracle. Returns the list of diffs (empty = pass). */
export async function verifyAgainstReference(q: Q, opts: { full?: boolean } = {}) {
  const metrics = JSON.parse(readFileSync(`${REPO_ROOT}/data/reference/metrics.json`, 'utf8'));
  const { ds } = await loadDataset(q);
  const diffs: string[] = [];
  const dates = ['2025-03-14', '2025-03-15', '2025-04-11', '2025-04-13', '2025-04-20'];
  for (const d of dates) for (const m of deepDiff(metrics.snapshots[d], snapshot(ds, d))) diffs.push(`snapshot ${d} ${m}`);
  const dq: any = JSON.parse(JSON.stringify(dataQuality(ds)));
  const ref = { ...metrics.data_quality }; delete ref.tables; delete dq.tables; // tables come from import_runs
  for (const m of deepDiff(ref, dq)) diffs.push(`data_quality ${m}`);
  const rawTables = metrics.data_quality.tables;
  for (const m of deepDiff(rawTables, JSON.parse(JSON.stringify(dataQuality(ds).tables)))) diffs.push(`data_quality.tables ${m}`);
  if (opts.full) {
    for (const m of deepDiff(metrics.daily_overall, dailyOverall(ds))) diffs.push(`daily_overall ${m}`);
    for (const m of deepDiff(metrics.daily_status_trend, dailyStatusTrend(ds))) diffs.push(`daily_status_trend ${m}`);
    for (const m of deepDiff(metrics.attendance_by_event_day, attendanceByDay(ds))) diffs.push(`attendance ${m}`);
    for (const m of deepDiff(metrics.weekly_campaigns, weeklySeries(ds))) diffs.push(`weekly ${m}`);
  }
  void MGMT_KEYS;
  return diffs;
}
