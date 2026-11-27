import { NextResponse } from 'next/server';
import { convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, type UIMessage } from 'ai';
import { getDb } from '@gc/db';
import { groundingCheck, makeEnv, modelName, runJsonLoop, runMock, runNative, type ChatContext, type ToolLogEntry } from '@gc/ai';
import { allow, clientKey } from '@/lib/rateLimit';
import { ipHash, logChat, overDailyCap, replayStream } from '@/lib/copilot.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const textOf = (m: UIMessage | undefined) => (m?.parts ?? []).map((p: any) => (p.type === 'text' ? p.text : '')).join('');
const friendly = (status: number, message: string, code: string) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(req: Request) {
  const t0 = Date.now();
  const ip = clientKey(req), hash = ipHash(ip);
  if (!allow(`chat:${hash}`, Number(process.env.CHAT_RATE_LIMIT ?? 20))) return friendly(429, 'You have reached the Copilot limit (20 questions per 10 minutes). Please wait a few minutes.', 'RATE_LIMITED');
  let body: { messages?: UIMessage[]; context?: ChatContext; conversationId?: string };
  try { body = await req.json(); } catch { return friendly(400, 'Invalid request body', 'BAD_REQUEST'); }
  const all = Array.isArray(body.messages) ? body.messages : [];
  if (!all.length) return friendly(400, 'No messages', 'BAD_REQUEST');
  const db = await getDb();
  if (await overDailyCap(db)) return friendly(429, 'The Copilot has reached its daily demo cap. The dashboard still works; try again tomorrow.', 'DAILY_CAP');

  // trim to the last 16 messages (tool parts live inside assistant messages, so results are kept); must start with a user turn
  let msgs = all.slice(-16);
  while (msgs.length && msgs[0]!.role !== 'user') msgs = msgs.slice(1);
  const question = textOf([...msgs].reverse().find((m) => m.role === 'user'));
  const mode = (process.env.COPILOT_MODE ?? 'native') as 'native' | 'json' | 'mock';
  const log: ToolLogEntry[] = [];
  const conv = body.conversationId;
  try {
    const env = await makeEnv(db, body.context ?? {}, conv); // one dataset revision pinned for the whole answer
    const finish = async (answer: string, error?: string) => {
      const priorOutputs = msgs.flatMap((m) => (m.parts ?? []).filter((p: any) => typeof p.type === 'string' && p.type.startsWith('tool-') && p.output).map((p: any) => p.output));
      const g = groundingCheck(answer, [...priorOutputs, ...log.map((l) => l.output)], msgs.filter((m) => m.role === 'user').map(textOf));
      await logChat(db, { conversation_id: conv, ip_hash: hash, question, tool_calls: log, answer, grounding: g, model: mode === 'mock' ? 'mock' : modelName(), latency_ms: Date.now() - t0, error });
    };
    if (mode === 'mock') {
      const text = await runMock(env, question, log);
      await finish(text);
      return createUIMessageStreamResponse({ stream: replayStream(text, log) });
    }
    if (mode === 'json') {
      const history = msgs.map((m) => ({ role: m.role as 'user' | 'assistant', content: textOf(m) })).filter((m) => m.content);
      const text = await runJsonLoop(env, history, log);
      await finish(text);
      return createUIMessageStreamResponse({ stream: replayStream(text, log) });
    }
    const modelMessages = await convertToModelMessages(msgs);
    const result = runNative(env, modelMessages, log, async (e: any) => { await finish(String(e?.text ?? '')); });
    return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
  } catch (e: any) {
    console.error('chat failed', e?.message);
    await logChat(db, { conversation_id: conv, ip_hash: hash, question, tool_calls: log, answer: '', grounding: null, model: modelName(), latency_ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 500) });
    return friendly(503, 'Copilot unavailable right now. The dashboard keeps working; please retry.', 'PROVIDER_ERROR');
  }
}
