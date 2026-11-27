import { fmtInr } from '@gc/core';
import { getCtx, type SP } from '@/lib/data';
import { liveStrategy } from '@/lib/model';
import { PageTitle, Panel } from '@/components/kit';
import { TaskBoard, type TaskRow } from '@/components/kanban/TaskBoard';
import { ExperimentBoard, type ExpRow } from '@/components/kanban/ExperimentBoard';
import { CampaignMgmt, type CampRow } from '@/components/CampaignMgmt';

export const dynamic = 'force-dynamic';

export default async function Execution({ searchParams }: { searchParams: SP }) {
  const ctx = await getCtx(searchParams);
  const { ds } = ctx;
  const { tasks, experiments: exps, team, bets } = ctx.mgmt as { tasks: TaskRow[]; experiments: ExpRow[]; team: { owner_id: string; name: string }[]; bets: { id: string; name: string }[] };
  const owners = team.map((t) => ({ value: t.owner_id, label: t.name }));
  const campaigns = ds.campaignIds.map((c) => ({ value: c, label: `${c} · ${ds.campaigns[c]!.campaign_name}` }));
  const rows: CampRow[] = ds.campaignIds.map((id) => {
    const c = ds.campaigns[id]!;
    return { campaign_id: id, campaign_name: c.campaign_name, channel: c.channel, owner_id: c.owner_id, owner_name: c.owner_name, status: String(c.status ?? 'active'), plan_budget_inr: c.plan_budget_inr == null ? null : Number(c.plan_budget_inr), planned_start: String(c.planned_start_at).slice(0, 10), planned_end: String(c.planned_end_at).slice(0, 10), notes: (c.notes as string) ?? null };
  });
  const m = liveStrategy(ctx);
  const planTotal = rows.reduce((t, r) => t + (r.plan_budget_inr ?? 0), 0);
  // App clock = the selected as-of date (not the real-world date): next-edition tasks are planned in 2026 against a 2025 dataset.
  const today = ctx.asOf;

  return (
    <div className="space-y-4">
      <PageTitle title="Execution" sub="Next-edition work. Tasks come from Diagnose findings (with evidence), the Copilot (after you confirm a draft) or are created by hand. Every change is audited." />
      <Panel title={`Tasks (${tasks.length})`}>
        <TaskBoard tasks={tasks} campaigns={campaigns} owners={owners} bets={bets.map((b) => ({ value: b.id, label: `${b.id} ${b.name}` }))} experiments={exps.map((e) => ({ value: String(e.id), label: `EXP-${e.id} ${e.name}` }))} today={today} />
      </Panel>
      <Panel title="Experiments" right="record a readout to get Scale / Change / Stop against pre-set thresholds">
        <ExperimentBoard experiments={exps} />
      </Panel>
      <Panel title="Campaign management" right={<span data-testid="alloc">Plan allocation {fmtInr(planTotal)} (reference) + bets {fmtInr(m.base.bets_spend)} = {fmtInr(planTotal + m.base.bets_spend)} of {fmtInr(m.base.cap)} cap · reserve {fmtInr(m.base.cap - planTotal - m.base.bets_spend)}</span>}>
        <CampaignMgmt rows={rows} owners={owners} />
      </Panel>
    </div>
  );
}
