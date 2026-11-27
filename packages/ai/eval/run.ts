/**
 * pnpm eval --base-url http://localhost:3000 [--mode native|json] [--only 1,2,3] [--out docs/eval-report.md]
 * Run ONLY against a local server or a Neon eval branch — it mutates data (setup items) and resets afterwards.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ask, assistantMsg, userMsg } from './client';
import { ITEMS } from './questions';
import { scoreAnswer } from './score';
import { groundingCheck } from '../src/grounding';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const base = arg('base-url', 'http://localhost:3000')!;
const mode = arg('mode', process.env.COPILOT_MODE ?? 'native');
const only = arg('only')?.split(',').map(Number);
const out = resolve(process.cwd(), arg('out', '../../docs/eval-report.md')!);

async function post(path: string, body: unknown) {
  const r = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}
const reset = () => post('/api/admin/reset', {});

interface Row { id: number; q: string; kind: string; pass: boolean; tools: string[]; missing: string[]; forbidden: string[]; grounding: string[]; ms: number; excerpt: string; err?: string; notes: string[] }
const rows: Row[] = [];
await reset();
for (const item of ITEMS.filter((i) => !only || only.includes(i.id))) {
  for (const s of item.setup ?? []) {
    let input = s.input;
    if (item.id === 27 && s.entity === 'checkin') input = { ...input, person_id: 'E-U1' };
    const r: any = await post(`/api/mutations/${s.entity}`, { action: s.action, ...input });
    if (!r.ok) console.log(`  setup failed for #${item.id}: ${JSON.stringify(r.error)}`);
  }
  const history: any[] = [];
  const outputs: unknown[] = [];
  const texts: string[] = [];
  let last = await (async () => {
    let t: Awaited<ReturnType<typeof ask>> | undefined;
    const turns = [...(item.before ?? []), item.q];
    for (const [i, q] of turns.entries()) {
      history.push(userMsg(q, i)); texts.push(q);
      t = await ask(base, history, item.context ?? {}, `eval-${item.id}`);
      for (const c of t.tools) outputs.push(c.output);
      history.push(assistantMsg(t, i));
    }
    return t!;
  })();
  // one retry on provider hiccups
  if (last.error && /HTTP 5|unavailable/i.test(last.error)) { history.splice(-1, 1); last = await ask(base, history, item.context ?? {}, `eval-${item.id}`); for (const c of last.tools) outputs.push(c.output); }
  const g = groundingCheck(last.text, outputs, texts);
  const toolsCalled = last.tools.map((t) => t.name);
  const draftCreated = last.tools.some((t) => t.name === 'propose_task' && t.output?.draft_id);
  const s = scoreAnswer(item, last.text, toolsCalled, g, draftCreated);
  rows.push({ id: item.id, q: item.q, kind: item.kind ?? 'normal', pass: s.pass && !last.error, tools: toolsCalled, missing: s.missing, forbidden: s.forbidden, grounding: g.unmatched, ms: last.ms, excerpt: last.text.replace(/\s+/g, ' ').slice(0, 260), err: last.error, notes: s.notes });
  console.log(`#${item.id} ${s.pass && !last.error ? 'PASS' : 'FAIL'}  ${toolsCalled.join(',')}  ${s.missing.length ? 'missing: ' + s.missing.join(' | ') : ''} ${g.unmatched.length ? 'ungrounded: ' + g.unmatched.join(',') : ''} ${last.error ?? ''}`);
  if (item.setup?.length) await reset();
}
await reset();

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 1000) / 10}%` : '—');
const passed = rows.filter((r) => r.pass).length;
const grp = (k: string) => rows.filter((r) => r.kind === k);
const md = `# Copilot eval report

- Run: ${new Date().toISOString()} · mode \`${mode}\` · model \`${process.env.DEEPSEEK_MODEL ?? 'deepseek-flash'}\` · target ${base.replace(/\/\/.*@/, '//')}
- **Overall: ${passed}/${rows.length} (${pct(passed, rows.length)})** · refusals ${grp('refusal').filter((r) => r.pass).length}/${grp('refusal').length} · drafts ${grp('draft').filter((r) => r.pass).length}/${grp('draft').length}
- Scoring per item: any-expected-tool called · every \`must\` figure/phrase present (numbers matched numerically at the expected precision) · no \`mustNot\` · **grounding: 0 untraced figures** · refusals must name the missing data and invent no number · drafts must call \`propose_task\` and never claim creation.
- Deterministic ground truth (no LLM) for all 34 items lives in \`packages/ai/test/tools.test.ts\`.

| # | Pass | Question | Tools called | Notes |
|---|---|---|---|---|
${rows.map((r) => `| ${r.id} | ${r.pass ? '✅' : '❌'} | ${r.q.replace(/\|/g, '/')} | ${r.tools.join(', ') || '—'} | ${[r.missing.length ? `missing: ${r.missing.join('; ')}` : '', r.forbidden.length ? `forbidden: ${r.forbidden.join('; ')}` : '', r.grounding.length ? `untraced: ${r.grounding.join(', ')}` : '', r.err ?? '', ...r.notes].filter(Boolean).join(' · ').replace(/\|/g, '/')} |`).join('\n')}

## Transcript excerpts

${rows.map((r) => `**#${r.id}** ${r.q}\n> ${r.excerpt}…  \n> _${r.tools.join(' → ') || 'no tools'} · ${r.ms} ms_\n`).join('\n')}
`;
writeFileSync(out, md);
console.log(`\nOverall ${passed}/${rows.length} (${pct(passed, rows.length)}) · refusals ${grp('refusal').filter((r) => r.pass).length}/${grp('refusal').length} · drafts ${grp('draft').filter((r) => r.pass).length}/${grp('draft').length} → ${out}`);
process.exit(passed / rows.length >= 0.85 ? 0 : 1);
