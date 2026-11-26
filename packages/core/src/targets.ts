import type { Dataset } from './dataset';
import { snapshot } from './snapshot';

export function targetsView(ds: Dataset, asOf: string) {
  const s = snapshot(ds, asOf, false);
  const goal = s.target ? Number(s.target.marketing_budget_inr) : null;
  return {
    as_of: asOf,
    in_effect: s.target,
    versions: ds.targets.map(({ t, ...r }) => r),
    progress: s.target_progress ?? null,
    budget: goal === null ? null : { spend: s.overall.marketing_spend_inr, cap: goal, headroom: goal - s.overall.marketing_spend_inr },
  };
}
