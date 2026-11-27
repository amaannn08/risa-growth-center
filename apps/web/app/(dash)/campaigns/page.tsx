import Link from 'next/link';
import { UNATTR, fmtInr, fmtInt, fmtPct, istDate, mode, recommendCampaigns, snapshot } from '@gc/core';
import { getCtx, qs, type SP } from '@/lib/data';
import { Caveat, PageTitle, Panel, Pill, td, tdr, th, thr } from '@/components/kit';
import { QuadrantChart } from '@/components/charts/Charts';
import { StatusSelect } from '@/components/StatusSelect';
import { DecisionBadge } from '@/components/DecisionBadge';
import { colorOf } from '@/lib/ui';

export const dynamic = 'force-dynamic';

export default async function Campaigns({ searchParams }: { searchParams: SP }) {
  const ctx = await getCtx(searchParams);
  const { ds, asOf, attribution, rules } = ctx;
  const snap = snapshot(ds, asOf);
  const recs = new Map(recommendCampaigns(ds, asOf, rules).map((r) => [r.campaign_id, r]));
  const post = mode(ds, asOf) === 'post_event';
  const started = asOf >= istDate(ds.eventMs.startsAt);
  const ids = [...ds.campaignIds, UNATTR];

  const rows = ids.map((id) => {
    const v = snap.campaigns![id]!;
    const g = attribution === 'registration_source' ? v.registration_source : v.first_touch;
    const visitorsBy = { first_touch: v.first_touch.attended_people, registration_source: v.registration_source.attended_people, checkin_source: v.checkin_source.attended_people };
    const camp = ds.campaigns[id];
    return {
      id, name: v.campaign_name, g, visitorsBy, camp, rec: recs.get(id),
      noShows: v.first_touch.confirmed_people - v.first_touch.confirmed_and_attended_people,
      cpaV: attribution === 'checkin_source' ? v.checkin_source.cpa_per_attendee_inr : g.rates.cpa_per_attendee_inr,
      visitors: attribution === 'checkin_source' ? v.checkin_source.attended_people : g.attended_people,
    };
  });

  const pts = rows.filter((r) => r.id !== UNATTR && r.rec).map((r) => {
    const f = snap.campaigns![r.id]!.first_touch;
    const x = post ? f.rates.cpa_per_attendee_inr : f.rates.cpa_per_registration_inr;
    const y = post ? f.rates.registered_show_up : f.rates.confirmed_among_registered_people;
    return x === null || y === null ? null : { id: r.id, name: r.name, x, y, size: post ? f.attended_people : f.registered_people, color: colorOf(r.id), decision: r.rec!.decision };
  }).filter((p): p is NonNullable<typeof p> => p !== null);
  const rm = post ? ['visitor_cpa', 'registered_show_up'] : ['registration_cpa', 'confirmed_per_registered'];
  const rl = (m: string) => rules.find((r) => r.mode === (post ? 'post_event' : 'pre_event') && r.metric === m);
  const xLines = [rl(rm[0]!)?.scale_value, rl(rm[0]!)?.stop_value].filter((x): x is number => x !== undefined);
  const yLines = [rl(rm[1]!)?.scale_value, rl(rm[1]!)?.stop_value].filter((x): x is number => x !== undefined);
  const total = snap.overall;
  const planTotal = rows.reduce((t, r) => t + Number(r.camp?.plan_budget_inr ?? 0), 0);

  return (
    <div className="space-y-4">
      <PageTitle title="Campaigns" sub={<>Attribution: <b>{attribution.replace('_', ' ')}</b> · as of {asOf} · decision rules use first-touch ({post ? 'post-event: visitor CPA, registered show-up' : 'pre-event leading indicators: registration CPA, confirmed/registered'}). Attribution is observational, not causal.</>} />
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px]" data-testid="campaign-table">
            <thead><tr className="border-b">
              <th className={th}>Campaign</th><th className={th}>Status</th><th className={th}>Owner</th><th className={thr}>Net spend</th><th className={thr}>2026 plan</th>
              <th className={thr}>Identified</th><th className={thr}>Engaged</th><th className={thr}>Registered</th><th className={thr}>Confirmed</th>
              <th className={thr} title="First-touch cohort">Visitors · FT</th><th className={thr} title="Registration source">· RS</th><th className={thr} title="Check-in source (earliest verified event)">· CS</th>
              <th className={thr}>Reg CPA</th><th className={thr}>Visitor CPA</th><th className={thr}>Reg show-up</th><th className={thr}>Conf show-up</th><th className={thr}>Confirmed no-shows</th><th className={th}>Decision</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0" data-testid={`row-${r.id}`}>
                  <td className={td}>{r.id === UNATTR ? <span className="text-slate-600">Unattributed</span> : <Link className="font-medium underline-offset-2 hover:underline" href={`/campaigns/${r.id}${qs(ctx)}`}><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: colorOf(r.id) }} />{r.name}</Link>}</td>
                  <td className={td}>{r.camp ? <StatusSelect campaignId={r.id} value={String(r.camp.status ?? 'active')} /> : '—'}</td>
                  <td className={td}>{r.camp?.owner_name ?? '—'}</td>
                  <td className={tdr}>{fmtInr(r.g.marketing_spend_inr)}</td>
                  <td className={tdr}>{r.camp?.plan_budget_inr != null ? fmtInr(Number(r.camp.plan_budget_inr)) : '—'}</td>
                  <td className={tdr}>{fmtInt(r.g.identified_external_people)}</td><td className={tdr}>{fmtInt(r.g.engaged_people)}</td>
                  <td className={tdr}>{fmtInt(r.g.registered_people)}</td><td className={tdr}>{fmtInt(r.g.confirmed_people)}</td>
                  <td className={tdr}>{fmtInt(r.visitorsBy.first_touch)}</td><td className={tdr}>{fmtInt(r.visitorsBy.registration_source)}</td><td className={tdr}>{fmtInt(r.visitorsBy.checkin_source)}</td>
                  <td className={tdr} title={`₹${r.g.marketing_spend_inr} / ${r.g.registered_people}`}>{r.id === UNATTR ? '—' : fmtInr(r.g.rates.cpa_per_registration_inr, 2)}</td>
                  <td className={tdr} data-testid={`cpa-${r.id}`} title={`₹${r.g.marketing_spend_inr} / ${r.visitors}`}>{r.id === UNATTR || !started ? '—' : fmtInr(r.cpaV, 2)}</td>
                  <td className={tdr} title={`${r.g.registered_and_attended_people} / ${r.g.registered_people}`}>{started ? fmtPct(r.g.rates.registered_show_up, 1) : '—'}</td>
                  <td className={tdr} title={`${r.g.confirmed_and_attended_people} / ${r.g.confirmed_people}`}>{started ? fmtPct(r.g.rates.confirmed_show_up, 1) : '—'}</td>
                  <td className={tdr}>{started ? fmtInt(r.noShows) : '—'}</td>
                  <td className={td}>{r.rec ? <DecisionBadge rec={r.rec} /> : <Pill className="bg-slate-100 text-slate-500">n/a</Pill>}</td>
                </tr>
              ))}
              <tr className="border-t-2 font-medium"><td className={td}>All</td><td className={td} /><td className={td} /><td className={tdr}>{fmtInr(total.marketing_spend_inr)}</td><td className={tdr} data-testid="plan-total">{fmtInr(planTotal)}</td><td className={tdr}>{fmtInt(total.identified_external_people)}</td><td className={tdr}>{fmtInt(total.engaged_people)}</td><td className={tdr}>{fmtInt(total.registered_people)}</td><td className={tdr}>{fmtInt(total.confirmed_people)}</td><td className={tdr} colSpan={3}>{fmtInt(total.attended_people)} (incl. walk-ins)</td><td className={tdr}>{fmtInr(total.rates.cpa_per_registration_inr, 2)}</td><td className={tdr}>{started ? fmtInr(total.rates.cpa_per_attendee_inr, 2) : '—'}</td><td className={tdr}>{started ? fmtPct(total.rates.registered_show_up, 1) : '—'}</td><td className={tdr}>{started ? fmtPct(total.rates.confirmed_show_up, 1) : '—'}</td><td className={tdr}>{started ? fmtInt(total.confirmed_people - total.confirmed_and_attended_people) : '—'}</td><td className={td} /></tr>
            </tbody>
          </table>
        </div>
        <Caveat>FT = first touch · RS = registration source · CS = check-in source. 2026 plan = next-edition allocation (editable on Execution). The Scale/Change/Stop badge compares the campaign with editable thresholds; hover for the rule evaluation. Status changes do not alter history.</Caveat>
      </Panel>

      <Panel title="Efficiency quadrant" right={post ? 'x: visitor CPA · y: registered show-up · bubble: visitors' : 'x: registration CPA · y: confirmed / registered · bubble: registered'}>
        <QuadrantChart points={pts} xLines={xLines} yLines={yLines} xLabel={post ? 'Visitor CPA (₹)' : 'Registration CPA (₹)'} yLabel={post ? 'Registered show-up' : 'Confirmed / registered'} />
        <Caveat>Dashed lines are the decision-rule thresholds (scale / stop). Bottom-right is expensive and leaky.</Caveat>
      </Panel>
    </div>
  );
}
