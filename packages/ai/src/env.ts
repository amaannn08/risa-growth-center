import {
  coverageEnd, coverageStart, historyFromDataset, strategyModel, type Assumption, type Attribution, type DecisionRule, type Dataset,
} from '@gc/core';
import { getDb, readConsistent, type Db, type Management, type Meta } from '@gc/db';
import type { CallEvidence } from './evidence';

export interface ChatContext { page?: string; asOf?: string; attribution?: Attribution; campaignId?: string; resolvedDrafts?: { id: string; result_ref?: string; status: string }[] }

/** Everything a tool needs, pinned to one dataset revision for the whole answer. */
export interface ToolEnv {
  db: Db; ds: Dataset; meta: Meta; assumptions: Assumption[]; rules: DecisionRule[];
  context: ChatContext; conversationId?: string; covStart: string; covEnd: string;
  /** management rows read in the SAME snapshot as `ds`/`meta` (tasks, experiments, bets, team) */ mgmt: Management;
  /** server-issued evidence for every tool call executed this turn (trusted call history) */ calls: CallEvidence[];
}

export class ToolError extends Error {
  constructor(public code: string, message: string, public hint?: string) { super(message); }
}

export async function loadAssumptions(db: Db) {
  return Promise.all([
    db.query<Assumption>(`SELECT key, scenario::text AS scenario, "group", value::float8 AS value, unit, label, kind::text AS kind, source_ref FROM plan_assumptions ORDER BY "group", key, scenario`),
    db.query<DecisionRule>(`SELECT mode::text AS mode, metric, scale_op, scale_value::float8 AS scale_value, stop_op, stop_value::float8 AS stop_value, min_registered FROM decision_rules ORDER BY mode, metric`),
  ]);
}

export async function makeEnv(db?: Db, context: ChatContext = {}, conversationId?: string): Promise<ToolEnv> {
  const d = db ?? (await getDb());
  // revision + dataset + assumptions/rules + management rows under ONE transaction snapshot
  const { ds, meta, mgmt } = await readConsistent(d);
  return { db: d, ds, meta, assumptions: mgmt.assumptions as Assumption[], rules: mgmt.rules as DecisionRule[], mgmt, calls: [], context, conversationId, covStart: coverageStart(ds), covEnd: coverageEnd(ds) };
}

export function liveStrategy(env: Pick<ToolEnv, 'ds' | 'assumptions'>, assumptions = env.assumptions) {
  const { history, visitors2025 } = historyFromDataset(env.ds);
  const planBudgets = Object.fromEntries(Object.values(env.ds.campaigns).map((c) => [c.campaign_id, Number(c.plan_budget_inr ?? 0)]));
  return strategyModel(assumptions, { history, planBudgets, visitors2025 });
}
