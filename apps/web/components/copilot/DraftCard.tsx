'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { itemProvenance } from '@gc/core';
import { ctxStore } from './chatStore';

type DraftState = { status: 'pending' | 'confirmed' | 'discarded'; ref?: string };
const draftStates = new Map<string, DraftState>(); // survives panel remounts

export function DraftCard({ out }: { out: any }) {
  const router = useRouter();
  const id = out.draft_id as string;
  const [st, setSt] = useState<DraftState>(draftStates.get(id) ?? { status: 'pending' });
  const [payload, setPayload] = useState<Record<string, any>>(out.payload ?? {});
  const [busy, setBusy] = useState(false);
  const isTask = out.draft_kind === 'task';
  const set = (s: DraftState) => { draftStates.set(id, s); setSt(s); };
  const act = async (kind: 'confirm' | 'discard') => {
    setBusy(true);
    try {
      const res = await fetch(`/api/drafts/${id}/${kind}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(kind === 'confirm' ? { payload } : {}) });
      const j = await res.json();
      if (kind === 'confirm' && j.ok) {
        set({ status: 'confirmed', ref: j.result_ref });
        ctxStore.resolved.push({ id, status: 'confirmed', result_ref: j.result_ref });
        toast.success(j.already ? 'Already confirmed' : `Confirmed · rev ${j.data_revision}`); router.refresh();
      } else if (kind === 'discard' && j.ok) { set({ status: 'discarded' }); ctxStore.resolved.push({ id, status: 'discarded' }); }
      else toast.error(j.error?.message ?? 'Request failed');
    } finally { setBusy(false); }
  };
  const field = (k: string, label: string, type = 'text') => (
    <label className="flex items-center gap-1.5 text-xs"><span className="w-14 text-slate-500">{label}</span>
      <input disabled={st.status !== 'pending'} type={type} value={payload[k] ?? ''} onChange={(e) => setPayload({ ...payload, [k]: e.target.value || null })} className="h-6 min-w-0 flex-1 rounded border px-1.5 disabled:bg-slate-50" /></label>
  );
  const taskId = st.ref?.startsWith('task:') ? st.ref.slice(5) : null;
  return (
    <div className="my-2 rounded-md border border-amber-300 bg-amber-50 p-2" data-testid="draft-card">
      <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-900">Draft {isTask ? 'task' : 'campaign change'} · {st.status === 'pending' ? 'needs your confirmation' : st.status}</div>
      {isTask ? <div className="space-y-1">{field('title', 'Title')}{field('owner_id', 'Owner')}{field('due_date', 'Due', 'date')}{field('priority', 'Priority')}</div>
        : <div className="text-xs">{out.preview}<div className="text-slate-600">{String(payload.reason ?? '')}</div></div>}
      {out.evidence?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{out.evidence.map((e: any, i: number) => <span key={i} data-testid="draft-evidence" className={`rounded px-1 text-[10px] ${e.verified === false ? 'bg-amber-100 text-amber-900' : 'bg-white text-slate-600'}`}>{e.tool} · {e.metric}: {String(e.value)}{itemProvenance(e)}</span>)}</div>}
      {st.status === 'pending' && <div className="mt-2 flex gap-2">
        <button disabled={busy} onClick={() => act('confirm')} className="rounded bg-slate-900 px-2.5 py-1 text-xs text-white disabled:opacity-50">Confirm</button>
        <button disabled={busy} onClick={() => act('discard')} className="rounded border px-2.5 py-1 text-xs">Discard</button></div>}
      {st.status === 'confirmed' && <div className="mt-1 text-xs text-emerald-800">{taskId ? `Task #${taskId} created` : 'Applied'} · <Link href="/execution" className="underline">Open in Execution</Link></div>}
    </div>
  );
}
