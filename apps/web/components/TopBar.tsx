'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { RotateCcw } from 'lucide-react';

const CHIPS = [
  { label: 'Launch (14 Mar)', d: '2025-03-14' }, { label: 'Revised (15 Mar)', d: '2025-03-15' },
  { label: 'Pre-event (11 Apr)', d: '2025-04-11' }, { label: 'Event close (13 Apr)', d: '2025-04-13' }, { label: 'Data close (20 Apr)', d: '2025-04-20' },
];

export function TopBar({ rev, edits, covStart, covEnd }: { rev: number; edits: number; covStart: string; covEnd: string }) {
  const router = useRouter(), path = usePathname(), sp = useSearchParams();
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const asOf = sp.get('asOf') ?? covEnd, attr = sp.get('attr') ?? 'first_touch';
  const set = (k: string, v: string | null) => {
    const p = new URLSearchParams(sp.toString());
    if (v === null || (k === 'asOf' && v === covEnd) || (k === 'attr' && v === 'first_touch')) p.delete(k); else p.set(k, v);
    const s = p.toString();
    router.push(`${path}${s ? `?${s}` : ''}`);
  };
  const reset = async () => {
    const r = await fetch('/api/admin/reset', { method: 'POST' });
    const j = await r.json();
    setConfirm(false);
    if (j.ok) { toast.success(`Reset to original dataset · rev ${j.data_revision}`); start(() => router.refresh()); } else toast.error(j.error?.message ?? 'Reset failed');
  };
  return (
    <header className="sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-white/95 px-4 py-2 text-sm backdrop-blur">
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500">As of</span>
        <input aria-label="As-of date" type="date" min={covStart} max={covEnd} value={asOf} onChange={(e) => e.target.value && set('asOf', e.target.value)} className="h-7 rounded border px-1.5 text-sm" />
      </label>
      <div className="flex flex-wrap gap-1">
        {CHIPS.map((c) => (
          <button key={c.d} onClick={() => set('asOf', c.d)} className={`rounded-full border px-2 py-0.5 text-xs ${asOf === c.d ? 'border-slate-900 bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{c.label}</button>
        ))}
      </div>
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-slate-500">Attribution</span>
        <select aria-label="Attribution" value={attr} onChange={(e) => set('attr', e.target.value)} className="h-7 rounded border px-1.5 text-sm">
          <option value="first_touch">First touch</option><option value="registration_source">Registration source</option><option value="checkin_source">Check-in source</option>
        </select>
      </label>
      <div className="ml-auto flex items-center gap-2">
        <Link href="/data?tab=log" data-testid="rev-badge" title="Open change log" className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-200">
          rev {rev} · {edits} edit{edits === 1 ? '' : 's'} since reset
        </Link>
        <button onClick={() => setConfirm(true)} disabled={pending} className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-slate-100"><RotateCcw className="size-3" />Reset to original dataset</button>
      </div>
      {confirm && (
        <div role="dialog" aria-label="Confirm reset" className="fixed inset-0 z-50 grid place-items-center bg-black/30">
          <div className="w-96 rounded-lg bg-white p-5 shadow-xl">
            <h2 className="font-semibold">Reset to original dataset?</h2>
            <p className="mt-2 text-sm text-slate-600">All data edits, tasks, experiments, assumption changes and pending Copilot drafts return to the seeded state. The change log keeps a record of the reset.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirm(false)} className="rounded border px-3 py-1 text-sm">Cancel</button>
              <button onClick={reset} className="rounded bg-red-600 px-3 py-1 text-sm text-white">Reset</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
