import { z } from 'zod';
import { TOOL_NAMES, TOOLS, runTool } from './tools';
import { systemPrompt } from './systemPrompt';
import { deepseekFetch, modelName, type ToolLogEntry } from './agent';
import type { ToolEnv } from './env';

const Step = z.union([
  z.object({ tool: z.string(), args: z.record(z.any()).default({}) }),
  z.object({ final: z.string() }),
]);
export type JsonStep = z.infer<typeof Step>;

/** Extract + validate the model's JSON step. Tolerates ```json fences and surrounding prose. */
export function parseStep(text: string): JsonStep | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) return null;
  try { const r = Step.safeParse(JSON.parse(t.slice(a, b + 1))); return r.success ? r.data : null; } catch { return null; }
}

export function jsonToolInstructions() {
  const list = TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  return `\nTOOL PROTOCOL (JSON mode): respond with EXACTLY one JSON object and nothing else.\nTo call a tool: {"tool":"<name>","args":{...}}. To answer: {"final":"<markdown answer>"}.\nTools:\n${list}\nValid tool names: ${TOOL_NAMES.join(', ')}.`;
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
async function chat(messages: Msg[]): Promise<string> {
  const res = await deepseekFetch()(`${process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: modelName(), messages, temperature: 0.2, max_tokens: 1200, response_format: { type: 'json_object' } }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
  return ((await res.json()) as any).choices?.[0]?.message?.content ?? '';
}

/** Non-streaming tool loop. `history` = prior user/assistant turns as plain text. Retries once on parse failure. */
export async function runJsonLoop(env: ToolEnv, history: { role: 'user' | 'assistant'; content: string }[], log: ToolLogEntry[], maxSteps = 6, llm: (m: Msg[]) => Promise<string> = chat): Promise<string> {
  const msgs: Msg[] = [{ role: 'system', content: systemPrompt(env) + jsonToolInstructions() }, ...history];
  for (let i = 0; i < maxSteps; i++) {
    let step = parseStep(await llm(msgs));
    if (!step) { msgs.push({ role: 'user', content: 'Invalid format. Reply with exactly one JSON object: {"tool":..,"args":{..}} or {"final":".."}.' }); step = parseStep(await llm(msgs)); }
    if (!step) throw new Error('Model did not return valid JSON');
    if ('final' in step) return step.final;
    const t0 = Date.now();
    const output = await runTool(env, step.tool, step.args);
    log.push({ name: step.tool, args: step.args, output, ms: Date.now() - t0 });
    msgs.push({ role: 'assistant', content: JSON.stringify(step) }, { role: 'user', content: `TOOL RESULT ${step.tool}: ${JSON.stringify(output).slice(0, 12000)}` });
  }
  return 'I could not finish within the tool-step limit; please narrow the question.';
}
