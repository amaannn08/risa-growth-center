'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Field, Modal, inputCls } from '@/components/Modal';
import { mutate } from '@/lib/mutate';

export interface FieldDef {
  name: string; label: string; type?: 'text' | 'number' | 'datetime' | 'date' | 'select' | 'textarea'; options?: { value: string; label: string }[];
  required?: boolean; asNumber?: boolean; hint?: string; value?: string | number | null; nullable?: boolean;
}
export interface FormSpec { title: string; entity: string; action: string; fields: FieldDef[]; extra?: Record<string, unknown>; idKey?: { key: string; value: string | number }; wrapPatch?: boolean; testId?: string; submitLabel?: string }

/** Config-driven form → POST /api/mutations/:entity. */
export function FormButton({ spec, label, className, afterSave }: { spec: FormSpec; label: string; className?: string; afterSave?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid={spec.testId} onClick={() => setOpen(true)} className={className ?? 'rounded border px-2 py-1 text-xs hover:bg-slate-100'}>{label}</button>
      {open && <GenericForm spec={spec} onClose={() => setOpen(false)} afterSave={afterSave} />}
    </>
  );
}

export function GenericForm({ spec, onClose, afterSave }: { spec: FormSpec; onClose: () => void; afterSave?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(spec.fields.map((f) => [f.name, f.value === null || f.value === undefined ? '' : String(f.value)])));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const body: Record<string, unknown> = {};
    for (const f of spec.fields) {
      const raw = v[f.name] ?? '';
      if (raw === '') { if (f.nullable || spec.wrapPatch) body[f.name] = f.nullable ? null : undefined; continue; }
      body[f.name] = f.type === 'number' || f.asNumber ? Number(raw) : raw;
    }
    setBusy(true);
    const payload = spec.wrapPatch ? { id: spec.idKey!.value, patch: body, ...spec.extra } : { ...body, ...(spec.idKey ? { [spec.idKey.key]: spec.idKey.value } : {}), ...spec.extra };
    const r = await mutate(spec.entity, spec.action, payload);
    setBusy(false);
    if (r.ok) { onClose(); router.refresh(); afterSave?.(); }
  };
  return (
    <Modal title={spec.title} onClose={onClose}>
      {spec.fields.map((f) => (
        <Field key={f.name} label={`${f.label}${f.required ? ' *' : ''}`} hint={f.hint}>
          {f.type === 'select' ? (
            <select aria-label={f.name} className={inputCls} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
              {(f.nullable || !f.required) && <option value="">—</option>}
              {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : f.type === 'textarea' ? (
            <textarea aria-label={f.name} className="w-full rounded border px-2 py-1 text-sm" rows={3} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
          ) : (
            <input aria-label={f.name} className={inputCls} step={f.type === 'number' ? 'any' : undefined} type={f.type === 'datetime' ? 'datetime-local' : f.type ?? 'text'} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
          )}
        </Field>
      ))}
      <button data-testid="form-save" disabled={busy} onClick={save} className="mt-2 w-full rounded bg-slate-900 py-1.5 text-sm text-white disabled:opacity-50">{busy ? 'Saving…' : spec.submitLabel ?? 'Save'}</button>
    </Modal>
  );
}
