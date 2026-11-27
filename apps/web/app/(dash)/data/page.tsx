import Link from 'next/link';
import { fmtInt } from '@gc/core';
import { getCtx, type SP } from '@/lib/data';
import { PageTitle, Panel, td, th } from '@/components/kit';
import { DataForms } from '@/components/DataForms';
import { DailyRowButton } from '@/components/forms/DailyRowForm';
import { DeleteButton } from '@/components/DeleteButton';

export const dynamic = 'force-dynamic';
const PAGE = 50;
const IST = (c: string) => `to_char(${c} at time zone 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS')`;

interface TabCfg { label: string; table: string; cols: string[]; ts?: string[]; dateCol?: string; dateIsTs?: boolean; campaignCol?: string; statusCol?: string; qCols?: string[]; order: string }
const TABS: Record<string, TabCfg> = {
  daily: { label: 'Daily marketing', table: 'daily_marketing', cols: ['activity_id', 'campaign_id', 'activity_date', 'impressions', 'clicks', 'reported_reach', 'landing_page_sessions', 'registration_starts', 'marketing_spend_inr', 'provenance'], dateCol: 'activity_date', campaignCol: 'campaign_id', qCols: ['activity_id'], order: 'activity_date DESC, activity_id' },
  people: { label: 'People', table: 'people', cols: ['person_id', 'person_name', 'person_type', 'first_touch_source', 'first_seen_at', 'first_campaign_id', 'provenance'], ts: ['first_seen_at'], dateCol: 'first_seen_at', dateIsTs: true, campaignCol: 'first_campaign_id', qCols: ['person_id', 'person_name'], order: 'first_seen_at DESC, person_id' },
  interactions: { label: 'Engagement', table: 'interactions', cols: ['interaction_id', 'person_id', 'campaign_id', 'occurred_at', 'event_type', 'provenance'], ts: ['occurred_at'], dateCol: 'occurred_at', dateIsTs: true, campaignCol: 'campaign_id', qCols: ['person_id', 'interaction_id'], order: 'occurred_at DESC, interaction_id' },
  registrations: { label: 'Registrations', table: 'registrations', cols: ['registration_id', 'person_id', 'campaign_id', 'registered_at', 'provenance'], ts: ['registered_at'], dateCol: 'registered_at', dateIsTs: true, campaignCol: 'campaign_id', qCols: ['person_id', 'registration_id'], order: 'registered_at DESC, registration_id' },
  history: { label: 'Registration history', table: 'registration_history', cols: ['history_id', 'registration_id', 'person_id', 'campaign_id', 'effective_at', 'status', 'provenance'], ts: ['effective_at'], dateCol: 'effective_at', dateIsTs: true, campaignCol: 'campaign_id', statusCol: 'status', qCols: ['person_id', 'registration_id'], order: 'effective_at DESC, history_id DESC' },
  checkins: { label: 'Check-ins', table: 'checkins', cols: ['event_id', 'person_id', 'registration_id', 'campaign_id', 'occurred_at', 'result', 'verification', 'source', 'provenance'], ts: ['occurred_at'], dateCol: 'occurred_at', dateIsTs: true, campaignCol: 'campaign_id', statusCol: 'result', qCols: ['person_id', 'event_id'], order: 'occurred_at DESC, event_id' },
  targets: { label: 'Targets', table: 'target_versions', cols: ['effective_at', 'target_version', 'identified_external_people_goal', 'registration_goal', 'unique_external_visitors_goal', 'marketing_budget_inr', 'note', 'provenance'], ts: ['effective_at'], order: 'effective_at' },
};

const diffOf = (b: any, a: any) => {
  if (!b && a) return Object.entries(a).filter(([, v]) => v !== null).slice(0, 8).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v).slice(0, 40)}`).join(', ');
  if (b && !a) return `deleted ${Object.entries(b).slice(0, 3).map(([k, v]) => `${k}=${String(v).slice(0, 30)}`).join(', ')}`;
  return Object.keys(a ?? {}).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b?.[k])).map((k) => `${k}: ${JSON.stringify(b?.[k])} → ${JSON.stringify(a[k])}`).join('; ').slice(0, 300);
};

export default async function DataPage({ searchParams }: { searchParams: SP }) {
  const ctx = await getCtx(searchParams);
  const sp = ctx.sp;
  const tab = sp.tab === 'log' || TABS[sp.tab ?? ''] ? sp.tab! : 'daily';
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const campaigns = ctx.ds.campaignIds.map((c) => ({ campaign_id: c, campaign_name: ctx.ds.campaigns[c]!.campaign_name }));
  const link = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...extra })) if (v) p.set(k, v);
    return `/data?${p}`;
  };

  let body: React.ReactNode, total = 0;
  if (tab === 'log') {
    total = (await ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM audit_log'))[0]?.n ?? 0;
    const rows = await ctx.db.query<any>(`SELECT id, ${IST('at')} AS at, actor::text AS actor, entity, entity_id, action::text AS action, before, after, data_revision, client_id FROM audit_log ORDER BY id DESC LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`);
    body = (
      <table className="w-full" data-testid="audit-table"><thead><tr><th className={th}>Rev</th><th className={th}>When (IST)</th><th className={th}>Actor</th><th className={th} title="anonymous per-request client id (hashed IP)">Client</th><th className={th}>Action</th><th className={th}>Entity</th><th className={th}>Change (before → after)</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id} className="border-t align-top"><td className={td}>{r.data_revision}</td><td className={`${td} whitespace-nowrap`}>{r.at}</td><td className={td}>{r.actor}</td><td className={`${td} font-mono text-xs text-slate-500`}>{r.client_id ?? '—'}</td><td className={td}>{r.action}</td><td className={td}>{r.entity} <span className="text-slate-500">{r.entity_id}</span></td><td className={`${td} text-xs`}>{diffOf(r.before, r.after)}</td></tr>)}</tbody></table>
    );
  } else {
    const c = TABS[tab]!;
    const where: string[] = [], params: unknown[] = [];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('$$', `$${params.length}`)); };
    if (sp.campaign && c.campaignCol) add(`${c.campaignCol} = $$`, sp.campaign);
    if (sp.status && c.statusCol) add(`${c.statusCol}::text = $$`, sp.status);
    if (sp.date && c.dateCol) add(c.dateIsTs ? `(${c.dateCol} at time zone 'Asia/Kolkata')::date = $$::date` : `${c.dateCol} = $$::date`, sp.date);
    if (sp.q && c.qCols) {
      params.push(`%${sp.q}%`);
      where.push(`(${c.qCols.map((q) => `${q} ILIKE $${params.length}`).join(' OR ')})`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const sel = c.cols.map((k) => (c.ts?.includes(k) ? `${IST(k)} AS ${k}` : k)).join(', ');
    total = (await ctx.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${c.table} ${w}`, params))[0]?.n ?? 0;
    const rows = await ctx.db.query<any>(`SELECT ${sel} FROM ${c.table} ${w} ORDER BY ${c.order} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, params);
    body = (
      <>
        <form className="mb-3 flex flex-wrap items-end gap-2 text-xs" action="/data">
          <input type="hidden" name="tab" value={tab} />
          {sp.asOf && <input type="hidden" name="asOf" value={sp.asOf} />}
          {c.campaignCol && <label>Campaign<br /><select name="campaign" defaultValue={sp.campaign ?? ''} className="h-7 rounded border px-1"><option value="">all</option>{campaigns.map((x) => <option key={x.campaign_id} value={x.campaign_id}>{x.campaign_id} {x.campaign_name}</option>)}</select></label>}
          {c.dateCol && <label>Date<br /><input type="date" name="date" defaultValue={sp.date ?? ''} className="h-7 rounded border px-1" /></label>}
          {c.statusCol && <label>{c.statusCol}<br /><input name="status" placeholder="e.g. confirmed" defaultValue={sp.status ?? ''} className="h-7 w-28 rounded border px-1" /></label>}
          {c.qCols && <label>Search ID<br /><input name="q" defaultValue={sp.q ?? ''} placeholder="E0001" className="h-7 w-28 rounded border px-1" /></label>}
          <button className="h-7 rounded border px-3">Filter</button><Link className="h-7 px-2 py-1 text-slate-500 underline" href={link({ campaign: undefined, status: undefined, date: undefined, q: undefined, page: undefined })}>clear</Link>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="data-table"><thead><tr>{c.cols.map((k) => <th key={k} className={th}>{k}</th>)}<th className={th} /></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={i} className={`border-t ${r.provenance === 'user' ? 'bg-amber-50' : ''}`} data-provenance={r.provenance}>
                {c.cols.map((k) => <td key={k} className={td}>{r[k] === null ? '—' : String(r[k])}</td>)}
                <td className={`${td} whitespace-nowrap`}>
                  {tab === 'daily' && <DailyRowButton campaigns={campaigns} label="Edit" init={{ ...r, activity_date: String(r.activity_date).slice(0, 10) }} />}
                  {tab === 'targets' && r.provenance === 'user' && <DeleteButton entity="target_version" body={{ effective_at: String(r.effective_at).replace(' ', 'T') }} />}
                </td></tr>))}</tbody></table>
        </div>
      </>
    );
  }
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <div className="space-y-4">
      <PageTitle title="Data" sub={`rev ${ctx.meta.data_revision} · ${ctx.meta.edits_since_reset} edits since reset · rows you add or edit are highlighted (provenance = user). Every change is audited and bumps the revision, so Overview, Campaigns, Diagnose and the Copilot recompute on the next request.`} />
      <DataForms campaigns={campaigns} />
      <Panel>
        <div className="mb-3 flex flex-wrap gap-1 border-b pb-2 text-sm" data-testid="data-tabs">
          {[...Object.entries(TABS).map(([k, v]) => [k, v.label] as const), ['log', 'Change log'] as const].map(([k, label]) => (
            <Link key={k} href={`/data?tab=${k}${ctx.sp.asOf ? `&asOf=${ctx.sp.asOf}` : ''}`} className={`rounded px-2.5 py-1 ${tab === k ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}>{label}</Link>
          ))}
        </div>
        {body}
        <div className="mt-3 flex items-center gap-3 text-xs text-slate-600">
          <span>{fmtInt(total)} rows · page {page} / {pages}</span>
          {page > 1 && <Link className="underline" href={link({ tab, page: String(page - 1) })}>← prev</Link>}
          {page < pages && <Link className="underline" href={link({ tab, page: String(page + 1) })}>next →</Link>}
        </div>
      </Panel>
    </div>
  );
}
