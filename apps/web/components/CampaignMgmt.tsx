'use client';
import { FormButton, type FormSpec } from './forms/GenericForm';
import { DeleteButton } from './DeleteButton';
import { StatusSelect } from './StatusSelect';
import { td, th, thr, tdr } from './kit';

export interface CampRow { campaign_id: string; campaign_name: string; channel: string; owner_id: string | null; owner_name: string | null; status: string; plan_budget_inr: number | null; planned_start: string | null; planned_end: string | null; notes: string | null }
const spec = (c: CampRow | null, owners: { value: string; label: string }[]): FormSpec => ({
  title: c ? `Edit ${c.campaign_id}` : 'New campaign', entity: 'campaign', action: c ? 'update' : 'create', wrapPatch: !!c, idKey: c ? { key: 'id', value: c.campaign_id } : undefined,
  fields: [
    { name: 'campaign_name', label: 'Name', required: true, value: c?.campaign_name }, { name: 'channel', label: 'Channel', required: true, value: c?.channel },
    { name: 'owner_id', label: 'Owner', type: 'select', options: owners, value: c?.owner_id, nullable: true },
    { name: 'status', label: 'Status', type: 'select', required: true, value: c?.status ?? 'active', options: ['active', 'paused', 'stopped'].map((v) => ({ value: v, label: v })) },
    { name: 'plan_budget_inr', label: '2026 plan budget (₹)', type: 'number', value: c?.plan_budget_inr, nullable: true },
    { name: 'planned_start_at', label: 'Planned start', type: 'date', value: c?.planned_start, nullable: true }, { name: 'planned_end_at', label: 'Planned end', type: 'date', value: c?.planned_end, nullable: true },
    { name: 'notes', label: 'Notes', type: 'textarea', value: c?.notes, nullable: true },
  ],
});

export function CampaignMgmt({ rows, owners }: { rows: CampRow[]; owners: { value: string; label: string }[] }) {
  return (
    <div>
      <div className="mb-2 flex justify-end"><FormButton spec={spec(null, owners)} label="+ New campaign" /></div>
      <table className="w-full" data-testid="mgmt-table"><thead><tr><th className={th}>Campaign</th><th className={th}>Status</th><th className={th}>Owner</th><th className={thr}>2026 plan budget</th><th className={th}>Planned window</th><th className={th} /></tr></thead>
        <tbody>{rows.map((c) => (
          <tr key={c.campaign_id} className="border-t"><td className={td}>{c.campaign_id} · {c.campaign_name}</td><td className={td}><StatusSelect campaignId={c.campaign_id} value={c.status} /></td><td className={td}>{c.owner_name ?? '—'}</td>
            <td className={tdr}>{c.plan_budget_inr === null ? '—' : `₹${c.plan_budget_inr.toLocaleString('en-US')}`}</td><td className={`${td} text-xs`}>{c.planned_start ?? '—'} → {c.planned_end ?? '—'}</td>
            <td className={`${td} flex gap-1`}><FormButton spec={spec(c, owners)} label="Edit" className="rounded border px-1.5 py-0.5 text-xs hover:bg-slate-100" /><DeleteButton entity="campaign" body={{ id: c.campaign_id }} confirmText={`Delete ${c.campaign_id}? Campaigns with activity cannot be deleted; set status=stopped instead.`} /></td></tr>))}</tbody></table>
    </div>
  );
}
