import 'server-only';
import { createUIMessageStream, type UIMessageChunk } from 'ai';
import { hit, type Db } from '@gc/db';
import type { ToolLogEntry } from '@gc/ai';

export const DAILY_CAP = Number(process.env.CHAT_DAILY_CAP ?? 1500);

/** Atomically RESERVE one slot of the daily provider budget before any provider call (durable, shared across instances). True = over the cap. */
export async function overDailyCap(db: Db) {
  return !(await hit(db, 'chat:daily', DAILY_CAP, 86_400)).allowed;
}

export async function logChat(db: Db, row: { conversation_id?: string; ip_hash: string; question: string; tool_calls: ToolLogEntry[]; answer: string; grounding: unknown; model: string; latency_ms: number; error?: string }) {
  try {
    await db.query(
      `INSERT INTO chat_logs(conversation_id, ip_hash, question, tool_calls, answer, grounding, model, latency_ms, error) VALUES ($1,$2,$3,$4::text::jsonb,$5,$6::text::jsonb,$7,$8,$9)`,
      [row.conversation_id ?? null, row.ip_hash, row.question.slice(0, 2000), JSON.stringify(row.tool_calls.map((t) => ({ name: t.name, args: t.args, ms: t.ms, error: t.output?.error?.code ?? null }))), row.answer.slice(0, 8000), JSON.stringify(row.grounding), row.model, row.latency_ms, row.error ?? null],
    );
  } catch (e) { console.error('chat_logs insert failed', (e as Error).message); }
}

/** Non-streaming modes (json / mock): replay tool calls + final text as a UI message stream. */
export function replayStream(text: string, log: ToolLogEntry[]) {
  return createUIMessageStream({
    execute: ({ writer }) => {
      const w = (c: unknown) => writer.write(c as UIMessageChunk);
      w({ type: 'start' }); w({ type: 'start-step' });
      log.forEach((t, i) => {
        const toolCallId = `call_${i}_${t.name}`;
        w({ type: 'tool-input-available', toolCallId, toolName: t.name, input: t.args });
        w({ type: 'tool-output-available', toolCallId, output: t.output });
      });
      w({ type: 'text-start', id: 't1' }); w({ type: 'text-delta', id: 't1', delta: text }); w({ type: 'text-end', id: 't1' });
      w({ type: 'finish-step' }); w({ type: 'finish' });
    },
  });
}
