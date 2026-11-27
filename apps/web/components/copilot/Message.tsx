'use client';
import { useState } from 'react';
import type { UIMessage } from 'ai';
import { executedFrom, groundingCheck, groundingLabel } from '@gc/ai/src/grounding';
import { Markdown } from './Markdown';
import { DraftCard } from './DraftCard';

const isToolPart = (p: any) => typeof p?.type === 'string' && (p.type.startsWith('tool-') || p.type === 'dynamic-tool');
const toolName = (p: any) => (p.type === 'dynamic-tool' ? p.toolName : String(p.type).slice(5));

function MiniTable({ out }: { out: any }) {
  if (!out || typeof out !== 'object') return null;
  const rows: [string, string][] = [];
  const walk = (o: any, prefix: string, depth: number) => {
    for (const [k, v] of Object.entries(o)) {
      if (['tool', 'units', 'data_revision', 'as_of', 'attribution'].includes(k) && depth === 0) continue;
      if (v === null || v === undefined) continue;
      if (typeof v === 'object' && !Array.isArray(v) && depth < 2) walk(v, `${prefix}${k}.`, depth + 1);
      else if (Array.isArray(v)) rows.push([prefix + k, `${v.length} item${v.length === 1 ? '' : 's'}${typeof v[0] !== 'object' ? ': ' + v.slice(0, 4).join(', ') : ''}`]);
      else rows.push([prefix + k, typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-US') : String(Math.round(v * 10000) / 10000)) : String(v).slice(0, 80)]);
    }
  };
  if (out.error) rows.push(['error', `${out.error.code}: ${out.error.message}`]); else walk(out, '', 0);
  return <table className="mt-1 w-full text-[11px] tabular-nums"><tbody>{rows.slice(0, 14).map(([k, v], i) => <tr key={i} className="border-t"><td className="py-0.5 pr-2 text-slate-500">{k}</td><td className="py-0.5">{v}</td></tr>)}</tbody></table>;
}

export function Sources({ parts }: { parts: any[] }) {
  const [open, setOpen] = useState(false);
  const tools = parts.filter(isToolPart);
  if (!tools.length) return null;
  return (
    <div className="mt-1 text-xs" data-testid="sources">
      <button onClick={() => setOpen(!open)} className="text-slate-500 underline-offset-2 hover:underline">{open ? '▾' : '▸'} Sources ({tools.length} tool call{tools.length === 1 ? '' : 's'})</button>
      {open && <div className="mt-1 space-y-1.5">{tools.map((p, i) => (
        <div key={i} className="rounded border bg-slate-50 p-1.5">
          <div className="font-mono text-[11px]"><b>{toolName(p)}</b>({p.input ? JSON.stringify(p.input) : ''})</div>
          {p.output && <div className="text-[10px] text-slate-500">as_of {p.output.as_of ?? '—'} · rev {p.output.data_revision ?? '—'}{p.output.attribution ? ` · ${p.output.attribution}` : ''}</div>}
          <MiniTable out={p.output} />
        </div>))}</div>}
    </div>
  );
}

export function MessageView({ m, history }: { m: UIMessage; history: UIMessage[] }) {
  const parts = (m.parts ?? []) as any[];
  const text = parts.filter((p) => p.type === 'text').map((p) => p.text as string).filter((t) => t.trim()).join('\n\n');
  if (m.role === 'user') return <div className="ml-8 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">{text}</div>;
  const drafts = parts.filter((p) => isToolPart(p) && p.state === 'output-available' && p.output?.draft_id);
  const upto = history.slice(0, history.indexOf(m) + 1);
  const outputs = upto.flatMap((x) => ((x.parts ?? []) as any[]).filter((p) => isToolPart(p) && p.output).map((p) => p.output));
  // citations may only reference tools executed in THIS assistant turn (this message); user-typed numbers are scenario inputs, not evidence
  const executed = executedFrom(parts.filter((p) => isToolPart(p) && p.output).map((p) => ({ name: toolName(p), output: p.output })));
  const g = text ? groundingCheck(text, outputs, upto.filter((x) => x.role === 'user').map((x) => ((x.parts ?? []) as any[]).map((p) => p.text ?? '').join('')), executed) : null;
  return (
    <div className="mr-4" data-testid="assistant-msg">
      {text && <div className="rounded-lg bg-slate-100 px-3 py-2"><Markdown text={text} /></div>}
      {drafts.map((p, i) => <DraftCard key={p.output.draft_id + i} out={p.output} />)}
      <Sources parts={parts} />
      {g && (g.checked > 0 || g.bad_citations.length > 0) && <div data-testid="grounding" className={`mt-1 text-[11px] ${g.ok ? 'text-emerald-700' : 'text-amber-700'}`} title={g.ok ? '' : 'Figures not found in a tool result, or citations naming a tool that did not run in this turn'}>{groundingLabel(g)}</div>}
    </div>
  );
}
