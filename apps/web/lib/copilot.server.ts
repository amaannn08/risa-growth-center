import 'server-only';
import { createUIMessageStream, type UIMessageChunk } from 'ai';
import { hit, type Db } from '@gc/db';
import { campaignsMentioned, checkpointDates, runTool, type ToolEnv, type ToolLogEntry } from '@gc/ai';
import { addDays, fmtInr } from '@gc/core';

export const DAILY_CAP = Number(process.env.CHAT_DAILY_CAP ?? 1500);

/** Atomically RESERVE one slot of the daily provider budget before any provider call (durable, shared across instances). True = over the cap. */
export async function overDailyCap(db: Db) {
  return !(await hit(db, 'chat:daily', DAILY_CAP, 86_400)).allowed;
}

/** Call metadata plus [field, signed value, unit, scope, date, attribution] for each stored ref. */
export function compactEvidence(ce: any) {
  if (!ce || !Array.isArray(ce.refs)) return null;
  return { toolCallId: ce.toolCallId, tool: ce.tool, asOf: ce.asOf, revision: ce.revision, refs: ce.refs.slice(0, 200).map((r: any) => [r.metricField, r.signedValue, r.unit, r.scope, r.asOf, r.attribution]), truncated: ce.refs.length > 200 };
}

export async function logChat(db: Db, row: { conversation_id?: string; ip_hash: string; question: string; tool_calls: ToolLogEntry[]; answer: string; grounding: unknown; model: string; latency_ms: number; error?: string }) {
  try {
    await db.query(
      `INSERT INTO chat_logs(conversation_id, ip_hash, question, tool_calls, answer, grounding, model, latency_ms, error) VALUES ($1,$2,$3,$4::text::jsonb,$5,$6::text::jsonb,$7,$8,$9)`,
      [row.conversation_id ?? null, row.ip_hash, row.question.slice(0, 2000), JSON.stringify(row.tool_calls.map((t) => ({ name: t.name, args: t.args, ms: t.ms, error: t.output?.error?.code ?? null, evidence: compactEvidence(t.output?._evidence) }))), row.answer.slice(0, 8000), JSON.stringify(row.grounding), row.model, row.latency_ms, row.error ?? null],
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
        const toolCallId = t.output?._evidence?.toolCallId ?? `call_${i}_${t.name}`;
        w({ type: 'tool-input-available', toolCallId, toolName: t.name, input: t.args });
        w({ type: 'tool-output-available', toolCallId, output: t.output });
      });
      w({ type: 'text-start', id: 't1' }); w({ type: 'text-delta', id: 't1', delta: text }); w({ type: 'text-end', id: 't1' });
      w({ type: 'finish-step' }); w({ type: 'finish' });
    },
  });
}

/** An explicit close-to-close posting reconciliation can be answered directly from the pinned ledger. */
export async function reconcileLedgerPostings(env: ToolEnv, question: string, log: ToolLogEntry[]): Promise<string | null> {
  if (!/\bnet (?:marketing |posted )?spend\b/i.test(question)
    || !/\bevent[ -]close\b/i.test(question) || !/\bdata[ -]close\b/i.test(question)
    || !/\b(?:posting|postings|debit|debits)\b/i.test(question) || /\b(?:draft|create a task|what if)\b/i.test(question)) return null;
  const overall = /\b(?:overall|event-wide|all campaigns)\b/i.test(question);
  const campaigns = overall ? [] : campaignsMentioned(question);
  if (campaigns.length > 1) return null;
  const campaign_id = campaigns[0];
  const { event_close, data_close } = checkpointDates(env);
  if (event_close >= data_close) return null;
  const call = async (name: string, args: Record<string, unknown>) => {
    const start = Date.now();
    const output = await runTool(env, name, args);
    log.push({ name, args, output, ms: Date.now() - start });
    return output;
  };
  const event = await call('get_spend_ledger', { campaign_id, through: event_close });
  const close = await call('get_spend_ledger', { campaign_id, through: data_close });
  const interval = await call('get_spend_ledger', { campaign_id, from: addDays(event_close, 1), through: data_close });
  if (event.error || close.error || interval.error) return null;
  const cite = (o: typeof close) => `[get_spend_ledger · ${o.as_of} · r${o.data_revision}]`;
  const postings = [...interval.positive_postings, ...interval.credits].sort((a, b) => a.date.localeCompare(b.date));
  const subject = campaign_id ? `${env.ds.campaigns[campaign_id]?.campaign_name ?? campaign_id} net marketing spend` : 'Overall net marketing spend';
  const items = postings.map((p) => `- ${p.date} · ${p.campaign ?? 'Unattributed'} · ${p.activity_id} · ${fmtInr(p.amount)} ${cite(interval)}`);
  return `${subject} was **${fmtInr(event.net_spend_inr)}** at event close ${cite(event)} and **${fmtInr(close.net_spend_inr)}** at data close ${cite(close)}. The net change was **${fmtInr(interval.net_spend_inr)}** ${cite(interval)}.\n\n${items.length ? `Postings after event close through data close\n\n${items.join('\n')}` : 'The ledger has no spend postings between those closes.'}`;
}
