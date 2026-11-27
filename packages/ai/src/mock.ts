import type { ToolLogEntry } from './agent';
import { runTool } from './tools';
import type { ToolEnv } from './env';

/** COPILOT_MODE=mock: fixed tool-call script (never hits DeepSeek) so e2e is deterministic. */
export async function runMock(env: ToolEnv, lastUserText: string, log: ToolLogEntry[]): Promise<string> {
  const call = async (name: string, args: Record<string, unknown>) => { const output = await runTool(env, name, args); log.push({ name, args, output, ms: 0 }); return output; };
  const t = lastUserText.toLowerCase();
  if (/task|draft|create/.test(t)) {
    const f = await call('get_funnel', { checkpoint: 'day_1' });
    const evidence = ['registered_and_attended', 'registered'].map((metric) => ({
      tool: f.tool, call_id: f._evidence.toolCallId, field: `people.${metric}`, metric, value: f.people[metric], as_of: f.as_of, attribution: f.attribution,
    }));
    const d = await call('propose_task', { title: 'Mock: reconfirmation reminder for confirmed registrants', priority: 'p1', owner_id: 'Aman', due_date: '2026-01-20', evidence });
    return `I drafted a task for you to review — nothing is created until you click **Confirm**. (${d.preview})`;
  }
  if (/stale|unverified/.test(t)) {
    // e2e: cites a calculator that never ran this turn (the review's Q3 shape) next to a valid funnel citation
    const f = await call('get_funnel', {});
    return `**${f.people.visitors_unique_verified.toLocaleString('en-US')}** verified visitors [get_funnel · ${f.as_of} · r${f.data_revision}]; recomputed rate [calculate · r${f.data_revision}].`;
  }
  const f = await call('get_funnel', {});
  return `**${f.people.visitors_unique_verified.toLocaleString('en-US')}** unique verified visitors and **${f.people.registered.toLocaleString('en-US')}** registered [get_funnel · ${f.as_of} · r${f.data_revision}].`;
}
