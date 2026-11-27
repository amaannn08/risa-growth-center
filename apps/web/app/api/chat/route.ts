import { NextResponse } from 'next/server';
import { z } from 'zod';
import { convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, type UIMessage } from 'ai';
import { getDb } from '@gc/db';
import { clarifyingQuestion, executedFrom, groundingFromCalls, makeEnv, modelName, runJsonLoop, runMock, runNative, stripBadCitations, stripEvidence, type ToolLogEntry } from '@gc/ai';
import { allow, clientId } from '@/lib/rateLimit';
import { logChat, overDailyCap, reconcileLedgerPostings, replayStream } from '@/lib/copilot.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const textOf = (m: UIMessage | undefined) => (m?.parts ?? []).map((p: any) => (p.type === 'text' ? p.text : '')).join('');
const friendly = (status: number, message: string, code: string) => NextResponse.json({ error: { code, message } }, { status });

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d, 'not a calendar date');
const BodySchema = z.object({
  messages: z.array(z.object({ id: z.string().max(100).optional(), role: z.enum(['user', 'assistant']), parts: z.array(z.object({ type: z.string().max(80) }).passthrough()).max(60) }).passthrough()).min(1).max(100),
  context: z.object({
    page: z.string().max(40).optional(), asOf: isoDate.optional(), attribution: z.enum(['first_touch', 'registration_source', 'checkin_source']).optional(), campaignId: z.string().max(40).optional(),
    resolvedDrafts: z.array(z.object({ id: z.string().max(60), status: z.string().max(20), result_ref: z.string().max(80).optional() })).max(20).optional(),
  }).partial().optional().default({}),
  conversationId: z.string().max(100).optional(),
}).passthrough();

export async function POST(req: Request) {
  const t0 = Date.now();
  const hash = clientId(req);
  let raw: unknown;
  try { raw = await req.json(); } catch { return friendly(400, 'Invalid request body', 'BAD_REQUEST'); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return friendly(400, `Invalid request: ${parsed.error.issues[0]?.path.join('.') || 'body'} ${parsed.error.issues[0]?.message ?? ''}`.trim(), 'BAD_REQUEST');
  const body = parsed.data as { messages: UIMessage[]; context: Record<string, any>; conversationId?: string };
  const db = await getDb();
  const limit = Number(process.env.CHAT_RATE_LIMIT ?? 20);
  if (!(await allow(`chat:${hash}`, limit))) return friendly(429, `You have reached the Copilot limit (${limit} questions per 10 minutes). Please wait a few minutes.`, 'RATE_LIMITED');
  if (await overDailyCap(db)) return friendly(429, 'The Copilot has reached its daily demo cap. The dashboard still works; try again tomorrow.', 'DAILY_CAP');

  // trim to the last 16 messages (tool parts live inside assistant messages, so results are kept); must start with a user turn
  let msgs = body.messages.slice(-16);
  while (msgs.length && msgs[0]!.role !== 'user') msgs = msgs.slice(1);
  if (!msgs.length) return friendly(400, 'No user message', 'BAD_REQUEST');
  const question = textOf([...msgs].reverse().find((m) => m.role === 'user'));
  const mode = (process.env.COPILOT_MODE ?? 'native') as 'native' | 'json' | 'mock';
  const log: ToolLogEntry[] = [];
  const conv = body.conversationId;
  try {
    const env = await makeEnv(db, body.context, conv); // one dataset revision pinned for the whole answer
    const finish = async (answer: string, error?: string) => {
      // verified ONLY against the server's own call history for this turn (env.calls); nothing from the client transcript counts as evidence.
      // user-typed numbers are scenario inputs, not evidence
      const g = groundingFromCalls(answer, env.calls, msgs.filter((m) => m.role === 'user').map(textOf));
      await logChat(db, { conversation_id: conv, ip_hash: hash, question, tool_calls: log, answer, grounding: g, model: mode === 'mock' ? 'mock' : modelName(), latency_ms: Date.now() - t0, error });
    };
    const clarify = clarifyingQuestion(question, body.context, msgs.slice(0, msgs.map((m) => m.role).lastIndexOf('user')).map((m) => ({ role: m.role as 'user' | 'assistant', text: textOf(m) })));
    if (clarify) { await finish(clarify); return createUIMessageStreamResponse({ stream: replayStream(clarify, []) }); }
    const ledger = await reconcileLedgerPostings(env, question, log);
    if (ledger) { await finish(ledger); return createUIMessageStreamResponse({ stream: replayStream(ledger, log) }); }
    if (mode === 'mock') {
      const text = stripBadCitations(await runMock(env, question, log), executedFrom(log));
      await finish(text);
      return createUIMessageStreamResponse({ stream: replayStream(text, log) });
    }
    if (mode === 'json') {
      const history = msgs.map((m) => ({ role: m.role as 'user' | 'assistant', content: textOf(m) })).filter((m) => m.content);
      const text = stripBadCitations(await runJsonLoop(env, history, log), executedFrom(log));
      await finish(text);
      return createUIMessageStreamResponse({ stream: replayStream(text, log) });
    }
    const modelMessages = await convertToModelMessages(msgs.map((m) => ({ ...m, parts: (m.parts ?? []).map((p: any) => (p.output ? { ...p, output: stripEvidence(p.output) } : p)) })) as UIMessage[]);
    const result = runNative(env, modelMessages, log, async (e: any) => { await finish(String(e?.text ?? '')); });
    return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }), });
  } catch (e: any) {
    console.error('chat failed', e?.message);
    await logChat(db, { conversation_id: conv, ip_hash: hash, question, tool_calls: log, answer: '', grounding: null, model: modelName(), latency_ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 500) });
    return friendly(503, 'Copilot unavailable right now. The dashboard keeps working; please retry.', 'PROVIDER_ERROR');
  }
}
