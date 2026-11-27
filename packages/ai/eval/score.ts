import { extractNumbers, figureMatches } from '../src/grounding';
import type { EvalItem } from './questions';

const NUM_TOKEN = /^[₹−-]?\d[\d,]*(\.\d+)?%?$/;

/** Does `text` satisfy one expectation? Numbers → numeric match (tolerance by decimals); /re/i → regex; else substring (case-insens.). */
export function matches(text0: string, expectation: string): boolean {
  const text = text0.replace(/\*\*|__|`/g, ''); // markdown emphasis must not break a phrase match ("were **not** changed")
  if (expectation.startsWith('/')) {
    const i = expectation.lastIndexOf('/');
    return new RegExp(expectation.slice(1, i), expectation.slice(i + 1) || 'i').test(text);
  }
  if (expectation.includes('|') && !NUM_TOKEN.test(expectation)) return expectation.split('|').some((e) => matches(text, e));
  if (NUM_TOKEN.test(expectation)) {
    const e = extractNumbers(expectation, { keepSmallInts: true })[0];
    if (!e) return false;
    const have = extractNumbers(text, { keepSmallInts: true });
    // numbers inside ids/dates are stripped by extractNumbers; also scan raw numbers for small ints (e.g. "10" in "<10%")
    const raw = [...text.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((m) => ({ value: Number(m[0].replace(/,/g, '')), dp: (m[0].split('.')[1] ?? '').length }));
    return [...have, ...raw].some((h) => figureMatches(h.value, Math.min(h.dp, e.dp), e.value) || figureMatches(e.value, Math.min(h.dp, e.dp), h.value));
  }
  return text.toLowerCase().includes(expectation.toLowerCase());
}

export interface Score { pass: boolean; missing: string[]; forbidden: string[]; toolOk: boolean; groundingUnmatched: string[]; notes: string[] }

export function scoreAnswer(item: EvalItem, answer: string, toolsCalled: string[], grounding: { unmatched: string[]; claim_mismatches?: { raw: string; reason: string }[] } | null, draftCreated = false): Score {
  const missing = item.must.filter((m) => !matches(answer, m));
  const forbidden = (item.mustNot ?? []).filter((m) => matches(answer, m));
  const toolOk = item.noTools ? toolsCalled.length === 0 : item.tools.some((t) => toolsCalled.includes(t));
  const notes: string[] = [];
  if (item.kind === 'draft' && !toolsCalled.includes('propose_task')) notes.push('no propose_task call');
  if (item.kind === 'draft' && !draftCreated) notes.push('draft not recorded');
  const g = [...(grounding?.unmatched ?? []), ...((grounding as { bad_citations?: string[] } | null)?.bad_citations ?? []), ...(grounding?.claim_mismatches ?? []).map((m) => `${m.raw} (${m.reason})`)];
  const pass = missing.length === 0 && forbidden.length === 0 && toolOk && g.length === 0 && (item.kind !== 'draft' || (toolsCalled.includes('propose_task') && draftCreated));
  return { pass, missing, forbidden, toolOk, groundingUnmatched: g, notes };
}
