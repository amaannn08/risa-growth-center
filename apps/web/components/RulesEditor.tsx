'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mutate } from '@/lib/mutate';
import { td, th } from './kit';

interface Rule { mode: string; metric: string; scale_op: string; scale_value: number; stop_op: string; stop_value: number; min_registered: number }
const OPS = ['>=', '>', '<=', '<'];

export function RulesEditor({ rules }: { rules: Rule[] }) {
  const router = useRouter();
  const [rs, setRs] = useState(rules);
  const upd = (i: number, patch: Partial<Rule>) => setRs(rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = async (r: Rule) => { const x = await mutate('decision_rule', 'upsert', { ...r }); if (x.ok) router.refresh(); };
  return (
    <table className="w-full" data-testid="rules-table"><thead><tr><th className={th}>Mode</th><th className={th}>Metric</th><th className={th}>Scale if</th><th className={th}>Stop if</th><th className={th}>Min regs</th><th className={th} /></tr></thead>
      <tbody>{rs.map((r, i) => (
        <tr key={`${r.mode}${r.metric}`} className="border-t">
          <td className={td}>{r.mode.replace('_', '-')}</td><td className={td}>{r.metric}</td>
          <td className={td}><select aria-label="scale op" value={r.scale_op} onChange={(e) => upd(i, { scale_op: e.target.value })} className="h-6 rounded border">{OPS.map((o) => <option key={o}>{o}</option>)}</select> <input aria-label={`${r.metric} scale`} type="number" step="any" value={r.scale_value} onChange={(e) => upd(i, { scale_value: Number(e.target.value) })} className="h-6 w-20 rounded border px-1 text-right" /></td>
          <td className={td}><select aria-label="stop op" value={r.stop_op} onChange={(e) => upd(i, { stop_op: e.target.value })} className="h-6 rounded border">{OPS.map((o) => <option key={o}>{o}</option>)}</select> <input aria-label={`${r.metric} stop`} type="number" step="any" value={r.stop_value} onChange={(e) => upd(i, { stop_value: Number(e.target.value) })} className="h-6 w-20 rounded border px-1 text-right" /></td>
          <td className={td}><input aria-label="min registered" type="number" value={r.min_registered} onChange={(e) => upd(i, { min_registered: Number(e.target.value) })} className="h-6 w-16 rounded border px-1 text-right" /></td>
          <td className={td}><button onClick={() => save(r)} className="rounded border px-2 py-0.5 text-xs hover:bg-slate-100">Save</button></td></tr>))}</tbody></table>
  );
}
