'use client';
import { useChat } from '@ai-sdk/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getChat, ctxStore, newConversation } from './chatStore';
import { MessageView } from './Message';

const PROMPTS: Record<string, string[]> = {
  overview: ['Why did we miss the visitor target?', "What's the registered show-up rate? Is 2,050/2,800 right?", 'What is the next-edition plan and how confident are we?'],
  campaigns: ['Which campaign has the lowest cost per visitor?', 'Does College Partnerships really beat Creator Partners?', 'What if we move ₹10k from Paid Social to College Partnerships?'],
  diagnose: ['Where is the biggest bottleneck?', 'What happened to Paid Social in early March?', 'Why do 3,390 check-in rows give only 2,050 visitors?'],
  strategy: ['What are the stop thresholds for the referral experiment?', "What's the downside case for 2,400?", 'What attendance will we get if we double paid budget next year?'],
  execution: ['What tasks are open for Paid Social?', 'Draft a group-pass pilot task for Meera due 2026-01-20'],
  data: ['Total spend at data close and Paid Social’s cost per visitor?', 'How many attended without registering?'],
  copilot: ['Why did we miss the visitor target?', 'And how did creators compare?', 'What if we move ₹10k from Paid Social to College Partnerships?', 'Which campaign actually caused more attendance?'],
};

export function usePageContext() {
  const path = usePathname(), sp = useSearchParams();
  const seg = path.split('/')[1] || 'overview';
  const campaignId = path.startsWith('/campaigns/') ? path.split('/')[2] : undefined;
  ctxStore.ctx = { page: seg, asOf: sp.get('asOf') ?? undefined, attribution: sp.get('attr') ?? undefined, campaignId };
  return ctxStore.ctx;
}

export function ChatView({ compact = false }: { compact?: boolean }) {
  const ctx = usePageContext();
  const chat = getChat();
  const { messages, sendMessage, status, error, regenerate, clearError } = useChat({ chat });
  const [input, setInput] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [messages, status]);
  const busy = status === 'submitted' || status === 'streaming';
  const send = (t: string) => { if (!t.trim() || busy) return; clearError(); sendMessage({ text: t.trim() }); setInput(''); };
  const prompts = PROMPTS[ctx.page] ?? PROMPTS.overview!;
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="copilot-chat">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <div className="space-y-2 text-sm text-slate-600">
            <p>Ask about the 2025 data, the plan or the board. Every figure is traced to a tool call; actions are drafts you confirm.</p>
            <div className="flex flex-wrap gap-1.5">{prompts.map((p) => <button key={p} onClick={() => send(p)} className="rounded-full border px-2.5 py-1 text-left text-xs hover:bg-slate-100">{p}</button>)}</div>
          </div>
        )}
        {messages.map((m) => <MessageView key={m.id} m={m} history={messages} />)}
        {busy && <div className="text-xs text-slate-500" data-testid="thinking">Analysing…</div>}
        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800" role="alert" data-testid="copilot-error">
            Copilot unavailable — {/limit|cap/i.test(error.message) ? 'rate limit reached, try again in a few minutes.' : 'the dashboard keeps working.'}
            <button onClick={() => regenerate()} className="ml-2 underline">Retry</button>
          </div>
        )}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="border-t p-2">
        {messages.length > 0 && !compact && <div className="mb-1 flex flex-wrap gap-1">{prompts.slice(0, 3).map((p) => <button type="button" key={p} onClick={() => send(p)} className="rounded-full border px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100">{p}</button>)}</div>}
        <div className="flex gap-1.5">
          <input aria-label="Ask the Copilot" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Ask about ${ctx.asOf ?? 'the data'}…`} className="h-8 min-w-0 flex-1 rounded border px-2 text-sm" disabled={busy} />
          <button type="submit" disabled={busy || !input.trim()} className="rounded bg-slate-900 px-3 text-sm text-white disabled:opacity-40">Send</button>
          {messages.length > 0 && <button type="button" onClick={() => { newConversation(); location.reload(); }} className="rounded border px-2 text-xs" title="New conversation">New</button>}
        </div>
      </form>
    </div>
  );
}
