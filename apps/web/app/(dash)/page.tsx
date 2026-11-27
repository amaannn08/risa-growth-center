import Link from 'next/link';
import {
  dailyOverall, diagnose, fmtInr, fmtInt, fmtPct, istDate, projectVisitors, projectionBacktest, snapshot, targetsView,
} from '@gc/core';
import { getCtx, qs, type SP } from '@/lib/data';
import { liveStrategy } from '@/lib/model';
import { Caveat, Kpi, PageTitle, Panel, Pill, td, tdr, th, thr } from '@/components/kit';
import { Funnel } from '@/components/Funnel';
import { CumulativeChart } from '@/components/charts/Charts';
import { CreateTaskButton } from '@/components/CreateTaskButton';

export const dynamic = 'force-dynamic';

export default async function Overview({ searchParams }: { searchParams: SP }) {
  const ctx = await getCtx(searchParams);
  const { ds, asOf, assumptions } = ctx;
  const snap = snapshot(ds, asOf);
  const o = snap.overall, tp = snap.target_progress, tv = targetsView(ds, asOf);
  const eventStart = istDate(ds.eventMs.startsAt), eventEnd = istDate(ds.eventMs.endsAt);
  const started = asOf >= eventStart, closed = asOf >= eventEnd;

  const series = dailyOverall(ds).filter((s) => s.as_of <= asOf).map((s) => ({
    date: s.as_of, registered: s.overall.registered_people, visitors: s.overall.attended_people, spend: s.overall.marketing_spend_inr,
    reg_goal: s.target_progress?.registration_goal.goal ?? null, visitor_goal: s.target_progress?.unique_external_visitors_goal.goal ?? null, cap: s.target_progress?.marketing_budget_inr.goal ?? null,
  }));
  const proj = projectVisitors(ds, asOf, assumptions);
  const backtest = projectionBacktest(ds, assumptions);
  const model = liveStrategy(ctx);
  const findings = diagnose(ds, asOf).slice(0, 3);
  const taskFor = new Map(ctx.mgmt.tasks.filter((t) => t.insight_id).map((t) => [t.insight_id as string, t.id as number]));
  const ownerOf = (cid?: string) => (cid ? ds.campaigns[cid]?.owner_id ?? null : null);

  const vis = tp?.unique_external_visitors_goal, reg = tp?.registration_goal, idn = tp?.identified_external_people_goal, bud = tp?.marketing_budget_inr;
  const headline = o.rates.attendees_per_registration_headline_including_walkins;

  return (
    <div className="space-y-4">
      <PageTitle title="Overview" sub={<>As of <b>{asOf}</b> (IST end of day) · target in effect: <b>{snap.target?.target_version ?? '—'}</b> · CampusFest 2025 (synthetic)</>} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi testId="kpi-visitors" label="Unique verified visitors" tag="D" value={fmtInt(o.attended_people)} sub={vis ? `of ${fmtInt(vis.goal)} · ${fmtPct(vis.fraction, 1)}` : '—'} title={vis ? `${o.attended_people} / ${vis.goal} (target: ${snap.target?.target_version})` : undefined} />
        <Kpi testId="kpi-registered" label="Registered" tag="D" value={fmtInt(o.registered_people)} sub={reg ? `of ${fmtInt(reg.goal)} · ${fmtPct(reg.fraction, 1)}` : '—'} title={reg ? `${o.registered_people} / ${reg.goal}` : undefined} />
        <Kpi testId="kpi-confirmed" label="Confirmed (latest status)" tag="D" value={fmtInt(o.confirmed_people)} sub={`${fmtPct(o.rates.confirmed_among_registered_people, 1)} of registered`} title={`${o.confirmed_people} / ${o.registered_people}`} />
        <Kpi testId="kpi-identified" label="Identified" tag="D" value={fmtInt(o.identified_external_people)} sub={idn ? `of ${fmtInt(idn.goal)} · ${fmtPct(idn.fraction, 1)}` : '—'} title={idn ? `${o.identified_external_people} / ${idn.goal}` : undefined} />
        <Kpi testId="kpi-spend" label="Net spend" tag="D" value={fmtInr(o.marketing_spend_inr)} sub={bud ? `of ${fmtInr(bud.goal)} cap · headroom ${fmtInr(bud.goal - bud.actual)}` : '—'} title="Net of vendor credits (negative postings)" />
        <Kpi testId="kpi-showup" label="Registered show-up" tag="D" value={started ? fmtPct(o.rates.registered_show_up, 2) : '—'}
          sub={started ? <>{o.registered_and_attended_people}/{o.registered_people} · {fmtPct(headline, 2)} headline incl. {o.attended_unregistered_people} walk-ins</> : 'event not yet held'}
          title="Registered ∩ attended / registered. The headline attendees/registrations ratio includes walk-ins." />
      </div>

      <Panel title="Funnel" tag="D" right="Reach, impressions, clicks, sessions and starts are observations, not people">
        <Funnel
          platform={[
            { label: 'Reported reach (non-unique)', value: o.reported_reach_sum_nonunique }, { label: 'Impressions', value: o.impressions }, { label: 'Clicks', value: o.clicks },
            { label: 'Landing sessions', value: o.landing_page_sessions }, { label: 'Registration starts', value: o.registration_starts },
          ]}
          people={[
            { label: 'Identified', value: o.identified_external_people }, { label: 'Engaged (meaningful)', value: o.engaged_people }, { label: 'Registered', value: o.registered_people },
            { label: 'Confirmed', value: o.confirmed_people }, { label: 'Verified visitors', value: o.attended_people },
          ]}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Registrations and visitors vs target in effect" tag="D" right="goal steps at 15 Mar (revised plan)">
          <CumulativeChart data={series} lines={[
            { key: 'registered', label: 'Registered', color: '#2563eb' }, { key: 'reg_goal', label: 'Registration goal', color: '#2563eb', step: true, dashed: true },
            { key: 'visitors', label: 'Verified visitors', color: '#059669' }, { key: 'visitor_goal', label: 'Visitor goal', color: '#059669', step: true, dashed: true },
          ]} />
        </Panel>
        <Panel title="Cumulative net spend vs cap" tag="D" right="credits reduce net spend">
          <CumulativeChart money data={series} lines={[{ key: 'spend', label: 'Net spend', color: '#dc2626' }, { key: 'cap', label: 'Cap in effect', color: '#64748b', step: true, dashed: true }]} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={closed ? 'Event-day projection (event is over)' : 'Projection to event day'} tag="A" right={proj.label}>
          {proj.mode === 'actual' ? (
            <p className="text-sm">As of {asOf} the event has ended, so the projection equals the actual: <b>{fmtInt(proj.visitors.mid)}</b> unique verified visitors ({fmtInt(proj.current_registered)} registered).</p>
          ) : (
            <div data-testid="projection">
              <div className="grid grid-cols-3 gap-2 text-center">
                {(['low', 'mid', 'high'] as const).map((k) => <div key={k} className="rounded border p-2"><div className="text-xs text-slate-500">{k}</div><div className="text-xl font-semibold tabular-nums">{fmtInt(proj.visitors[k])}</div><div className="text-[11px] text-slate-500">{fmtInt(proj.registrations[k])} regs</div></div>)}
              </div>
              <Caveat>{proj.days_left} days to event. Run-rate of active campaigns (paused/stopped contribute none) × show-up assumption ({proj.assumptions.map((a) => `${a.key}=${a.value}`).join(', ')}). <Link className="underline" href={`/strategy${qs(ctx)}#assumptions`}>Edit assumptions</Link></Caveat>
            </div>
          )}
          <details className="mt-3" open={!closed}>
            <summary className="cursor-pointer text-xs font-medium text-slate-600">How good is this projection? (backtest vs final {fmtInt(proj.mode === 'actual' ? proj.visitors.mid : backtest[0]?.actual)})</summary>
            <table className="mt-2 w-full text-xs"><thead><tr><th className={th}>As of (Sun)</th><th className={thr}>Low</th><th className={thr}>Mid</th><th className={thr}>High</th><th className={thr}>Mid error</th><th className={th}>In band</th></tr></thead>
              <tbody>{backtest.map((b) => (
                <tr key={b.as_of} className="border-t"><td className={td}>{b.as_of}</td><td className={tdr}>{fmtInt(b.low)}</td><td className={tdr}>{fmtInt(b.mid)}</td><td className={tdr}>{fmtInt(b.high)}</td><td className={tdr}>{b.error_mid > 0 ? '+' : ''}{fmtInt(b.error_mid)} ({fmtPct(b.error_mid_pct, 1)})</td><td className={td}>{b.within_band ? 'yes' : 'no'}</td></tr>))}</tbody></table>
            <Caveat>Linear run-rate; it cannot see conversion shocks (e.g. the 9 Mar College Partnerships zero week). Reported as produced.</Caveat>
          </details>
        </Panel>

        <Panel title="Next edition (Bengaluru)" tag="A" right={<Link className="underline" href={`/strategy${qs(ctx)}`}>Open strategy →</Link>}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded border p-2"><div className="text-xs text-slate-500">2025 actual</div><div className="text-xl font-semibold">{fmtInt(o.attended_people)}</div></div>
            <div className="rounded border p-2" data-testid="next-base"><div className="text-xs text-slate-500">Base</div><div className="text-xl font-semibold">{fmtInt(model.base.headline)}</div><div className="text-[11px] text-emerald-700">+{fmtPct(model.growth_vs_2025.base, 0)}</div></div>
            <div className="rounded border p-2" data-testid="next-stretch"><div className="text-xs text-slate-500">Stretch</div><div className="text-xl font-semibold">{fmtInt(model.stretch.headline)}</div><div className="text-[11px] text-emerald-700">+{fmtPct(model.growth_vs_2025.stretch, 0)}</div></div>
          </div>
          <Caveat>Unique verified external visitors on {fmtInr(model.base.cap)} cap: base spend {fmtInr(model.base.spend)} (reserve {fmtInr(model.base.reserve)}), stretch {fmtInr(model.stretch.spend)}. Built bottom-up from the 2025 cohort; every input is tagged S/D/A on the Strategy page.</Caveat>
        </Panel>
      </div>

      <Panel title="Top findings" right={<Link className="underline" href={`/diagnose${qs(ctx)}`}>All findings →</Link>}>
        <ul className="divide-y">
          {findings.map((f) => (
            <li key={f.id} className="flex items-start gap-3 py-2" data-testid="finding">
              <Pill className={f.severity === 'high' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>{f.severity}</Pill>
              <div className="min-w-0 flex-1 text-sm">{f.title}<div className="text-xs text-slate-500">{f.suggested_action}</div></div>
              <CreateTaskButton existing={taskFor.get(f.id)} finding={{ ...f, owner_id: ownerOf(f.campaign_id) }} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
