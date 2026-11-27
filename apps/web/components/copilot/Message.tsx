'use client';
import { useState } from 'react';
import type { UIMessage } from 'ai';
import { finalAnswerText, groundingFromCalls, groundingLabel, type TurnCall } from '@gc/ai/src/grounding';
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
  // The answer is ONLY the text after the last tool call (finalAnswerText): interim narration is never shown, so what the user reads is exactly what is checked and scored.
  const text = m.role === 'user' ? parts.filter((p) => p.type === 'text').map((p) => p.text as string).filter((t) => t.trim()).join('\n\n') : finalAnswerText(parts);
  if (m.role === 'user') return <div className="ml-8 rounded-lg bg-slate-900 px-3 py-1.5 text-sm text-white">{text}</div>;
  const drafts = parts.filter((p) => isToolPart(p) && p.state === 'output-available' && p.output?.draft_id);
  const upto = history.slice(0, history.indexOf(m) + 1);
  // Badge and citations come from the SERVER-ISSUED evidence refs of the tool calls in THIS assistant turn only (never numeric overlap with earlier turns).
  // A tool part without a server-issued evidence block cannot support any figure or citation. User-typed numbers are scenario inputs, not evidence.
  const calls: TurnCall[] = parts.filter((p) => isToolPart(p) && p.output?._evidence).map((p) => p.output._evidence as TurnCall & { tool: string });
  const g = text ? groundingFromCalls(text, calls, upto.filter((x) => x.role === 'user').map((x) => ((x.parts ?? []) as any[]).map((p) => p.text ?? '').join(''))) : null;
  return (
    <div className="mr-4" data-testid="assistant-msg">
      {text && <div className="rounded-lg bg-slate-100 px-3 py-2"><Markdown text={text} unverified={g ? new Set(g.bad_citations) : undefined} /></div>}
      {drafts.length === 0 && /\bdraft\b[^.\n]{0,40}\b(?:ready|pending|created|prepared|saved)\b|\bI(?:'ve| have)? (?:drafted|created)\b/i.test(text) && <div data-testid="phantom-draft" className="mt-1 text-[11px] text-amber-700">⚠ No draft was created in this turn (no propose_task result). Nothing is waiting for your confirmation; ask again to get a real draft card.</div>}
      {drafts.map((p, i) => <DraftCard key={p.output.draft_id + i} out={p.output} />)}
      <Sources parts={parts} />
      {g && g.bindings.length > 0 && <details className="mt-0.5 text-[10px] text-slate-500" data-testid="bindings"><summary className="cursor-pointer">Claim bindings ({g.bindings.length})</summary>
        <ul className="mt-0.5 space-y-0.5">{g.bindings.slice(0, 20).map((b, i) => <li key={i}><b>{b.raw}</b> ← {b.tool} · call {b.callId ?? '—'} · {b.field || 'value'} · {b.unit} · tool value {b.signedValue.toLocaleString('en-US')} · scope {b.scope ?? 'n/a'} · as of {b.asOf ?? '—'} · r{b.revision ?? '—'}</li>)}</ul></details>}
      {g && (g.checked > 0 || g.bad_citations.length > 0 || g.claim_mismatches.length > 0) && <div data-testid="grounding" className={`mt-1 text-[11px] ${g.ok ? 'text-emerald-700' : 'text-amber-700'}`} title={g.ok ? '' : 'Figures not found in a tool result, or citations naming a tool that did not run in this turn'}>{groundingLabel(g)}</div>}
    </div>
  );
}
