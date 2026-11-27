'use client';
import { DailyRowButton } from './forms/DailyRowForm';
import { FormButton, type FormSpec } from './forms/GenericForm';

type Camp = { campaign_id: string; campaign_name: string };
export function DataForms({ campaigns }: { campaigns: Camp[] }) {
  const opts = campaigns.map((c) => ({ value: c.campaign_id, label: `${c.campaign_id} · ${c.campaign_name}` }));
  const status = ['interested', 'confirmed', 'cancelled', 'waitlisted'].map((s) => ({ value: s, label: s }));
  const person: FormSpec = { title: 'Add person', entity: 'person', action: 'add', testId: 'add-person', fields: [
    { name: 'person_name', label: 'Name', value: 'New person' }, { name: 'person_type', label: 'Type', type: 'select', required: true, value: 'external', options: ['external', 'internal', 'staff', 'test'].map((v) => ({ value: v, label: v })) },
    { name: 'first_seen_at', label: 'First seen (IST)', type: 'datetime', required: true, value: '2025-04-13T11:00' },
    { name: 'first_campaign_id', label: 'First-touch campaign', type: 'select', options: opts, nullable: true, hint: 'Leave empty for a walk-in' }] };
  const reg: FormSpec = { title: 'Add registration', entity: 'registration', action: 'add', testId: 'add-registration', fields: [
    { name: 'person_id', label: 'Person ID', required: true, hint: 'External person without a registration' }, { name: 'campaign_id', label: 'Campaign', type: 'select', options: opts, required: true, value: campaigns[0]?.campaign_id },
    { name: 'registered_at', label: 'Registered at (IST)', type: 'datetime', required: true, value: '2025-04-10T10:00' }, { name: 'status', label: 'Initial status', type: 'select', options: status, required: true, value: 'interested' }] };
  const st: FormSpec = { title: 'Change registration status', entity: 'registration_status', action: 'change', testId: 'change-status', submitLabel: 'Append status version', fields: [
    { name: 'registration_id', label: 'Registration ID', required: true, hint: 'History is append-only: this adds a new version' }, { name: 'status', label: 'New status', type: 'select', options: status, required: true, value: 'confirmed' },
    { name: 'effective_at', label: 'Effective at (IST)', type: 'datetime', required: true, value: '2025-04-12T09:00' }] };
  const ck: FormSpec = { title: 'Add check-in', entity: 'checkin', action: 'add', testId: 'add-checkin', fields: [
    { name: 'person_id', label: 'Person ID', required: true }, { name: 'occurred_at', label: 'Occurred at (IST)', type: 'datetime', required: true, value: '2025-04-13T11:00' },
    { name: 'result', label: 'Result', type: 'select', required: true, value: 'admitted', options: ['admitted', 'denied', 'pending'].map((v) => ({ value: v, label: v })) },
    { name: 'verification', label: 'Verification', type: 'select', required: true, value: 'verified', options: ['verified', 'unverified'].map((v) => ({ value: v, label: v })) },
    { name: 'source', label: 'Source', type: 'select', required: true, value: 'manual', options: ['scanner', 'manual'].map((v) => ({ value: v, label: v })) },
    { name: 'registration_id', label: 'Registration ID (optional)', nullable: true }, { name: 'event_id', label: 'Event ID (optional; repeats are no-ops)' }] };
  const tg: FormSpec = { title: 'New target version', entity: 'target_version', action: 'add', testId: 'add-target', fields: [
    { name: 'effective_at', label: 'Effective at (IST)', type: 'datetime', required: true, value: '2025-04-01T09:00' }, { name: 'target_version', label: 'Version name', required: true, value: 'Visitor stretch plan' },
    { name: 'identified_external_people_goal', label: 'Identified goal', type: 'number', required: true, value: 3600 }, { name: 'registration_goal', label: 'Registration goal', type: 'number', required: true, value: 3200 },
    { name: 'unique_external_visitors_goal', label: 'Unique visitors goal', type: 'number', required: true, value: 2500 }, { name: 'marketing_budget_inr', label: 'Marketing budget (₹)', type: 'number', required: true, value: 300000 },
    { name: 'note', label: 'Note', nullable: true }] };
  return (
    <div className="flex flex-wrap gap-2">
      <DailyRowButton testId="add-daily" campaigns={campaigns} label="+ Daily marketing row" />
      <FormButton spec={person} label="+ Person" /><FormButton spec={reg} label="+ Registration" /><FormButton spec={st} label="Change reg. status" />
      <FormButton spec={ck} label="+ Check-in" /><FormButton spec={tg} label="+ Target version" />
      <a href="/api/export" className="rounded border px-2 py-1 text-xs hover:bg-slate-100">Export JSON</a>
    </div>
  );
}
