import 'server-only';
import { coverageEnd, coverageStart, type Assumption, type Attribution, type DecisionRule, type Dataset } from '@gc/core';
import { getDb, getMeta, loadDataset, type Db, type Meta } from '@gc/db';

export type SP = Promise<Record<string, string | string[] | undefined>>;
export const ATTRIBUTIONS: { value: Attribution; label: string }[] = [
  { value: 'first_touch', label: 'First touch' },
  { value: 'registration_source', label: 'Registration source' },
  { value: 'checkin_source', label: 'Check-in source' },
];

export interface Ctx {
  db: Db; ds: Dataset; meta: Meta; asOf: string; attribution: Attribution; covStart: string; covEnd: string;
  assumptions: Assumption[]; rules: DecisionRule[]; sp: Record<string, string | undefined>;
}
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Load the dataset (cached per dataset revision) + URL context. `asOf` is clamped to dataset coverage. */
export async function getCtx(spPromise: SP = Promise.resolve({})): Promise<Ctx> {
  const raw = await spPromise;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, one(v)]));
  const db = await getDb();
  const { ds, meta } = await loadDataset(db);
  const covStart = coverageStart(ds), covEnd = coverageEnd(ds);
  let asOf = sp.asOf && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : covEnd;
  if (asOf < covStart) asOf = covStart;
  if (asOf > covEnd) asOf = covEnd;
  const attribution = (['first_touch', 'registration_source', 'checkin_source'].includes(sp.attr ?? '') ? sp.attr : 'first_touch') as Attribution;
  const [assumptions, rules] = await Promise.all([
    db.query<Assumption>(`SELECT key, scenario::text AS scenario, "group", value::float8 AS value, unit, label, kind::text AS kind, source_ref FROM plan_assumptions ORDER BY "group", key, scenario`),
    db.query<DecisionRule>(`SELECT mode::text AS mode, metric, scale_op, scale_value::float8 AS scale_value, stop_op, stop_value::float8 AS stop_value, min_registered FROM decision_rules ORDER BY mode, metric`),
  ]);
  return { db, ds, meta, asOf, attribution, covStart, covEnd, assumptions, rules, sp };
}

export async function getShellMeta() {
  const db = await getDb();
  return getMeta(db);
}

export const qs = (ctx: Pick<Ctx, 'asOf' | 'attribution' | 'covEnd'>, extra: Record<string, string | undefined> = {}) => {
  const p = new URLSearchParams();
  if (ctx.asOf !== ctx.covEnd) p.set('asOf', ctx.asOf);
  if (ctx.attribution !== 'first_touch') p.set('attr', ctx.attribution);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};
