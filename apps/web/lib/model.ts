import { historyFromDataset, strategyModel, type StrategyModel } from '@gc/core';
import type { Ctx } from './data';

/** Strategy model fed by live DB assumptions, live plan budgets (campaigns.plan_budget_inr) and live 2025 history. */
export function liveStrategy(ctx: Pick<Ctx, 'ds' | 'assumptions'>): StrategyModel {
  const { history, visitors2025 } = historyFromDataset(ctx.ds);
  const planBudgets = Object.fromEntries(Object.values(ctx.ds.campaigns).map((c) => [c.campaign_id, Number(c.plan_budget_inr ?? 0)]));
  return strategyModel(ctx.assumptions, { history, planBudgets, visitors2025 });
}
