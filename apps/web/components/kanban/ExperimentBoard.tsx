'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { EXPERIMENT_GATES, adjudicateExperiment, parseGuardrails, unparsedGuardrails, validateObservation } from '@gc/core';
import { Field, Modal, inputCls } from '@/components/Modal';
import { mutate } from '@/lib/mutate';
import { DECISION_STYLE } from '@/lib/ui';

export interface ExpRow { id: number; bet_id: string | null; name: string; primary_kpi: string | null; kpi_unit: string | null; min_sample: number | null; scale_op: string | null; scale_value: number | null; stop_op: string | null; stop_value: number | null; change_rule: string | null; stop_note: string | null; readout_date: string | null; status: string; observed_value: number | null; observed_n: number | null; decision: string | null; owner_id: string | null; guardrails?: unknown; observation?: any }
const COLS = ['planned', 'running', 'readout', 'scaled', 'changed', 'stopped'] as const;
const LABEL: Record<string, string> = { scale: 'Scale', change: 'Change', stop: 'Stop', insufficient_sample: 'Insufficient evidence', release: 'Release reserve', hold: 'Hold reserve', scale_next_edition: 'Scale next edition', not_demonstrated: 'Lift not demonstrated', insufficient_evidence: 'Insufficient evidence' };

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
                {e.observation?.gates?.map((g: any) => <div key={g.key} className="mt-1" data-testid={`gate-${e.id}`}>{g.label}: <span className={`rounded px-1 ${DECISION_STYLE[g.decision] ?? ''}`}>{LABEL[g.decision] ?? g.decision}</span></div>)}
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
  const [numer, setNumer] = useState(''), [denom, setDenom] = useState('');
  const [gr, setGr] = useState<Record<string, string>>({}), [gi, setGi] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const guardrails = parseGuardrails(exp.guardrails);
  const gate = exp.bet_id ? EXPERIMENT_GATES[exp.bet_id] : undefined;
  const toNum = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : Number(v));
  const rec = (m: Record<string, string>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, toNum(v)]));
  // Same validator as the server transaction: counts win, a conflicting explicit KPI is an error.
  const input = { observed_value: toNum(obs), observed_n: toNum(n), kpi_numerator: toNum(numer), kpi_denominator: toNum(denom), guardrail_observations: rec(gr), gate_inputs: rec(gi) };
  const check = validateObservation(exp, input);
  // Preview only: the server re-adjudicates inside the write transaction and its decision is the one stored.
  const ev = adjudicateExperiment(exp, { ...input, observed_value: check.value });
  const unparsed = unparsedGuardrails(exp.guardrails);
  const save = async () => {
    if (check.errors.length) return;
    const r = await mutate('experiment', 'readout', { id: exp.id, observed_value: toNum(obs), observed_n: toNum(n), kpi_numerator: toNum(numer), kpi_denominator: toNum(denom), guardrail_observations: rec(gr), gate_inputs: rec(gi) });
    if (r.ok) { setSaved(String((r.row as any)?.decision ?? ev.decision)); router.refresh(); }
  };
  const followUp = async () => {
    const r = await mutate('task', 'create', {
      title: `Follow up: ${exp.bet_id} ${exp.name} readout → ${LABEL[saved ?? ''] ?? saved}`, description: `Observed ${obs}${n ? ` (n=${n})` : ''} vs scale ${exp.scale_op} ${exp.scale_value}, stop ${exp.stop_op} ${exp.stop_value}. ${exp.change_rule ?? ''}`,
      bet_id: exp.bet_id, experiment_id: exp.id, owner_id: exp.owner_id, priority: saved === 'stop' ? 'p0' : 'p1', created_via: 'manual',
      evidence: [{ tool: 'experiment_readout', metric: exp.primary_kpi ?? 'kpi', value: `${obs}${n ? ` (n=${n})` : ''}` }],
    });
    if (r.ok) { onClose(); router.refresh(); }
  };
  const missingAll = ev.missing.length > 0;
  return (
    <Modal title={`Readout: ${exp.bet_id} ${exp.name}`} onClose={onClose}>
      <p className="mb-2 text-xs text-slate-600">{exp.primary_kpi}</p>
      <p className="mb-3 text-xs"><span className="rounded bg-emerald-100 px-1 text-emerald-800">scale {exp.scale_op} {exp.scale_value}</span> <span className="rounded bg-red-100 px-1 text-red-800">stop {exp.stop_op} {exp.stop_value}</span> <span className="text-slate-500">{exp.change_rule}</span></p>
      <Field label={`Observed value (${exp.kpi_unit ?? ''})`}><input aria-label="observed value" type="number" step="any" className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="KPI numerator (optional)"><input aria-label="kpi numerator" type="number" step="any" className={inputCls} value={numer} onChange={(e) => setNumer(e.target.value)} /></Field>
        <Field label="KPI denominator (optional)"><input aria-label="kpi denominator" type="number" step="any" className={inputCls} value={denom} onChange={(e) => setDenom(e.target.value)} /></Field>
      </div>
      <Field label={`Sample size n (min ${exp.min_sample ?? '—'}) · required`}><input aria-label="observed n" type="number" className={inputCls} value={n} onChange={(e) => setN(e.target.value)} /></Field>
      {guardrails.length > 0 && <fieldset className="mb-2 rounded border p-2"><legend className="px-1 text-xs font-medium text-slate-600">Guardrail observations (required)</legend>
        {guardrails.map((g) => <Field key={g.key} label={`${g.label}${g.hard ? ' · breach stops the bet' : ''}`}><input aria-label={`guardrail ${g.key}`} type="number" step="any" className={inputCls} value={gr[g.key] ?? ''} onChange={(e) => setGr({ ...gr, [g.key]: e.target.value })} /></Field>)}</fieldset>}
      {gate && <fieldset className="mb-2 rounded border border-sky-200 bg-sky-50 p-2" data-testid="gate-box"><legend className="px-1 text-xs font-medium text-sky-800">Separate decision: {gate.label}</legend>
        <p className="mb-1 text-[11px] text-slate-600">{gate.note}</p>
        {gate.inputs.map((i) => <Field key={i.key} label={`${i.label} (${i.op} ${i.value} ${i.unit})`}><input aria-label={`gate ${i.key}`} type="number" step="any" className={inputCls} value={gi[i.key] ?? ''} onChange={(e) => setGi({ ...gi, [i.key]: e.target.value })} /></Field>)}
        {ev.gates.map((g) => <div key={g.key} className="text-xs" data-testid="gate-decision">Gate decision: <span className={`rounded px-1.5 py-0.5 font-medium ${DECISION_STYLE[g.decision] ?? ''}`}>{LABEL[g.decision] ?? g.decision}</span>{g.missing.length ? ` — missing: ${g.missing.join(', ')}` : ''}</div>)}</fieldset>}
      <div className="mb-3 rounded border p-2 text-sm" data-testid="readout-decision">Decision: <span className={`rounded px-1.5 py-0.5 font-medium ${DECISION_STYLE[ev.decision]}`}>{LABEL[ev.decision]}</span>
        {check.errors.length > 0 && <div className="mt-1 text-xs text-red-700" role="alert" data-testid="readout-invalid">{check.errors.join(' ')}</div>}
        {unparsed.length > 0 && <div className="mt-1 text-xs text-amber-700" data-testid="readout-unparsed">Unrecognised guardrail rule(s) cannot be checked: {unparsed.join('; ')}. Readout stays insufficient evidence.</div>}
        {missingAll && <div className="mt-1 text-xs text-amber-700" data-testid="readout-missing">Missing mandatory input: {ev.missing.join('; ')}. No Scale/Change/Stop is recorded without it.</div>}
        <ul className="mt-1 text-xs text-slate-600">{ev.reasons.filter((r) => r.kind !== 'missing').map((r, i) => <li key={i}>{r.label ?? r.kind} {r.op} {r.threshold}: value {r.value} → {r.passed ? 'yes' : 'no'}</li>)}</ul></div>
      {!saved ? <button data-testid="readout-save" onClick={save} disabled={check.errors.length > 0} className="w-full rounded bg-slate-900 py-1.5 text-sm text-white disabled:opacity-40">Save readout (decision is set by the server)</button>
        : <button data-testid="readout-followup" onClick={followUp} className="w-full rounded border border-slate-900 py-1.5 text-sm">Create follow-up task</button>}
    </Modal>
  );
}
