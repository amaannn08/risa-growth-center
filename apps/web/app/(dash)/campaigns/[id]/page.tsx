import { notFound } from 'next/navigation';
import { fmtInr, fmtInt, fmtPct, istDate, recommendCampaigns, showUpByRegistrationWeek, snapshot, weeklySeries } from '@gc/core';
import { getCtx, type SP } from '@/lib/data';
import { PageTitle, Panel, td, tdr, th, thr } from '@/components/kit';
import { Funnel } from '@/components/Funnel';
import { WeeklyBars } from '@/components/charts/Charts';
import { StatusSelect } from '@/components/StatusSelect';
import { DecisionBadge } from '@/components/DecisionBadge';
import { DailyRowButton } from '@/components/forms/DailyRowForm';
import { colorOf } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function CampaignDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const ctx = await getCtx(searchParams);
  const { ds, asOf, rules } = ctx;
  const camp = ds.campaigns[id];
  if (!camp) notFound();
  const snap = snapshot(ds, asOf);
  const f = snap.campaigns![id]!.first_touch;
  const rec = recommendCampaigns(ds, asOf, rules).find((r) => r.campaign_id === id);
  const started = asOf >= istDate(ds.eventMs.startsAt);
  const weeks = weeklySeries(ds).filter((w) => w.through <= asOf || w.from <= asOf).map((w) => {
    const p = w.campaigns[id]!.first_touch.period_increment;
    return { week: w.from.slice(5), registrations: p.registered_people, clicks: p.clicks, spend: p.marketing_spend_inr };
  });
  const cohorts = showUpByRegistrationWeek(ds, asOf, id);
  const tasks = await ctx.db.query<any>(`SELECT t.id, t.title, t.status::text AS status, t.priority::text AS priority, t.due_date::text AS due_date, t.experiment_id FROM tasks t WHERE t.campaign_id=$1 ORDER BY t.id`, [id]);
  const recent = ds.daily.filter((r) => r.campaign_id === id && r.activity_date <= asOf).slice(-14).reverse();
  const campaigns = ds.campaignIds.map((c) => ({ campaign_id: c, campaign_name: ds.campaigns[c]!.campaign_name }));
  const st = f.latest_status_by_person_distinct_within_status;

  return (
    <div className="space-y-4">
      <PageTitle title={`${camp.campaign_name} (${id})`} sub={`${camp.channel} · owner ${camp.owner_name ?? '—'} · as of ${asOf} · first-touch cohort`} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="inline-block size-3 rounded-full" style={{ background: colorOf(id) }} /> <StatusSelect campaignId={id} value={String(camp.status ?? 'active')} />
        {rec && <DecisionBadge rec={rec} />}
        <span className="tabular-nums">Net spend <b>{fmtInr(f.marketing_spend_inr)}</b> · visitor CPA <b>{started ? fmtInr(f.rates.cpa_per_attendee_inr, 2) : '—'}</b> · reg CPA <b>{fmtInr(f.rates.cpa_per_registration_inr, 2)}</b></span>
      </div>
      <Panel title="Funnel" tag="D">
        <Funnel
          platform={[{ label: 'Reported reach', value: f.reported_reach_sum_nonunique }, { label: 'Impressions', value: f.impressions }, { label: 'Clicks', value: f.clicks }, { label: 'Landing sessions', value: f.landing_page_sessions }, { label: 'Registration starts', value: f.registration_starts }]}
          people={[{ label: 'Identified', value: f.identified_external_people }, { label: 'Engaged', value: f.engaged_people }, { label: 'Registered', value: f.registered_people }, { label: 'Confirmed', value: f.confirmed_people }, { label: 'Verified visitors', value: f.attended_people }]} />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Weekly registrations, clicks, spend" tag="D" right="weeks start Monday; first week partial">
          <WeeklyBars data={weeks} bars={[{ key: 'registrations', label: 'Registrations', color: colorOf(id) }, { key: 'clicks', label: 'Clicks', color: '#94a3b8' }]} />
          <table className="mt-2 w-full text-xs"><tbody><tr>{weeks.map((w) => <td key={w.week} className="px-1 text-right text-slate-500" title={`spend ₹${w.spend}`}>₹{Math.round(w.spend / 100) / 10}k</td>)}</tr></tbody></table>
        </Panel>
        <Panel title="Status mix (latest per person)" tag="D">
          <ul className="space-y-1 text-sm">{(['confirmed', 'interested', 'cancelled', 'waitlisted'] as const).map((s) => <li key={s} className="flex justify-between"><span>{s}</span><b className="tabular-nums">{fmtInt(st[s])}</b></li>)}</ul>
          <h3 className="mt-3 text-xs font-medium text-slate-600">Show-up by registration week</h3>
          <table className="mt-1 w-full"><thead><tr><th className={th}>Week of</th><th className={thr}>Registered</th><th className={thr}>Confirmed</th><th className={thr}>Attended</th><th className={thr}>Show-up</th></tr></thead>
            <tbody>{cohorts.map((c) => <tr key={c.week_start} className="border-t"><td className={td}>{c.week_start}</td><td className={tdr}>{c.registered}</td><td className={tdr}>{c.confirmed_now}</td><td className={tdr}>{c.attended}</td><td className={tdr}>{started ? fmtPct(c.show_up, 1) : '—'}</td></tr>)}</tbody></table>
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Tasks for this campaign">
          {tasks.length ? <ul className="space-y-1 text-sm">{tasks.map((t) => <li key={t.id}>#{t.id} {t.title} <span className="text-xs text-slate-500">· {t.status} · {t.priority}{t.due_date ? ` · due ${t.due_date}` : ''}</span></li>)}</ul> : <p className="text-sm text-slate-500">No tasks yet. Create one from a Diagnose finding.</p>}
          <p className="mt-2 text-xs text-slate-500">Experiments link to bets, not campaigns; see Execution for the board.</p>
        </Panel>
        <Panel title="Recent daily rows" right={<DailyRowButton testId="add-row" campaigns={campaigns} init={{ campaign_id: id, activity_date: asOf }} label="Add row" />}>
          <table className="w-full"><thead><tr><th className={th}>Date</th><th className={thr}>Clicks</th><th className={thr}>Spend</th><th className={th} /></tr></thead>
            <tbody>{recent.map((r) => (
              <tr key={r.activity_id} className="border-t"><td className={td}>{r.activity_date}</td><td className={tdr}>{fmtInt(r.clicks)}</td><td className={tdr}>{fmtInr(r.marketing_spend_inr)}</td>
                <td className={td}><DailyRowButton campaigns={campaigns} label="Edit" init={r as any} /></td></tr>))}</tbody></table>
        </Panel>
      </div>
    </div>
  );
}
