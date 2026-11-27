'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { assumptionError, scoreBets, strategyModel, fmtInr, fmtInt, fmtPct, type Assumption, type CampaignHistory, type ScenarioResult } from '@gc/core';
import { mutate } from '@/lib/mutate';
import { kindTag } from '@/lib/ui';
import { Caveat, Panel, Tag, td, tdr, th, thr } from './kit';
import { ContribBar } from './charts/Charts';

export interface BetRow { id: string; rank: number; name: string; mechanism: string; impact: number; confidence: number; ease: number; owner_label: string; start_offset_weeks: number; end_offset_weeks: number; dependencies: string }
interface Props { assumptions: Assumption[]; history: CampaignHistory[]; planBudgets: Record<string, number>; visitors2025: number; bets: BetRow[]; names: Record<string, string> }

const k = (a: { key: string; scenario: string }) => `${a.key}|${a.scenario}`;

export function StrategyWorkbench({ assumptions, history, planBudgets, visitors2025, bets, names }: Props) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, number>>(() => Object.fromEntries(assumptions.map((a) => [k(a), a.value])));
  const [ice, setIce] = useState<Record<string, { impact: number; confidence: number; ease: number }>>(() => Object.fromEntries(bets.map((b) => [b.id, { impact: b.impact, confidence: b.confidence, ease: b.ease }])));
  const [busy, setBusy] = useState(false);
  const live = useMemo(() => assumptions.map((a) => ({ ...a, value: vals[k(a)] ?? a.value })), [assumptions, vals]);
  const m = useMemo(() => strategyModel(live, { history, planBudgets, visitors2025 }), [live, history, planBudgets, visitors2025]);
  const dirty = assumptions.filter((a) => vals[k(a)] !== a.value);
  // the same range check the server runs (assumptionError): out-of-range shares (e.g. 120% opt-in) are flagged and cannot be saved
  const invalid = dirty.map((a) => ({ a, err: assumptionError(a, vals[k(a)]!) })).filter((x) => x.err);
  const dirtyBets = bets.filter((b) => ice[b.id]!.impact !== b.impact || ice[b.id]!.confidence !== b.confidence || ice[b.id]!.ease !== b.ease);
  const w = { impact: vals['w_impact|all'] ?? 0.5, confidence: vals['w_confidence|all'] ?? 0.3, ease: vals['w_ease|all'] ?? 0.2 };
  const scores = scoreBets(bets.map((b) => ({ id: b.id, ...ice[b.id]! })), w);

  const save = async () => {
    setBusy(true);
    for (const a of dirty) { const r = await mutate('assumption', 'upsert', { key: a.key, scenario: a.scenario, value: vals[k(a)] }, { quiet: true }); if (!r.ok) { setBusy(false); return; } }
    for (const b of dirtyBets) { const r = await mutate('bet', 'update', { id: b.id, patch: ice[b.id] }, { quiet: true }); if (!r.ok) { setBusy(false); return; } }
    setBusy(false);
    router.refresh();
  };
  const revert = () => { setVals(Object.fromEntries(assumptions.map((a) => [k(a), a.value]))); setIce(Object.fromEntries(bets.map((b) => [b.id, { impact: b.impact, confidence: b.confidence, ease: b.ease }]))); };

  const groups = [...new Set(assumptions.map((a) => a.group))];
  const keysIn = (g: string) => [...new Set(assumptions.filter((a) => a.group === g).map((a) => a.key))];
  const input = (a: Assumption) => (
    <input aria-label={`${a.key} ${a.scenario}`} data-testid={`as-${a.key}-${a.scenario}`} type="number" step="any" value={vals[k(a)]} onChange={(e) => setVals({ ...vals, [k(a)]: Number(e.target.value) })}
      className={`h-6 w-24 rounded border px-1 text-right text-sm tabular-nums ${vals[k(a)] !== a.value ? 'border-amber-500 bg-amber-50' : ''}`} />
  );

  return (
    <div className="space-y-4">
      <div className="sticky top-[49px] z-20 flex items-center gap-3 rounded-lg border bg-white/95 p-2 text-sm backdrop-blur" data-testid="strategy-summary">
        <span>Base <b data-testid="base-total">{fmtInt(m.base.total)}</b> → headline <b data-testid="base-headline">{fmtInt(m.base.headline)}</b></span>
        <span>Stretch <b data-testid="stretch-total">{fmtInt(m.stretch.total)}</b> → headline <b data-testid="stretch-headline">{fmtInt(m.stretch.headline)}</b></span>
        <span className="text-xs text-slate-500">vs 2025: +{fmtPct(m.growth_vs_2025.base, 0)} / +{fmtPct(m.growth_vs_2025.stretch, 0)}</span>
        <div className="ml-auto flex gap-2">
          {(dirty.length > 0 || dirtyBets.length > 0) && <><span className="text-xs text-amber-700">{dirty.length + dirtyBets.length} unsaved</span><button onClick={revert} className="rounded border px-2 py-1 text-xs">Revert</button></>}
          <button data-testid="save-assumptions" onClick={save} disabled={busy || invalid.length > 0 || (!dirty.length && !dirtyBets.length)} className="rounded bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      {invalid.length > 0 && <div role="alert" data-testid="assumption-invalid" className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800">{invalid.map((x) => x.err).join(' ')} Fix the value to enable Save.</div>}
      <Panel id="model" title="(a) Target model: calculation chain" tag="A" right="recomputed live from the assumptions below">
        <ModelTable base={m.base} stretch={m.stretch} />
        <div className="mt-4 grid gap-4 md:grid-cols-3 [&>*]:min-w-0">
          <div className="rounded border p-3 text-sm" data-testid="reconciliation">
            <div className="mb-1 text-xs font-medium text-slate-600">Reconciliation</div>
            {(['base', 'stretch'] as const).map((s) => { const r = m.reconciliation[s]; return (
              <div key={s} className="mb-2"><b>{s}</b>: {fmtInt(r.raw_total)} → headline <b>{fmtInt(r.headline)}</b> (floor to 50)<br />
                <span className="text-xs text-slate-600">Budget: reference {fmtInr(r.reference_spend)} + bets {fmtInr(r.bets_spend)} + reserve {fmtInr(r.reserve)} = {fmtInr(r.reference_spend + r.bets_spend + r.reserve)} {r.budget_sums_to_cap ? `= cap ${fmtInr(r.cap)} ✓ (reserve ≥ 0)` : `≠ cap ${fmtInr(r.cap)}`}</span><br /><span className="text-xs text-slate-600" data-testid={`reminder-${s}`}>Reminders (B4): {fmtInt(r.reminder.confirmed)} confirmed × {Math.round(r.reminder.optin_rate * 100)}% opt-in = {fmtInt(r.reminder.eligible_optin)} eligible → {Math.round(r.reminder.holdout_share * 100)}% holdout ({fmtInt(r.reminder.holdout)}) → {fmtInt(r.reminder.treatable)} treatable; target {fmtInt(r.reminder.target)} {r.reminder.feasible ? '✓ feasible' : `✗ needs ${r.reminder.required_eligible === null ? 'more than any cohort can supply' : `≥ ${fmtInt(r.reminder.required_eligible)} eligible`}; capped at ${fmtInt(r.reminder.treated)}`}</span><br /><span className="text-xs text-amber-800" data-testid={`reminder-waves-${s}`}>ASSUMPTION — reminder cadence: the holdout receives no messages. All {fmtInt(r.reminder.treated)} treated people get T−7 and T−2 ({r.reminder.wave1_pp} pp). {r.reminder.waves === 2 && `The 50/50 active split sends the event-morning message to ${fmtInt(r.reminder.day_of_treated)} people (${r.reminder.wave2_pp < 0 ? '−' : '+'}${Math.abs(r.reminder.wave2_pp)} pp for that arm only). Compare the active arms to estimate the day-of increment. `}Projected incremental visitors: {fmtInt(Math.round(r.reminder.treated * r.reminder.lift_pp / 100))}.</span>{r.warnings.map((w, i) => <div key={i} className="text-xs text-red-700" role="alert">⚠ {w}</div>)}{r.warnings.length === 0 && <div className="text-xs text-emerald-700">✓ reach ≤ pool · identified ≤ reach · reminder target ≤ opted-in treatable · day split reconciles{r.day_split_gap ? ` (±${Math.abs(r.day_split_gap)} rounding)` : ''}</div>}</div>); })}
          </div>
          <div className="rounded border p-3 text-sm" data-testid="sensitivity">
            <div className="mb-1 text-xs font-medium text-slate-600">Sensitivity</div>
            {(['base', 'stretch'] as const).map((s) => { const x = m.sensitivity[s]; return <div key={s} className="mb-1"><b>{s}</b>: no reminder lift and no walk-ins → <b>{fmtInt(x.no_reminders_no_walkins)}</b>; −{x.showup_drop_pp} pp show-up → <b>{fmtInt(x.showup_drop_visitors)}</b></div>; })}
          </div>
          <div className="rounded border p-3 text-sm" data-testid="capacity">
            <div className="mb-1 text-xs font-medium text-slate-600">Capacity (venue-dependent assumption)</div>
            {(['base', 'stretch'] as const).map((s) => { const c = m[s].capacity; return <div key={s} className="mb-1"><b>{s}</b>: {fmtInt(c.day1)} + {fmtInt(c.day2)} − {fmtInt(c.repeat)} repeat = <b>{fmtInt(c.weekend_unique)}</b> unique (cap {fmtInt(c.cap_weekend)}/weekend, {fmtInt(c.cap_per_day)}/day) {c.exceeds_weekend_cap || c.exceeds_day_cap ? <span className="text-red-700">⚠ exceeds cap</span> : '✓'}</div>; })}
            <div className="text-xs text-slate-500">Gate throughput {fmtInt(m.base.capacity.scans_per_hour)} scans/h + manual desk.</div>
          </div>
        </div>
      </Panel>

      <Panel id="assumptions" title="Assumptions (editable)" right="S sourced · D from dataset · A assumption">
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g}>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</h3>
              <table className="w-full"><thead><tr><th className={th}>Assumption</th><th className={th}>Tag</th><th className={thr}>Base</th><th className={thr}>Stretch</th><th className={th}>Unit</th></tr></thead>
                <tbody>{keysIn(g).map((key) => {
                  const base = assumptions.find((a) => a.key === key && a.scenario === 'base'), stretch = assumptions.find((a) => a.key === key && a.scenario === 'stretch'), all = assumptions.find((a) => a.key === key && a.scenario === 'all');
                  const any = (base ?? all)!;
                  return (
                    <tr key={key} className="border-t"><td className={td} title={any.source_ref ?? ''}>{any.label}<span className="ml-1 text-[11px] text-slate-400">{key}</span></td>
                      <td className={td}><Tag t={kindTag(any.kind)} /></td>
                      {all ? <td className={tdr} colSpan={2}>{input(all)}</td> : <><td className={tdr}>{base && input(base)}</td><td className={tdr}>{stretch && input(stretch)}</td></>}
                      <td className={`${td} text-xs text-slate-500`}>{any.unit}</td></tr>);
                })}</tbody></table>
            </div>
          ))}
        </div>
        <Caveat>Plan budgets per campaign (the ₹180k reference) are edited on the Execution page. Reference outcomes scale 2025 results by budget with {fmtPct(vals['marginal_efficiency|all'] ?? 0.6, 0)} marginal efficiency above 2025 spend (assumption).</Caveat>
      </Panel>

      <Panel id="bets" title="(b) Five ranked bets" tag="A" right="score = (wI·I + wC·C + wE·E) / 5 × 100; weights editable above">
        <table className="w-full" data-testid="bets-table">
          <thead><tr><th className={th}>#</th><th className={th}>Bet</th><th className={thr}>Score</th><th className={thr}>I</th><th className={thr}>C</th><th className={thr}>E</th><th className={th}>Contribution</th><th className={thr}>+Visitors base / stretch</th><th className={thr}>Budget base / stretch</th><th className={th}>Owner · window</th></tr></thead>
          <tbody>{scores.map((s, i) => {
            const b = bets.find((x) => x.id === s.id)!;
            const rb = m.base.bets.find((x) => x.id === s.id)!, rs = m.stretch.bets.find((x) => x.id === s.id)!;
            const c = s.contributions;
            return (
              <tr key={s.id} className="border-t align-top" data-testid={`bet-${s.id}`}>
                <td className={td}>{i + 1}</td>
                <td className={td}><b>{s.id}</b> {b.name}<div className="max-w-md text-xs text-slate-500">{b.mechanism}</div><div className="max-w-md text-[11px] text-slate-400">{b.dependencies}</div></td>
                <td className={`${tdr} font-semibold`} data-testid={`score-${s.id}`}>{s.score}</td>
                {(['impact', 'confidence', 'ease'] as const).map((f) => (
                  <td key={f} className={tdr}><input aria-label={`${s.id} ${f}`} type="number" step="0.5" min={0} max={5} value={ice[s.id]![f]} onChange={(e) => setIce({ ...ice, [s.id]: { ...ice[s.id]!, [f]: Number(e.target.value) } })} className="h-6 w-12 rounded border px-1 text-right" /></td>
                ))}
                <td className={`${td} w-40`}><ContribBar parts={[{ label: 'impact', value: c.impact, color: '#2563eb' }, { label: 'confidence', value: c.confidence, color: '#059669' }, { label: 'ease', value: c.ease, color: '#d97706' }]} /></td>
                <td className={tdr}>+{fmtInt(rb.visitors)} / +{fmtInt(rs.visitors)}<div className="text-[11px] text-slate-400">{rb.formula}</div></td>
                <td className={tdr}>{fmtInr(rb.budget)} / {fmtInr(rs.budget)}</td>
                <td className={`${td} text-xs`}>{b.owner_label}<div className="text-slate-500">T−{b.start_offset_weeks} → T−{b.end_offset_weeks} wks</div></td>
              </tr>);
          })}</tbody>
        </table>
        <Caveat>Each person is assigned once (no double counting across bets). B1 and B2 run on disjoint campuses; B4 is layered on residual no-shows and adds turnout, not acquisition. Bets are assumptions until the experiments in (c) read out.</Caveat>
      </Panel>

      <Panel title="Reference carry-forward (₹ plan budgets by channel)" tag="D" right="outcome = 2025 × min(b/h,1) + 2025 × max(b/h−1,0) × marginal efficiency">
        <table className="w-full"><thead><tr><th className={th}>Campaign</th><th className={thr}>2025 net spend (h)</th><th className={thr}>2026 plan (b)</th><th className={thr}>Regs (base)</th><th className={thr}>Confirmed</th><th className={thr}>Visitors</th><th className={thr}>2025 visitors</th></tr></thead>
          <tbody>{m.base.reference.campaigns.map((c) => <tr key={c.campaign_id} className="border-t"><td className={td}>{names[c.campaign_id] ?? c.name}</td><td className={tdr}>{fmtInr(c.hist_spend)}</td><td className={tdr}>{fmtInr(c.plan_budget)}</td><td className={tdr}>{fmtInt(c.registered)}</td><td className={tdr}>{fmtInt(c.confirmed)}</td><td className={tdr}>{fmtInt(c.visitors)}</td><td className={tdr}>{fmtInt(c.hist_visitors)}</td></tr>)}
            <tr className="border-t-2 font-medium"><td className={td}>Reference</td><td className={tdr} /><td className={tdr}>{fmtInr(m.base.reference.spend)}</td><td className={tdr}>{fmtInt(m.base.reference.registered)}</td><td className={tdr}>{fmtInt(m.base.reference.confirmed)}</td><td className={tdr}>{fmtInt(m.base.reference.visitors)}</td><td className={tdr} /></tr></tbody></table>
      </Panel>
    </div>
  );
}

function ModelTable({ base, stretch }: { base: ScenarioResult; stretch: ScenarioResult }) {
  const rows: [string, string, (s: ScenarioResult) => string, boolean?][] = [
    ['Working pool (A)', 'A', (s) => fmtInt(s.reach.pool)],
    ['Deduplicated reach (A)', 'A', (s) => fmtInt(s.reach.reached)],
    ['Identified pre-event (A)', 'A', (s) => `${fmtInt(s.reach.identified)} (${fmtPct(s.reach.identified_of_reach, 2)} of reach)`],
    ['Registrations / identified', 'A', (s) => `${fmtPct(s.reach.regs_per_identified, 1)} vs ${fmtPct(s.reach.historical_regs_per_identified, 1)} in 2025`],
    ['Reference registrations → confirmed → visitors (D)', 'D', (s) => `${fmtInt(s.reference.registered)} → ${fmtInt(s.reference.confirmed)} → ${fmtInt(s.reference.visitors)}`],
    ['Bets: added registrations (A)', 'A', (s) => fmtInt(s.added_regs)],
    ['Registrations', 'A', (s) => fmtInt(s.registrations), true],
    ['Confirmed', 'A', (s) => fmtInt(s.confirmed), true],
    ['Acquisition visitors from bets', 'A', (s) => fmtInt(s.acquisition_visitors)],
    ['Reminder (B4) visitors', 'A', (s) => fmtInt(s.reminder_visitors)],
    ['Registered visitors', 'A', (s) => `${fmtInt(s.registered_visitors)} (${fmtPct(s.show_up_of_registrations, 1)} of regs)`, true],
    ['Walk-ins (D, capacity-limited)', 'D', (s) => fmtInt(s.walkins)],
    ['Total unique verified visitors', 'A', (s) => fmtInt(s.total), true],
    ['Headline (floor to 50)', 'A', (s) => fmtInt(s.headline), true],
    ['Spend: reference + bets', 'A', (s) => `${fmtInr(s.reference.spend)} + ${fmtInr(s.bets_spend)} = ${fmtInr(s.spend)}`],
    ['Reserve inside the cap', 'A', (s) => `${fmtInr(s.reserve)} of ${fmtInr(s.cap)}`],
    ['CPA: registration / visitor / full-cap visitor', 'A', (s) => `${fmtInr(s.cpa.registration)} / ${fmtInr(s.cpa.visitor)} / ${fmtInr(s.cpa.full_cap_visitor)}`],
  ];
  return (
    <table className="w-full" data-testid="model-table"><thead><tr><th className={th}>Step</th><th className={th} /><th className={thr}>Base</th><th className={thr}>Stretch</th></tr></thead>
      <tbody>{rows.map(([label, tag, f, bold]) => <tr key={label} className={`border-t ${bold ? 'font-semibold' : ''}`}><td className={td}>{label}</td><td className={td}><Tag t={tag} /></td><td className={tdr}>{f(base)}</td><td className={tdr}>{f(stretch)}</td></tr>)}</tbody></table>
  );
}
