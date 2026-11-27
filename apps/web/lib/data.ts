import 'server-only';
import { coverageEnd, coverageStart, type Assumption, type Attribution, type DecisionRule, type Dataset } from '@gc/core';
import { getDb, readConsistent, type Db, type Management, type Meta, type Q } from '@gc/db';

export type SP = Promise<Record<string, string | string[] | undefined>>;
export const ATTRIBUTIONS: { value: Attribution; label: string }[] = [
  { value: 'first_touch', label: 'First touch' },
  { value: 'registration_source', label: 'Registration source' },
  { value: 'checkin_source', label: 'Check-in source' },
];

export interface Ctx<X = undefined> {
  /** management rows (tasks, experiments, bets, …) and `extra` were read in the SAME snapshot as `ds`/`meta` */
  mgmt: Management; extra: X; ds: Dataset; meta: Meta; asOf: string; attribution: Attribution; covStart: string; covEnd: string;
  assumptions: Assumption[]; rules: DecisionRule[]; sp: Record<string, string | undefined>;
}
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Load the dataset (cached per dataset revision) + URL context. `asOf` is clamped to dataset coverage. */
export async function getCtx<X = undefined>(spPromise: SP = Promise.resolve({}), extra?: (q: Q, sp: Record<string, string | undefined>) => Promise<X>): Promise<Ctx<X>> {
  const raw = await spPromise;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, one(v)]));
  // ONE transaction snapshot: revision, dataset, assumptions/rules and every evidence-bearing management row come from the same committed state.
  const { ds, meta, mgmt, extra: x } = await readConsistent(await getDb(), extra ? (q) => extra(q, sp) : undefined);
  const covStart = coverageStart(ds), covEnd = coverageEnd(ds);
  let asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : covEnd;
  if (asOf < covStart) asOf = covStart;
  if (asOf > covEnd) asOf = covEnd;
  const attribution = (['first_touch', 'registration_source', 'checkin_source'].includes(sp.attr ?? '') ? sp.attr : 'first_touch') as Attribution;
  const { assumptions, rules } = mgmt;
  return { mgmt, extra: x as X, ds, meta, asOf, attribution, covStart, covEnd, assumptions, rules, sp };
}

/** Layout shell: meta + dataset coverage from one snapshot. */
export async function getShell() {
  const { ds, meta } = await readConsistent(await getDb());
  return { ds, meta };
}

export const qs = (ctx: Pick<Ctx, 'asOf' | 'attribution' | 'covEnd'>, extra: Record<string, string | undefined> = {}) => {
  const p = new URLSearchParams();
  if (ctx.asOf !== ctx.covEnd) p.set('asOf', ctx.asOf);
  if (ctx.attribution !== 'first_touch') p.set('attr', ctx.attribution);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
