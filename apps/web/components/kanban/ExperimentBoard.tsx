'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { evaluateExperiment } from '@gc/core';
import { Field, Modal, inputCls } from '@/components/Modal';
import { mutate } from '@/lib/mutate';
import { DECISION_STYLE } from '@/lib/ui';

export interface ExpRow { id: number; bet_id: string | null; name: string; primary_kpi: string | null; kpi_unit: string | null; min_sample: number | null; scale_op: string | null; scale_value: number | null; stop_op: string | null; stop_value: number | null; change_rule: string | null; stop_note: string | null; readout_date: string | null; status: string; observed_value: number | null; observed_n: number | null; decision: string | null; owner_id: string | null }
const COLS = ['planned', 'running', 'readout', 'scaled', 'changed', 'stopped'] as const;
const LABEL: Record<string, string> = { scale: 'Scale', change: 'Change', stop: 'Stop', insufficient_sample: 'Insufficient sample' };

export function ExperimentBoard({ experiments }: { experiments: ExpRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState<ExpRow | null>(null);
  const setStatus = async (e: ExpRow, status: string) => { const r = await mutate('experiment', 'update', { id: e.id, patch: { status } }, { quiet: true }); if (r.ok) router.refresh(); };
  return (
    <>
      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6" data-testid="exp-board">
        {COLS.map((c) => (
          <div key={c} className="rounded-lg bg-slate-50 p-2"><div className="mb-2 px-1 text-xs font-semibold capitalize text-slate-600">{c}</div>
            <div className="space-y-2">{experiments.filter((e) => (e.status === 'draft' ? 'planned' : e.status) === c).map((e) => (
              <div key={e.id} className="rounded-md border bg-white p-2 text-xs shadow-sm" data-testid={`exp-${e.id}`}>
                <div className="font-medium">{e.bet_id} · {e.name}</div>
                <div className="mt-1 flex flex-wrap gap-1"><span className="rounded bg-emerald-100 px-1 text-emerald-800">scale {e.scale_op} {e.scale_value}</span><span className="rounded bg-red-100 px-1 text-red-800">stop {e.stop_op} {e.stop_value}</span></div>
                {e.readout_date && <div className="mt-1 text-slate-500">readout {e.readout_date}</div>}
                {e.observed_value !== null && <div className="mt-1">observed <b>{e.observed_value}</b>{e.observed_n ? ` (n=${e.observed_n})` : ''} → <span className={`rounded px-1 ${DECISION_STYLE[e.decision ?? 'change']}`}>{LABEL[e.decision ?? ''] ?? e.decision}</span></div>}
                <div className="mt-2 flex gap-1">
                  <select aria-label={`Status of experiment ${e.id}`} value={e.status} onChange={(ev) => setStatus(e, ev.target.value)} className="h-6 rounded border px-1">{['draft', 'planned', 'running', 'readout', 'scaled', 'changed', 'stopped'].map((s) => <option key={s}>{s}</option>)}</select>
                  <button data-testid={`readout-${e.id}`} onClick={() => setOpen(e)} className="rounded border px-1.5 hover:bg-slate-100">Record readout</button>
                </div>
              </div>))}</div></div>
        ))}
      </div>
      {open && <Readout exp={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Readout({ exp, onClose }: { exp: ExpRow; onClose: () => void }) {
  const router = useRouter();
  const [obs, setObs] = useState(exp.observed_value === null ? '' : String(exp.observed_value));
  const [n, setN] = useState(exp.observed_n === null ? '' : String(exp.observed_n));
  const [saved, setSaved] = useState<string | null>(null);
  const ev = obs === '' ? null : evaluateExperiment(exp, Number(obs), n === '' ? null : Number(n));
  const save = async () => {
    if (!ev) return;
    const r = await mutate('experiment', 'readout', { id: exp.id, observed_value: Number(obs), observed_n: n === '' ? null : Number(n), decision: ev.decision });
    if (r.ok) { setSaved(ev.decision); router.refresh(); }
  };
  const followUp = async () => {
    const r = await mutate('task', 'create', {
      title: `Follow up: ${exp.bet_id} ${exp.name} readout → ${LABEL[saved ?? ''] ?? saved}`, description: `Observed ${obs}${n ? ` (n=${n})` : ''} vs scale ${exp.scale_op} ${exp.scale_value}, stop ${exp.stop_op} ${exp.stop_value}. ${exp.change_rule ?? ''}`,
      bet_id: exp.bet_id, experiment_id: exp.id, owner_id: exp.owner_id, priority: saved === 'stop' ? 'p0' : 'p1', created_via: 'manual',
      evidence: [{ tool: 'experiment_readout', metric: exp.primary_kpi ?? 'kpi', value: `${obs}${n ? ` (n=${n})` : ''}` }],
    });
    if (r.ok) { onClose(); router.refresh(); }
  };
  return (
    <Modal title={`Readout: ${exp.bet_id} ${exp.name}`} onClose={onClose}>
      <p className="mb-2 text-xs text-slate-600">{exp.primary_kpi}</p>
      <p className="mb-3 text-xs"><span className="rounded bg-emerald-100 px-1 text-emerald-800">scale {exp.scale_op} {exp.scale_value}</span> <span className="rounded bg-red-100 px-1 text-red-800">stop {exp.stop_op} {exp.stop_value}</span> <span className="text-slate-500">{exp.change_rule}</span></p>
      <Field label={`Observed value (${exp.kpi_unit ?? ''})`}><input aria-label="observed value" type="number" step="any" className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
      <Field label={`Sample size n (min ${exp.min_sample ?? '—'})`}><input aria-label="observed n" type="number" className={inputCls} value={n} onChange={(e) => setN(e.target.value)} /></Field>
      {ev && <div className="mb-3 rounded border p-2 text-sm" data-testid="readout-decision">Decision: <span className={`rounded px-1.5 py-0.5 font-medium ${DECISION_STYLE[ev.decision]}`}>{LABEL[ev.decision]}</span>
        <ul className="mt-1 text-xs text-slate-600">{ev.reasons.map((r, i) => <li key={i}>{r.kind} {r.op} {r.threshold}: value {r.value} → {r.passed ? 'yes' : 'no'}</li>)}</ul></div>}
      {!saved ? <button data-testid="readout-save" disabled={!ev} onClick={save} className="w-full rounded bg-slate-900 py-1.5 text-sm text-white disabled:opacity-40">Save readout</button>
        : <button data-testid="readout-followup" onClick={followUp} className="w-full rounded border border-slate-900 py-1.5 text-sm">Create follow-up task</button>}
    </Modal>
  );
}
