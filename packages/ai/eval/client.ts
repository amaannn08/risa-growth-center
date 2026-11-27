/** Minimal /api/chat client for smoke + eval: sends UI messages, parses the SSE UI-message stream. */
export interface ToolCall { name: string; input: unknown; output?: any }
export interface Turn { text: string; tools: ToolCall[]; error?: string; ms: number; parts: any[] }

export async function ask(baseUrl: string, messages: any[], context: Record<string, unknown> = {}, conversationId = 'eval'): Promise<Turn> {
  const t0 = Date.now();
  let body: string;
  try {
    const res = await fetch(`${baseUrl}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, context, conversationId }) });
    if (!res.ok) return { text: '', tools: [], error: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}`, ms: Date.now() - t0, parts: [] };
    body = await res.text();
  } catch (e: any) { // transport failure (e.g. provider/connection dropped mid-stream): report as a retryable error instead of crashing the run
    return { text: '', tools: [], error: `HTTP 599 transport: ${String(e?.cause?.message ?? e?.message ?? e).slice(0, 120)}`, ms: Date.now() - t0, parts: [] };
  }
  let text = ''; const tools = new Map<string, ToolCall>(); let error: string | undefined;
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === '[DONE]') continue;
    let c: any; try { c = JSON.parse(raw); } catch { continue; }
    if (c.type === 'start-step') text = ''; // keep only the final step's text
    else if (c.type === 'text-delta') text += c.delta ?? '';
    else if (c.type === 'tool-input-available') tools.set(c.toolCallId, { name: c.toolName, input: c.input });
    else if (c.type === 'tool-output-available') { const t = tools.get(c.toolCallId); if (t) t.output = c.output; }
    else if (c.type === 'error') error = String(c.errorText ?? 'error');
  }
  const list = [...tools.entries()];
  const parts = [...list.map(([id, t]) => ({ type: `tool-${t.name}`, toolCallId: id, state: 'output-available', input: t.input, output: t.output })), { type: 'text', text }];
  return { text, tools: list.map(([, t]) => t), error, ms: Date.now() - t0, parts };
}

export const userMsg = (text: string, i = 0) => ({ id: `u${i}`, role: 'user', parts: [{ type: 'text', text }] });
export const assistantMsg = (turn: Turn, i = 0) => ({ id: `a${i}`, role: 'assistant', parts: turn.parts });
