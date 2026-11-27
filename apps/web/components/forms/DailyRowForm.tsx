'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, Modal, inputCls } from '@/components/Modal';
import { mutate } from '@/lib/mutate';

export interface DailyRowInit { activity_id?: string; campaign_id?: string; activity_date?: string; impressions?: number; clicks?: number; reported_reach?: number; landing_page_sessions?: number; registration_starts?: number; marketing_spend_inr?: number }

/** Add (no activity_id) or edit a Daily Marketing row. Negative spend = credit. */
export function DailyRowButton({ campaigns, init, label, testId }: { campaigns: { campaign_id: string; campaign_name: string }[]; init?: DailyRowInit; label: string; testId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid={testId} onClick={() => setOpen(true)} className="rounded border px-2 py-1 text-xs hover:bg-slate-100">{label}</button>
      {open && <DailyRowDrawer campaigns={campaigns} init={init} onClose={() => setOpen(false)} />}
    </>
  );
}

export function DailyRowDrawer({ campaigns, init = {}, onClose }: { campaigns: { campaign_id: string; campaign_name: string }[]; init?: DailyRowInit; onClose: () => void }) {
  const router = useRouter();
  const editing = !!init.activity_id;
  const [v, setV] = useState({ campaign_id: init.campaign_id ?? campaigns[0]?.campaign_id ?? '', activity_date: init.activity_date ?? '2025-04-16', impressions: init.impressions ?? 0, clicks: init.clicks ?? 0, reported_reach: init.reported_reach ?? 0, landing_page_sessions: init.landing_page_sessions ?? 0, registration_starts: init.registration_starts ?? 0, marketing_spend_inr: init.marketing_spend_inr ?? 0 });
  const [busy, setBusy] = useState(false);
  const num = (k: keyof typeof v) => <input aria-label={k} type="number" className={inputCls} value={v[k] as number} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />;
  const save = async () => {
    setBusy(true);
    const r = editing
      ? await mutate('daily_marketing', 'update', { id: init.activity_id, patch: { activity_date: v.activity_date, impressions: v.impressions, clicks: v.clicks, reported_reach: v.reported_reach, landing_page_sessions: v.landing_page_sessions, registration_starts: v.registration_starts, marketing_spend_inr: v.marketing_spend_inr } })
      : await mutate('daily_marketing', 'add', v);
    setBusy(false);
    if (r.ok) { onClose(); router.refresh(); }
  };
  return (
    <Modal title={editing ? `Edit ${init.activity_id}` : 'Add daily marketing row'} onClose={onClose}>
      <Field label="Campaign">{editing ? <div className="text-sm">{init.campaign_id}</div> : <select aria-label="campaign" className={inputCls} value={v.campaign_id} onChange={(e) => setV({ ...v, campaign_id: e.target.value })}>{campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.campaign_id} · {c.campaign_name}</option>)}</select>}</Field>
      <Field label="Activity date" hint="Must fall inside the dataset window (15 Jan – 20 Apr 2025)"><input aria-label="activity_date" type="date" className={inputCls} value={v.activity_date} onChange={(e) => setV({ ...v, activity_date: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Impressions">{num('impressions')}</Field><Field label="Clicks">{num('clicks')}</Field>
        <Field label="Reported reach">{num('reported_reach')}</Field><Field label="Landing sessions">{num('landing_page_sessions')}</Field>
        <Field label="Registration starts">{num('registration_starts')}</Field>
        <Field label="Spend (₹)" hint="Integer. Negative = vendor credit">{num('marketing_spend_inr')}</Field>
      </div>
      <button data-testid="daily-save" disabled={busy} onClick={save} className="mt-2 w-full rounded bg-slate-900 py-1.5 text-sm text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
    </Modal>
  );
}
