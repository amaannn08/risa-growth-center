import { EXPERIMENTS, WHY_BENGALURU, BETS, historyFromDataset, fmtInt } from '@gc/core';
import { getCtx, type SP } from '@/lib/data';
import { liveStrategy } from '@/lib/model';
import { Caveat, PageTitle, Panel, Pill, Tag, td, th } from '@/components/kit';
import { StrategyWorkbench, type BetRow } from '@/components/StrategyWorkbench';
import { RulesEditor } from '@/components/RulesEditor';

export const dynamic = 'force-dynamic';
void EXPERIMENTS; void BETS;

export default async function Strategy({ searchParams }: { searchParams: SP }) {
  const ctx = await getCtx(searchParams);
  const { ds, assumptions, rules } = ctx;
  const { history, visitors2025 } = historyFromDataset(ds);
  const planBudgets = Object.fromEntries(Object.values(ds.campaigns).map((c) => [c.campaign_id, Number(c.plan_budget_inr ?? 0)]));
  const names = Object.fromEntries(Object.values(ds.campaigns).map((c) => [c.campaign_id, c.campaign_name]));
  const bets = await ctx.db.query<any>(`SELECT id, rank, name, mechanism, impact::float8 AS impact, confidence::float8 AS confidence, ease::float8 AS ease, params, start_offset_weeks, end_offset_weeks FROM bets ORDER BY rank`);
  const betRows: BetRow[] = bets.map((b) => ({ id: b.id, rank: b.rank, name: b.name, mechanism: b.mechanism, impact: b.impact, confidence: b.confidence, ease: b.ease, owner_label: b.params?.owner_label ?? '', start_offset_weeks: b.start_offset_weeks, end_offset_weeks: b.end_offset_weeks, dependencies: b.params?.dependencies ?? '' }));
  const rejected = await ctx.db.query<any>('SELECT * FROM rejected_ideas ORDER BY id');
  const exps = await ctx.db.query<any>(`SELECT id, bet_id, name, primary_kpi, kpi_unit, assignment_unit, scale_op, scale_value::float8 AS scale_value, stop_op, stop_value::float8 AS stop_value, change_rule, stop_note, status::text AS status FROM experiments ORDER BY bet_id, id`);
  const m = liveStrategy(ctx);

  return (
    <div className="space-y-4">
      <PageTitle title="Strategy: next edition (Bengaluru)" sub={<>Target <b>{fmtInt(m.base.headline)}</b> base / <b>{fmtInt(m.stretch.headline)}</b> stretch unique verified external visitors on a {`₹${fmtInt(m.base.cap)}`} cap. Same model as the slides and Copilot; every input tagged S / D / A.</>} />
      <StrategyWorkbench assumptions={assumptions} history={history} planBudgets={planBudgets} visitors2025={visitors2025} bets={betRows} names={names} />

      <Panel title="Rejected / deprioritized ideas" right="why not">
        <table className="w-full" data-testid="rejected"><thead><tr><th className={th}>Idea</th><th className={th}>Indicative visitors</th><th className={th}>Indicative cost</th><th className={th}>Decision</th><th className={th}>Reason</th></tr></thead>
          <tbody>{rejected.map((r) => <tr key={r.id} className="border-t align-top"><td className={td}><b>{r.name}</b><div className="text-xs text-slate-500">{r.mechanism}</div></td><td className={td}>{r.indicative_visitors}</td><td className={td}>{r.indicative_cost}</td><td className={td}><Pill className="bg-slate-100 text-slate-700">{r.decision}</Pill></td><td className={`${td} text-xs`}>{r.reason}</td></tr>)}</tbody></table>
      </Panel>

      <Panel title="(c) Experiment thresholds" tag="A" right="Scale / change / stop, set before the test">
        <table className="w-full" data-testid="exp-thresholds"><thead><tr><th className={th}>Bet</th><th className={th}>Primary KPI</th><th className={th}>Scale</th><th className={th}>Change</th><th className={th}>Stop</th><th className={th}>Assignment</th></tr></thead>
          <tbody>{exps.map((e) => <tr key={e.id} className="border-t align-top"><td className={td}><b>{e.bet_id}</b> {e.name}</td><td className={`${td} text-xs`}>{e.primary_kpi}</td>
            <td className={td}><Pill className="bg-emerald-100 text-emerald-800">{e.scale_op} {e.scale_value}{e.kpi_unit === '%' ? '%' : ` ${e.kpi_unit ?? ''}`}</Pill></td>
            <td className={`${td} text-xs`}>{e.change_rule}</td>
            <td className={td}><Pill className="bg-red-100 text-red-800">{e.stop_op} {e.stop_value}{e.kpi_unit === '%' ? '%' : ` ${e.kpi_unit ?? ''}`}</Pill><div className="text-[11px] text-slate-500">{e.stop_note}</div></td><td className={`${td} text-xs`}>{e.assignment_unit}</td></tr>)}</tbody></table>
        <Caveat>Cadence: weekly review T−6 to T−3 weeks, daily from T−14 days. Log the experiment arm before exposure, use stable person IDs and compare cohorts at equal age. Readouts are recorded on the Execution page.</Caveat>
        <h3 className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Campaign decision rules (editable; drive the Scale / Change / Stop badges)</h3>
        <RulesEditor rules={rules} />
      </Panel>

      <Panel title="(d) Audience sizing and why Bengaluru" tag="S">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="text-sm">
            <div className="mb-1 text-xs font-medium text-slate-600">Working pool <Tag t="A" /></div>
            25 club campuses × 2,000 + 20 catchments × 1,500 + 40,000 alumni/interest = <b>{fmtInt(m.base.reach.pool)}</b>. Reach {fmtInt(m.base.reach.reached)} (base) / {fmtInt(m.stretch.reach.reached)} (stretch) → identified {fmtInt(m.base.reach.identified)} / {fmtInt(m.stretch.reach.identified)}. Registrations per identified fall to {(m.base.reach.regs_per_identified * 100).toFixed(1)}% / {(m.stretch.reach.regs_per_identified * 100).toFixed(1)}% (vs 77.2% in 2025) because broader reach converts lower.
          </div>
          <ul className="space-y-1 text-sm" data-testid="why-blr">{WHY_BENGALURU.map((w) => <li key={w.url}><Tag t={w.tag} /> <a className="underline" href={w.url} target="_blank" rel="noreferrer">{w.fact}</a></li>)}</ul>
        </div>
        <Caveat>Benchmarks come from different contexts (e.g. healthcare SMS reminders, commerce referrals) and are used as priors, not evidence about CampusFest.</Caveat>
      </Panel>
    </div>
  );
}
