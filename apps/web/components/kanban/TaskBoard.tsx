'use client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { mutate } from '@/lib/mutate';
import { FormButton, type FormSpec } from '@/components/forms/GenericForm';
import { DeleteButton } from '@/components/DeleteButton';
import { colorOf } from '@/lib/ui';

export interface TaskRow { id: number; title: string; description: string | null; campaign_id: string | null; owner_id: string | null; due_date: string | null; status: string; priority: string; experiment_id: number | null; bet_id: string | null; insight_id: string | null; evidence: { tool: string; metric: string; value: string | number }[] | null; created_via: string }
interface Opt { value: string; label: string }
const COLS = [['todo', 'To do'], ['in_progress', 'In progress'], ['blocked', 'Blocked'], ['done', 'Done']] as const;
const PRI: Record<string, string> = { p0: 'bg-red-100 text-red-800', p1: 'bg-amber-100 text-amber-800', p2: 'bg-slate-100 text-slate-700' };

export function taskSpec(task: TaskRow | null, campaigns: Opt[], owners: Opt[], bets: Opt[], experiments: Opt[]): FormSpec {
  const t = task;
  return {
    title: t ? `Edit task #${t.id}` : 'New task', entity: 'task', action: t ? 'update' : 'create', wrapPatch: !!t, idKey: t ? { key: 'id', value: t.id } : undefined, testId: t ? undefined : 'new-task',
    fields: [
      { name: 'title', label: 'Title', required: true, value: t?.title },
      { name: 'description', label: 'Description', type: 'textarea', value: t?.description, nullable: true },
      { name: 'campaign_id', label: 'Campaign', type: 'select', options: campaigns, value: t?.campaign_id, nullable: true },
      { name: 'owner_id', label: 'Owner', type: 'select', options: owners, value: t?.owner_id, nullable: true },
      { name: 'due_date', label: 'Due date', type: 'date', value: t?.due_date, nullable: true },
      { name: 'priority', label: 'Priority', type: 'select', required: true, value: t?.priority ?? 'p1', options: ['p0', 'p1', 'p2'].map((v) => ({ value: v, label: v })) },
      { name: 'status', label: 'Status', type: 'select', required: true, value: t?.status ?? 'todo', options: COLS.map(([v, l]) => ({ value: v, label: l })) },
      { name: 'bet_id', label: 'Bet', type: 'select', options: bets, value: t?.bet_id, nullable: true },
      { name: 'experiment_id', label: 'Experiment', type: 'select', asNumber: true, options: experiments, value: t?.experiment_id === null || t?.experiment_id === undefined ? null : String(t.experiment_id), nullable: true },
    ],
  };
}

export function TaskBoard({ tasks, campaigns, owners, bets, experiments, today }: { tasks: TaskRow[]; campaigns: Opt[]; owners: Opt[]; bets: Opt[]; experiments: Opt[]; today: string }) {
  const router = useRouter();
  const [f, setF] = useState({ campaign: '', owner: '', priority: '', overdue: false });
  const ownerName = useMemo(() => Object.fromEntries(owners.map((o) => [o.value, o.label])), [owners]);
  const shown = tasks.filter((t) => (!f.campaign || t.campaign_id === f.campaign) && (!f.owner || t.owner_id === f.owner) && (!f.priority || t.priority === f.priority) && (!f.overdue || (t.due_date && t.due_date < today && t.status !== 'done')));
  const move = async (t: TaskRow, status: string) => { const r = await mutate('task', 'update', { id: t.id, patch: { status } }, { quiet: true }); if (r.ok) router.refresh(); };
  const sel = (label: string, key: 'campaign' | 'owner' | 'priority', opts: Opt[]) => (
    <label className="text-xs">{label} <select aria-label={`filter ${label}`} value={f[key]} onChange={(e) => setF({ ...f, [key]: e.target.value })} className="h-7 rounded border px-1"><option value="">all</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
  );
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {sel('Campaign', 'campaign', campaigns)}{sel('Owner', 'owner', owners)}{sel('Priority', 'priority', ['p0', 'p1', 'p2'].map((v) => ({ value: v, label: v })))}
        <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.checked })} /><span title="Overdue is measured against the as-of date picked in the top bar (the app's clock), not the real-world date.">Overdue (due before as-of {today})</span></label>
        <div className="ml-auto"><FormButton spec={taskSpec(null, campaigns, owners, bets, experiments)} label="+ New task" className="rounded bg-slate-900 px-3 py-1 text-xs text-white" /></div>
      </div>
      <div className="grid gap-3 md:grid-cols-4" data-testid="kanban">
        {COLS.map(([st, label]) => {
          const col = shown.filter((t) => t.status === st);
          return (
            <div key={st} className="rounded-lg bg-slate-50 p-2" data-testid={`col-${st}`}>
              <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-slate-600">{label}<span className="rounded-full bg-white px-1.5 text-slate-500">{col.length}</span></div>
              <div className="space-y-2">
                {col.map((t) => (
                  <div key={t.id} className="rounded-md border bg-white p-2 text-sm shadow-sm" data-testid={`task-${t.id}`}>
                    <div className="flex items-start gap-1.5"><span className={`mt-0.5 rounded px-1 text-[10px] font-semibold ${PRI[t.priority]}`}>{t.priority}</span><div className="min-w-0 flex-1 font-medium leading-snug">{t.title}</div></div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[11px] text-slate-500">
                      {t.due_date && <span className={t.due_date < today && t.status !== 'done' ? 'text-red-600' : ''}>due {t.due_date}</span>}
                      {t.owner_id && <span>· {ownerName[t.owner_id] ?? t.owner_id}</span>}
                      {t.campaign_id && <span className="rounded px-1 text-white" style={{ background: colorOf(t.campaign_id) }}>{t.campaign_id}</span>}
                      {t.bet_id && <span className="rounded bg-slate-200 px-1">{t.bet_id}</span>}
                      {t.experiment_id && <span className="rounded bg-slate-200 px-1">EXP-{t.experiment_id}</span>}
                    </div>
                    {t.insight_id && (
                      <details className="mt-1 text-[11px]"><summary className="cursor-pointer rounded bg-sky-50 px-1 text-sky-800" data-testid="evidence-chip">evidence · {t.insight_id.split(':')[0]}{t.created_via === 'copilot' ? ' · via Copilot' : ''}</summary>
                        <div className="mt-1 text-slate-600">{t.insight_id}{(t.evidence ?? []).map((e, i) => <div key={i}>{e.metric}: {String(e.value)}</div>)}</div></details>
                    )}
                    {!t.insight_id && t.evidence && t.evidence.length > 0 && <div className="mt-1 rounded bg-sky-50 px-1 text-[11px] text-sky-800" data-testid="evidence-chip">evidence · {t.evidence.map((e) => `${e.metric}: ${e.value}`).join('; ')}</div>}
                    <div className="mt-2 flex items-center gap-1">
                      <select aria-label={`Status of task ${t.id}`} value={t.status} onChange={(e) => move(t, e.target.value)} className="h-6 rounded border px-1 text-xs">{COLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                      <FormButton spec={taskSpec(t, campaigns, owners, bets, experiments)} label="Edit" className="rounded border px-1.5 py-0.5 text-xs hover:bg-slate-100" />
                      <DeleteButton entity="task" body={{ id: t.id }} label="×" confirmText={`Delete task #${t.id}?`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
