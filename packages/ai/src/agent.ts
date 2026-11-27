import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { isStepCount, streamText, tool, type ModelMessage } from 'ai';
import { TOOLS, runTool } from './tools';
import { stripEvidence } from './evidence';
import { systemPrompt } from './systemPrompt';
import type { ToolEnv } from './env';

export interface ToolLogEntry { name: string; args: unknown; output: any; ms: number }

const BASE_URL = () => process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
export const modelName = () => process.env.DEEPSEEK_MODEL ?? 'deepseek-flash';

/** fetch wrapper: disables DeepSeek "thinking" (avoids reasoning_content round-trips) and falls back to deepseek-chat on model errors. */
export function deepseekFetch(): typeof fetch {
  return (async (url: any, init?: any) => {
    let body: any = init?.body;
    try { if (typeof body === 'string') { const j = JSON.parse(body); if (process.env.DEEPSEEK_THINKING !== 'enabled') j.thinking = { type: 'disabled' }; body = JSON.stringify(j); } } catch { /* leave body */ }
    const res = await fetch(url, { ...init, body });
    if ((res.status === 400 || res.status === 404) && typeof body === 'string') {
      const txt = await res.clone().text();
      if (/model/i.test(txt) && !/deepseek-chat/.test(body)) {
        const j = JSON.parse(body); j.model = 'deepseek-chat';
        return fetch(url, { ...init, body: JSON.stringify(j) });
      }
    }
    return res;
  }) as typeof fetch;
}

export function deepseekModel() {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set');
  const provider = createOpenAICompatible({ name: 'deepseek', baseURL: BASE_URL(), apiKey: key, fetch: deepseekFetch() });
  return provider.chatModel(modelName());
}

export function aiTools(env: ToolEnv, log: ToolLogEntry[]) {
  return Object.fromEntries(TOOLS.map((t) => [t.name, tool({
    description: t.description, inputSchema: t.schema,
    execute: async (args: any, opts?: { toolCallId?: string }) => { const t0 = Date.now(); const output = await runTool(env, t.name, args, opts?.toolCallId); log.push({ name: t.name, args, output, ms: Date.now() - t0 }); return output; },
    // the client/UI gets the server-issued evidence refs; the model only sees the plain tool result
    toModelOutput: ({ output }: any) => ({ type: 'json', value: stripEvidence(output) }),
  })]));
}

/** Native tool-calling run (streaming). `messages` are model messages (already converted and trimmed). */
export function runNative(env: ToolEnv, messages: ModelMessage[], log: ToolLogEntry[], onEnd?: (e: any) => void | Promise<void>) {
  return streamText({
    model: deepseekModel(), instructions: systemPrompt(env), messages, tools: aiTools(env, log) as any,
    stopWhen: isStepCount(6), temperature: 0.1, maxOutputTokens: 1200, onEnd,
  } as any);
}
