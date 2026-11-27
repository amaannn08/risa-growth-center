/**
 * Grounding check: every figure in the final answer should be traceable to a tool result in the conversation
 * (or the user's own message). Unmatched numbers are reported, not blocked.
 */
export interface NumTok { raw: string; value: number; dp: number; pct?: boolean }
export interface GroundingResult {
  checked: number; unmatched: string[]; /** figures equal to the sum/difference of two traced figures (allowed, reported separately) */ derived: string[];
  /** figures that appear only in the user's own message: scenario inputs, never evidence */ user_inputs: string[];
  /** citations `[tool · as_of · rN]` naming a tool that did not run in this turn (or with a different revision/date) */ bad_citations: string[];
  ok: boolean;
}
export interface ExecutedTool { name: string; as_of?: string | null; data_revision?: number | null }

const MONTHS = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*';

/** Strip things that look numeric but are not figures: citations, dates, ids, T−14 style offsets, list ordinals, years. */
export function stripNonFigures(text: string): string {
  return text
    .replace(/\[[^\]]*·[^\]]*\]/g, ' ')                 // [tool · as_of · rev]
    .replace(/\(?\brev(?:ision)?\s*r?\d+\)?/gi, ' ')    // rev 12 / r7
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')              // ISO dates
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')       // times
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTHS}\\b`, 'gi'), ' ') // 9 Mar
    .replace(new RegExp(`\\b${MONTHS}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'gi'), ' ') // Mar 9
    .replace(/\b[A-Za-z]{1,4}[-−–]?\d+[A-Za-z]?\b/g, ' ') // C02, R0001, E0001, B1, T−14, CHK00012, P0
    .replace(/^\s*\d+[.)]\s/gm, ' ')                      // 1. list ordinals
    .replace(/\b(?:19|20)\d{2}\b(?!,\d)/g, ' ');          // years
}

export function extractNumbers(text: string, opts: { keepSmallInts?: boolean } = {}): NumTok[] {
  const s = stripNonFigures(text);
  const out: NumTok[] = [];
  const re = /(?<![\w.])([-−+]?)(₹|Rs\.?\s?)?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|k\b|K\b|M\b|pp\b|x\b)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const intPart = m[3]!.replace(/,/g, '');
    const frac = m[4] ?? '';
    let value = Number(intPart + frac);
    const suffix = m[5];
    if (suffix === 'k' || suffix === 'K') value *= 1000;
    else if (suffix === 'M') value *= 1_000_000;
    if (m[1] === '-' || m[1] === '−') value = -value;
    const dp = suffix === 'k' || suffix === 'K' || suffix === 'M' ? 0 : frac ? frac.length - 1 : 0;
    // plain small integers (counts of items, "top 3", "2 weeks") are not data figures
    const plainSmall = !m[2] && !suffix && !frac && Math.abs(value) <= 10;
    if (plainSmall && !opts.keepSmallInts) continue;
    out.push({ raw: m[0].trim(), value, dp, pct: suffix === '%' });
  }
  return out;
}

function collectNumbers(x: unknown, into: number[]) {
  if (typeof x === 'number') { if (Number.isFinite(x)) into.push(x); }
  else if (typeof x === 'string') { for (const t of extractNumbers(x, { keepSmallInts: true })) into.push(t.value); for (const t of x.matchAll(/-?\d+(?:\.\d+)?/g)) into.push(Number(t[0])); }
  else if (Array.isArray(x)) for (const v of x) collectNumbers(v, into);
  else if (x && typeof x === 'object') for (const v of Object.values(x)) collectNumbers(v, into);
}

/** Build the set of allowed figures from tool outputs (+ user text): raw, rounded, and ×100 for fractions. */
export function allowedFrom(sources: unknown[], extraText: string[] = []): number[] {
  const nums: number[] = [];
  for (const s of sources) collectNumbers(s, nums);
  for (const t of extraText) collectNumbers(t, nums);
  const set = new Set<number>();
  for (const n of nums) {
    set.add(n); set.add(Math.abs(n)); set.add(Math.round(n));
    if (Math.abs(n) <= 10) for (const k of [0, 1, 2]) set.add(Number((n * 100).toFixed(k)));
    if (Math.abs(n) <= 1000 && n !== Math.round(n)) set.add(Number(n.toFixed(2)));
  }
  return [...set];
}

/** True when `x` (written with dp decimals) matches allowed value `a` after rounding. */
export function figureMatches(x: number, dp: number, a: number): boolean {
  const tol = 0.5 * 10 ** -dp + 1e-9;
  return Math.abs(Math.abs(a) - Math.abs(x)) <= tol;
}

/** x is the sum/difference/ratio of two OTHER traced figures shown in the same answer, or (for %) the complement of one (tolerance by decimals)? */
function isSimpleDerivation(x: number, dp: number, shown: number[], pct = false): boolean {
  const tol = 0.5 * 10 ** -Math.min(dp, 2) + 1e-9;
  const ax = Math.abs(x);
  if (pct && shown.some((a) => Math.abs(100 - a - ax) <= tol)) return true; // complement of a traced percentage
  for (let i = 0; i < shown.length; i++) for (let j = 0; j < shown.length; j++) {
    if (i === j) continue;
    const a = Math.abs(shown[i]!), b = Math.abs(shown[j]!);
    if (Math.abs(a - b - ax) <= tol || Math.abs(a + b - ax) <= tol) return true;
    // exact arithmetic on two traced figures: a share / ratio / multiple (a÷b, ×100 for %), only for figures written with decimals or as a %
    if (b !== 0 && (pct || dp > 0)) {
      const r = a / b, rtol = 0.5 * 10 ** -dp + 1e-9;
      if (Math.abs(r - ax) <= rtol || (pct && Math.abs(r * 100 - ax) <= rtol)) return true;
    }
  }
  return false;
}

export const CITATION_RE = /\[\s*([a-z_]+)\s*·\s*([^·\]]*?)\s*·\s*r?(\d+)\s*\]/gi;

/** Citations in `answer` that do not correspond to a tool actually executed in this turn (same tool, revision and, when both are dates, as_of). */
export function badCitations(answer: string, executed: ExecutedTool[]): string[] {
  const bad: string[] = [];
  for (const m of answer.matchAll(CITATION_RE)) {
    const [raw, tool, asOf, rev] = [m[0], m[1]!.toLowerCase(), m[2]!.trim(), Number(m[3])];
    const runs = executed.filter((e) => e.name === tool);
    const dateLike = /^\d{4}-\d{2}-\d{2}$/.test(asOf);
    const ok = runs.some((e) => (e.data_revision == null || e.data_revision === rev) && (!dateLike || e.as_of == null || e.as_of === asOf));
    if (!ok) bad.push(raw);
  }
  return [...new Set(bad)];
}

/** Replace unverifiable citations (server-side, for non-streamed modes) with an explicit marker. */
export function stripBadCitations(answer: string, executed: ExecutedTool[]): string {
  const bad = new Set(badCitations(answer, executed));
  return bad.size ? answer.replace(CITATION_RE, (raw) => (bad.has(raw) ? '[unverified citation removed]' : raw)) : answer;
}

export const executedFrom = (outputsByCall: { name: string; output?: any }[]): ExecutedTool[] =>
  outputsByCall.map((c) => ({ name: c.name, as_of: c.output?.as_of ?? null, data_revision: c.output?.data_revision ?? null }));

/**
 * `executed` (optional): the tools that ran in THIS turn; when given, citations are validated against it.
 * User-typed numbers are scenario inputs: they are reported separately and never count as traced evidence.
 */
export function groundingCheck(answer: string, toolOutputs: unknown[], userText: string[] = [], executed?: ExecutedTool[]): GroundingResult {
  const toks = extractNumbers(answer);
  const allowed = allowedFrom(toolOutputs);
  const userAllowed = allowedFrom([], userText);
  const traced = toks.filter((t) => allowed.some((a) => figureMatches(t.value, t.dp, a)));
  const shown = [...new Set(traced.map((t) => t.value))];
  const unmatched: string[] = [], derived: string[] = [], user_inputs: string[] = [];
  for (const t of toks) {
    if (traced.includes(t)) continue;
    if (userAllowed.some((a) => figureMatches(t.value, t.dp, a))) { user_inputs.push(t.raw); continue; }
    if (isSimpleDerivation(t.value, t.dp, shown, t.pct)) derived.push(t.raw); else unmatched.push(t.raw);
  }
  const bad_citations = executed ? badCitations(answer, executed) : [];
  return { checked: toks.length, unmatched: [...new Set(unmatched)], derived: [...new Set(derived)], user_inputs: [...new Set(user_inputs)], bad_citations, ok: unmatched.length === 0 && bad_citations.length === 0 };
}

export const groundingLabel = (g: GroundingResult) => {
  const parts: string[] = [];
  if (g.unmatched.length) parts.push(`${g.unmatched.length} figure${g.unmatched.length === 1 ? '' : 's'} not traced: ${g.unmatched.join(', ')}`);
  if (g.bad_citations.length) parts.push(`${g.bad_citations.length} citation${g.bad_citations.length === 1 ? '' : 's'} reference a tool not run in this turn: ${g.bad_citations.join(', ')}`);
  if (parts.length) return `⚠ ${parts.join(' · ')}`;
  const extra = [g.derived.length ? `${g.derived.length} derived by arithmetic on traced figures` : '', g.user_inputs.length ? `${g.user_inputs.length} are your scenario inputs, not evidence` : ''].filter(Boolean);
  return `✓ All ${g.checked} figures traced to tool results${extra.length ? ` (${extra.join('; ')})` : ''}`;
};
