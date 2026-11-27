/** pnpm --filter @gc/ai smoke  (BASE_URL default http://localhost:3000). Asks Q1, Q9→Q10, Q16 and prints tool calls. Exit 1 if <3 of 4 call tools. */
import { ask, assistantMsg, userMsg } from './client';

const base = process.env.BASE_URL ?? process.argv[2] ?? 'http://localhost:3000';
const Q9 = "What's the registered show-up rate? Is 2,050/2,800 right?";
const runs: { label: string; msgs: string[] }[] = [
  { label: 'Q1', msgs: ["What's our funnel as of data close?"] },
  { label: 'Q9→Q10', msgs: [Q9, 'And for Paid Social?'] },
  { label: 'Q16', msgs: ["What's our unique reach?"] },
];
let withTools = 0, total = 0;
for (const r of runs) {
  const history: any[] = [];
  let last: Awaited<ReturnType<typeof ask>> | undefined;
  for (const [i, m] of r.msgs.entries()) {
    history.push(userMsg(m, i));
    last = await ask(base, history, {}, `smoke-${r.label}`);
    console.log(`\n[${r.label}] "${m}" (${last.ms} ms)${last.error ? ` ERROR ${last.error}` : ''}`);
    for (const t of last.tools) console.log(`   tool ${t.name}(${JSON.stringify(t.input)}) → ${t.output?.error ? 'ERR ' + t.output.error.code : 'ok'}`);
    console.log('   answer:', last.text.replace(/\n/g, ' ').slice(0, 300));
    history.push(assistantMsg(last, i));
    total++; if (last.tools.length) withTools++;
  }
}
console.log(`\nnative tool calls in ${withTools}/${total} turns`);
process.exit(withTools >= total - 1 ? 0 : 1);
