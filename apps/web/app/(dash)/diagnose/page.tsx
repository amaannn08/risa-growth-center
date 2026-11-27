import { KNOWN_MISSING, dataQuality, diagnose, fmtInt, fmtNum, fmtPct, istDate, medianDaysToConfirm, showUpByRegistrationWeek, snapshot, weekIsRunning, weeklySeries } from '@gc/core';
import { getCtx, type SP } from '@/lib/data';
import { Caveat, PageTitle, Panel, Pill, td, tdr, th, thr } from '@/components/kit';
import { CreateTaskButton } from '@/components/CreateTaskButton';
import { colorOf } from '@/lib/ui';

export const dynamic = 'force-dynamic';
const SEV: Record<string, string> = { high: 'bg-red-100 text-red-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-slate-100 text-slate-700', info: 'bg-sky-100 text-sky-800' };

export default async function Diagnose({ searchParams }: { searchParams: SP }) {
  const ctx = await getCtx(searchParams);
  const { ds, asOf } = ctx;
  const findings = diagnose(ds, asOf);
  const taskRows = await ctx.db.query<{ id: number; insight_id: string }>('SELECT id, insight_id FROM tasks WHERE insight_id IS NOT NULL');
  const taskFor = new Map(taskRows.map((t) => [t.insight_id, t.id]));
  const weeks = weeklySeries(ds, asOf).filter((w) => w.from <= asOf); // clipped at as-of; the running week is shown but excluded from medians/colouring
  const started = asOf >= istDate(ds.eventMs.startsAt);
  const cohorts = showUpByRegistrationWeek(ds, asOf);
  const medians = medianDaysToConfirm(ds, asOf);
  const dq: any = dataQuality(ds);
  const snap = snapshot(ds, asOf, false).overall; // selected as-of snapshot (walk-ins, headline conversion, event counts)
  const byTRV: any[] = dq.checkins_by_type_result_verification;
  const nonExternalVerified = byTRV.filter((r) => r.person_type !== 'external' && r.result === 'admitted' && r.verification === 'verified').reduce((t, r) => t + r.events, 0);
  const orphans = Object.values(dq.orphan_foreign_keys as Record<string, Record<string, { rows: number }>>).reduce((t, tb) => t + Object.values(tb).reduce((s, c) => s + c.rows, 0), 0);
  const dups = Object.entries(dq.tables as Record<string, { duplicate_extra_rows: number; raw_rows: number }>).filter(([, v]) => v.duplicate_extra_rows > 0);
  const vs = dq.verification_sources_external_people;

  const heat = ds.campaignIds.map((cid) => {
    const cells = weeks.map((w) => { const p = w.campaigns[cid]!.first_touch.period_increment; return { regs: p.registered_people, clicks: p.clicks, rpc: p.clicks ? p.registered_people / p.clicks : null }; });
    const vals = cells.filter((_, i) => !weekIsRunning(weeks[i]!)).map((c) => c.rpc).filter((v): v is number => v !== null).sort((a, b) => a - b);
    const med = vals[Math.floor(vals.length / 2)] ?? 0;
    return { cid, cells, med };
  });
  const fv = (v: number) => (Math.abs(v) <= 1.5 ? fmtNum(v, 4) : fmtInt(v));
  const owner = (cid?: string) => (cid ? ds.campaigns[cid]?.owner_id ?? null : null);

  return (
    <div className="space-y-4">
      <PageTitle title="Diagnose" sub={`As of ${asOf}. Findings are evidence-first; causes are not in the data, so actions are hypotheses to test.`} />
      <Panel title={`Ranked findings (${findings.length})`} right="stage leakage ranked by people lost vs overall rate">
        <ul className="divide-y" data-testid="findings">
          {findings.map((f) => (
            <li key={f.id} className="flex items-start gap-3 py-2" data-testid="finding" data-finding-id={f.id}>
              <Pill className={SEV[f.severity]}>{f.severity}</Pill>
              <div className="min-w-0 flex-1">
                <div className="text-sm">{f.title}</div>
                <div className="text-xs text-slate-500">
                  {f.kind.replace('_', ' ')} · {f.evidence.metric} = {f.evidence.value === null ? '—' : fv(f.evidence.value)}
                  {f.evidence.numerator !== undefined && <> ({fmtInt(f.evidence.numerator)} / {fmtInt(f.evidence.denominator)})</>}
                  {f.evidence.comparison && <> · {f.evidence.comparison.label}: {f.evidence.comparison.value === null ? '—' : fv(f.evidence.comparison.value)}</>}
                </div>
                <div className="text-xs text-slate-700">→ {f.suggested_action}</div>
                {f.caveat && <div className="text-[11px] italic text-slate-500">{f.caveat}</div>}
              </div>
              <CreateTaskButton existing={taskFor.get(f.id)} finding={{ ...f, owner_id: owner(f.campaign_id) }} />
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Week-over-week heat table: registrations / clicks by first-touch campaign" tag="D" right="cell colour: registrations-per-click vs campaign median">
        <div className="overflow-x-auto">
          <table className="text-xs" data-testid="heat">
            <thead><tr><th className={th}>Campaign</th>{weeks.map((w) => <th key={w.from} className={thr} title={`${w.from} → ${w.through}${weekIsRunning(w) ? ' (partial: week still running at the as-of date)' : ''}`}>{w.from.slice(5)}{weekIsRunning(w) ? '*' : ''}</th>)}</tr></thead>
            <tbody>{heat.map((h) => (
              <tr key={h.cid} className="border-t"><td className={`${td} whitespace-nowrap`}><span className="mr-1 inline-block size-2 rounded-full" style={{ background: colorOf(h.cid) }} />{ds.campaigns[h.cid]!.campaign_name}</td>
                {h.cells.map((c, i) => {
                  const r = c.rpc !== null && h.med ? c.rpc / h.med : 1;
                  const bg = weekIsRunning(weeks[i]!) ? 'bg-slate-50 italic' : c.clicks >= 300 && r < 0.6 ? 'bg-red-100' : c.clicks >= 300 && r > 1.5 ? 'bg-emerald-100' : c.clicks >= 300 && c.regs === 0 ? 'bg-red-200' : '';
                  return <td key={i} className={`${tdr} ${bg}`} data-cell={`${h.cid}:${weeks[i]!.from}`} title={`${c.regs} regs / ${c.clicks} clicks`}>{c.regs}<span className="text-slate-400">/{c.clicks}</span></td>;
                })}</tr>))}</tbody>
          </table>
        </div>
        <Caveat>Weeks run Monday–Sunday. * = partial week (clipped at the as-of date): shown, but excluded from medians, colouring and like-for-like alerts. Red = registrations per click below 60% of that campaign’s median on ≥300 clicks. Cause is not in the data.</Caveat>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel title="Cohort lag: show-up by registration week" tag="D">
          <table className="w-full"><thead><tr><th className={th}>Registered week</th><th className={thr}>Registered</th><th className={thr}>Confirmed now</th><th className={thr}>Attended</th><th className={thr}>Show-up</th></tr></thead>
            <tbody>{cohorts.map((c) => <tr key={c.week_start} className="border-t"><td className={td}>{c.week_start}</td><td className={tdr}>{c.registered}</td><td className={tdr}>{c.confirmed_now}</td><td className={tdr}>{c.attended}</td><td className={tdr}>{started ? fmtPct(c.show_up, 1) : '—'}</td></tr>)}</tbody></table>
          <h3 className="mt-3 text-xs font-medium text-slate-600">Median days from registration to first confirmed status</h3>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 text-sm">{ds.campaignIds.map((c) => <li key={c} className="flex justify-between"><span>{ds.campaigns[c]!.campaign_name}</span><b className="tabular-nums">{medians[c] === null || medians[c] === undefined ? '—' : fmtNum(medians[c]!, 1)}</b></li>)}</ul>
        </Panel>

        <Panel title="Data-quality panel" tag="D" right="reconciliation over the FULL dataset (through coverage end), not scoped to the as-of date; walk-ins and headline use the selected date">
          <ul className="space-y-1 text-sm" data-testid="dq">
            <li><b>Duplicates removed:</b> {dups.map(([k, v]) => `${k} ${v.duplicate_extra_rows}`).join(' · ') || 'none'} (identical retries; conflicting repeats are rejected)</li>
            <li><b>{dq.cancelled_then_reconfirmed_count}</b> registrations cancelled then reconfirmed (one registration ID, status history appended)</li>
            <li><b>{fmtInt(snap.attended_unregistered_people)}</b> verified walk-ins with no registration as of {asOf} (headline {started ? fmtPct(snap.rates.attendees_per_registration_headline_including_walkins, 2) : '—'} includes them)</li>
            <li><b>{nonExternalVerified}</b> verified admissions of internal/staff/test people (excluded from visitors)</li>
            <li><b>{dq.checkins_by_result.denied}</b> denied · <b>{dq.checkins_by_result.pending}</b> pending (unverified) check-ins</li>
            <li>Verification sources (external visitors): scanner total <b>{fmtInt(vs.scanner_total)}</b>, manual-only <b>+{fmtInt(vs.manual_only)}</b>, both {vs.both}</li>
            <li><b>{dq.people_with_multiple_verified_attempts_external}</b> visitors with multiple verified scans (events ≠ people)</li>
            <li>Orphan foreign keys: <b>{orphans}</b> · negative net-spend rows (credits): <b>{(dq.negative_daily_net_spend_rows as unknown[]).length}</b></li>
            <li>Verified external events {fmtInt(snap.external_verified_admission_events)} → unique visitors {fmtInt(snap.attended_people)}</li>
          </ul>
          <h3 className="mt-3 text-xs font-medium text-slate-600">What this data cannot tell you</h3>
          <ul className="mt-1 list-disc pl-5 text-xs text-slate-600" data-testid="known-missing">{KNOWN_MISSING.map((m) => <li key={m}>{m}</li>)}</ul>
        </Panel>
      </div>
    </div>
  );
}
