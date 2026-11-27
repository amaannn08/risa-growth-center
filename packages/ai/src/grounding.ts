/**
 * Grounding check: every figure in the final answer should be traceable to a tool result in the conversation
 * (or the user's own message). Unmatched numbers are reported, not blocked.
 */
export interface NumTok { raw: string; value: number; dp: number; pct?: boolean; /** explicit sign written in the answer */ sign?: '+' | '-' | null; /** written with ₹ / Rs */ cur?: boolean; pp?: boolean; /** text of the same sentence just before the figure (for "not 66.67%" / "earlier answer" detection) */ before?: string }
export interface GroundingResult {
  checked: number; unmatched: string[]; /** figures equal to the sum/difference of two traced figures (allowed, reported separately) */ derived: string[];
  /** figures quoted as superseded or earlier-turn ("not 66.67%", "the earlier answer said …"): neither evidence nor a claim */ superseded: string[];
  /** figures that appear only in the user's own message: scenario inputs, never evidence */ user_inputs: string[];
  /** figures that match a tool value by magnitude but not by metric unit, sign or scope (never given the verified badge) */ claim_mismatches: { raw: string; reason: string; canonical: string }[];
  /** verified figures and the exact call/field/unit/signed value/scope/revision they are bound to */ bindings: Binding[];
  /** citations `[tool · as_of · rN]` naming a tool that did not run in this turn (or with a different revision/date) */ bad_citations: string[];
  ok: boolean;
}
export interface ExecutedTool { name: string; as_of?: string | null; data_revision?: number | null }

const MONTHS = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*';

/** Strip things that look numeric but are not figures: citations, dates, ids, T−14 style offsets, list ordinals, years. */
export function stripNonFigures(text: string): string {
  return text
    .replace(/\[(?:calculate|[a-z]+_[a-z_]+)(?:\s*·[^\]]*)?\]/g, ' ') // [tool · as_of · rev], [calculate · r69], [tool]
    .replace(/\(?\brev(?:ision)?\s*r?\d+\)?/gi, ' ')    // rev 12 / r7
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')              // ISO dates
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, ' ')       // times
    .replace(new RegExp(`\\b\\d{1,2}(?:\\s*(?:,|and|&|or)\\s*\\d{1,2})+\\s+${MONTHS}\\b`, 'gi'), ' ') // 16 and 18 April
    .replace(new RegExp(`\\b\\d{1,2}\\s*[–-]\\s*\\d{1,2}\\s+${MONTHS}\\b`, 'gi'), ' ') // 3–9 Mar
    .replace(new RegExp(`\\b${MONTHS}\\s+\\d{1,2}\\s*[–-]\\s*\\d{1,2}\\b`, 'gi'), ' ') // Mar 3–9
    .replace(/(?<![\d.,])(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g, ' ') // MM-DD (week ends written without the year)
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTHS}\\b`, 'gi'), ' ') // 9 Mar
    .replace(new RegExp(`\\b${MONTHS}\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, 'gi'), ' ') // Mar 9
    .replace(/\b[A-Z]{2,}(?:-[A-Z]?\d+)+\b/g, ' ')     // activity / record ids: AD-C03-0416, MD-C05-0418
    .replace(/\b[A-Za-z]{1,4}[-−–]?\d+[A-Za-z]?\b/g, ' ') // C02, R0001, E0001, B1, T−14, CHK00012, P0
    .replace(/[×x*\/]\s*100\b(?!\s*[,\d])/g, ' ')                // ×100 / /…×100 in a shown formula
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
    out.push({ raw: m[0].trim(), value, dp, pct: suffix === '%', sign: m[1] === '+' ? '+' : m[1] ? '-' : null, cur: !!m[2], pp: suffix === 'pp', before: s.slice(Math.max(0, m.index - 45), m.index) });
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

/** A citation names a tool; the date and revision are optional so abbreviated forms (`[calculate · r69]`, `[get_funnel]`) are validated too. */
export interface Citation { raw: string; tool: string; asOf: string | null; revision: number | null }
const TOOL_TOKEN = /^(?:calculate|[a-z]+_[a-z_]+)$/;
export function parseCitations(answer: string): Citation[] {
  const out: Citation[] = [];
  for (const m of answer.matchAll(/\[([^\[\]\n]{2,120})\](?!\()/g)) {
    const parts = m[1]!.split('·').map((x) => x.trim());
    const tool = parts[0]!.toLowerCase();
    if (!TOOL_TOKEN.test(tool)) continue;
    let asOf: string | null = null, revision: number | null = null;
    for (const t of parts.slice(1)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) asOf = t;
      else { const r = /^(?:r|rev(?:ision)?\s*)(\d+)$/i.exec(t) ?? /^(\d+)$/.exec(t); if (r) revision = Number(r[1]); }
    }
    out.push({ raw: m[0], tool, asOf, revision });
  }
  return out;
}

/** Citations in `answer` that do not resolve to a tool call executed in this turn (same tool and, when written, same revision and as_of date). */
export function badCitations(answer: string, executed: ExecutedTool[]): string[] {
  const bad: string[] = [];
  for (const c of parseCitations(answer)) {
    const ok = executed.filter((e) => e.name === c.tool).some((e) => (c.revision === null || e.data_revision == null || e.data_revision === c.revision) && (c.asOf === null || e.as_of == null || e.as_of === c.asOf));
    if (!ok) bad.push(c.raw);
  }
  return [...new Set(bad)];
}

/** Replace unverifiable citations (server-side, for non-streamed modes) with an explicit marker. */
export function stripBadCitations(answer: string, executed: ExecutedTool[]): string {
  const bad = new Set(badCitations(answer, executed));
  return bad.size ? answer.replace(/\[[^\[\]\n]{2,120}\](?!\()/g, (raw) => (bad.has(raw) ? '[unverified citation removed]' : raw)) : answer;
}

export const executedFrom = (outputsByCall: { name: string; output?: any }[]): ExecutedTool[] =>
  outputsByCall.map((c) => ({ name: c.name, as_of: c.output?.as_of ?? null, data_revision: c.output?.data_revision ?? null }));

/**
 * `executed` (optional): the tools that ran in THIS turn; when given, citations are validated against it.
 * User-typed numbers are scenario inputs: they are reported separately and never count as traced evidence.
 */
/** Markdown-table columns whose header says they are from an earlier answer / turn: their cells are quoted history, not claims about this turn's data. */
export function splitEarlierColumns(answer: string): { main: string; earlier: string } {
  const lines = answer.split('\n'), earlierCols = new Set<number>();
  const main: string[] = [], earlier: string[] = [];
  for (const line of lines) {
    if (!/^\s*\|/.test(line)) { main.push(line); continue; }
    const cells = line.split('|').slice(1, -1);
    if (/earlier|previous|prior (?:answer|turn)/i.test(line) && !/^\s*\|[\s:|-]+\|?\s*$/.test(line)) cells.forEach((c, i) => { if (/earlier|previous|prior (?:answer|turn)/i.test(c)) earlierCols.add(i); });
    if (!earlierCols.size) { main.push(line); continue; }
    main.push('|' + cells.map((c, i) => (earlierCols.has(i) ? ' — ' : c)).join('|') + '|');
    earlier.push(cells.filter((_, i) => earlierCols.has(i)).join(' '));
  }
  return { main: main.join('\n'), earlier: earlier.join('\n') };
}

export function groundingCheck(answer0: string, toolOutputs: unknown[], userText: string[] = [], executed?: ExecutedTool[]): GroundingResult {
  const { main: answer, earlier } = splitEarlierColumns(answer0);
  const toks = extractNumbers(answer);
  const allowed = allowedFrom(toolOutputs);
  const userAllowed = allowedFrom([], userText);
  const traced = toks.filter((t) => allowed.some((a) => figureMatches(t.value, t.dp, a)));
  const shown = [...new Set(traced.map((t) => t.value))];
  const unmatched: string[] = [], derived: string[] = [], user_inputs: string[] = [], superseded: string[] = [];
  const SUPERSEDED = /(?:\bnot\b|instead of|rather than|earlier (?:answer|turn|reply)|previous(?:ly)? (?:answer|turn|said|stated|reply)|I (?:said|stated|wrote)|was wrong)[^.|\n]*$/i;
  for (const t of toks) {
    if (traced.includes(t)) continue;
    if (userAllowed.some((a) => figureMatches(t.value, t.dp, a))) { user_inputs.push(t.raw); continue; }
    if (isSimpleDerivation(t.value, t.dp, shown, t.pct)) derived.push(t.raw);
    else if (t.before && SUPERSEDED.test(t.before)) superseded.push(t.raw);
    else unmatched.push(t.raw);
  }
  const bad_citations = executed ? badCitations(answer, executed) : [];
  return { checked: toks.length, unmatched: [...new Set(unmatched)], derived: [...new Set(derived)], user_inputs: [...new Set(user_inputs)], claim_mismatches: [], bindings: [], superseded: [...new Set([...superseded, ...extractNumbers(earlier).map((t) => t.raw)])], bad_citations, ok: unmatched.length === 0 && bad_citations.length === 0 };
}

export const groundingLabel = (g: GroundingResult) => {
  const parts: string[] = [];
  if (g.unmatched.length) parts.push(`${g.unmatched.length} figure${g.unmatched.length === 1 ? '' : 's'} not traced: ${g.unmatched.join(', ')}`);
  if (g.claim_mismatches.length) parts.push(`${g.claim_mismatches.length} claim${g.claim_mismatches.length === 1 ? '' : 's'} do not match the cited field: ${g.claim_mismatches.map((m) => `${m.raw} (${m.reason}; tool: ${m.canonical})`).join('; ')}`);
  if (g.bad_citations.length) parts.push(`${g.bad_citations.length} citation${g.bad_citations.length === 1 ? '' : 's'} reference a tool not run in this turn: ${g.bad_citations.join(', ')}`);
  if (parts.length) return `⚠ ${parts.join(' · ')}`;
  const extra = [g.derived.length ? `${g.derived.length} derived by arithmetic on traced figures` : '', g.user_inputs.length ? `${g.user_inputs.length} are your scenario inputs, not evidence` : '', g.superseded?.length ? `${g.superseded.length} quoted as superseded, not evidence` : ''].filter(Boolean);
  return `✓ All ${g.checked} figures traced to tool results${extra.length ? ` (${extra.join('; ')})` : ''}`;
};

/** Bound evidence ref as issued by the server (see evidence.ts); structurally typed so the client bundle does not import server code. */
export interface TurnRef { signedValue: number; unit?: string; metricField?: string; scope?: string | null; asOf?: string | null; revision?: number | null; toolCallId?: string }
export interface TurnCall { tool: string; toolCallId?: string; asOf: string | null; revision: number | null; refs: TurnRef[]; /** named checkpoint → ISO date, as resolved by the tool run */ checkpoints?: Record<string, string> | null }
export interface Binding { raw: string; callId: string | null; tool: string; field: string; unit: string; signedValue: number; scope: string | null; asOf: string | null; revision: number | null }

const CHECKPOINT_RES: [string, RegExp][] = [['event_close', /\bevent[\s-]*close\b/i], ['data_close', /\bdata[\s-]*close\b/i], ['day_1', /\b(?:day[\s-]*(?:1|one)|first\s+day|opening\s+day)\b/i]];
/** ISO dates of the named checkpoints ("event close", "data close", "day 1" / "first day") that `text` mentions. */
export function namedCheckpointDates(text: string, checkpoints: Record<string, string> | null | undefined): string[] {
  if (!checkpoints) return [];
  return CHECKPOINT_RES.filter(([, re]) => re.test(text)).map(([k]) => checkpoints[k]).filter((d): d is string => !!d);
}
const MON: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** Explicit calendar dates in `text` (ISO, "12 Apr", "Apr 12"); `year` completes the day-month forms. */
export function explicitDates(text: string, year: string | null): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)) out.add(m[1]!);
  if (year) {
    const pad = (n: number) => String(n).padStart(2, '0');
    for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\b|\\b(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'gi'))) {
      const mon = MON[(m[2] ?? m[3]!).slice(0, 3).toLowerCase()], day = Number(m[1] ?? m[4]);
      if (mon && day >= 1 && day <= 31) out.add(`${year}-${pad(mon)}-${pad(day)}`);
    }
  }
  return [...out];
}

const LOSS_WORDS = /\b(?:lost|loss|fewer|less|declin\w*|decreas\w*|drop\w*|down|reduc\w*|minus|shortfall|gap|below|negative|fell|fall|short|cut|deficit|credit\w*|refund\w*|reversal|donor)\b/i;
const INR_WORDS = /(?:₹|\bRs\b|\bINR\b|spen[dt]|spending|cost|budget|credit|debit|refund|headroom|\bcap\b|\bcpa\b|\bcpm\b|rupee|ledger|posting|\bnet\b|\bgross\b|paid)/i;
const COUNT_WORDS = /\b(?:visitors?|people|persons?|registrations?|registered|attendees?|admissions?|admitted|check-?ins?|clicks?|impressions|sessions|scanner|scans?|confirmed|cancel\w*|waitlist\w*|no-?shows?|events?)\b/i;
const OVERALL_WORDS = /\b(?:overall|event-wide|portfolio|programme|program|total|whole|all\s+(?:seven\s+)?campaigns|across)\b/i;
const CAMPAIGN_NAMES = /\bC0[1-7]\b|ambassadors?|paid\s+social|creators?|college\s+partnerships?|student\s+referrals?|organic\s+search|community\s+groups?/i;
const isInr = (u?: string) => !!u && /inr|₹|rupee/i.test(u);
const isPct = (u?: string) => !!u && /fraction|percent|pct|rate|%/i.test(u);

/** Per-figure binding of an answer to the server-issued refs of THIS turn: magnitude, unit, sign and scope must all agree with a cited field. */
export function claimCheck(answer: string, calls: TurnCall[]): { mismatches: GroundingResult['claim_mismatches']; bindings: Binding[] } {
  const mismatches: GroundingResult['claim_mismatches'] = [], bindings: Binding[] = [];
  const all = calls.flatMap((c) => c.refs.map((r) => ({ c, r })));
  const checkpoints = calls.find((c) => c.checkpoints)?.checkpoints ?? null;
  const year = (calls.map((c) => c.asOf).find(Boolean) ?? null)?.slice(0, 4) ?? null;
  const canon = (r: TurnRef) => { const v = r.signedValue; return `${v < 0 ? '−' : ''}${isInr(r.unit) ? '₹' : ''}${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}${r.unit === 'percent' ? '%' : ''}${r.unit === 'fraction' ? ` (= ${(v * 100).toFixed(2)}%)` : ''} in ${r.metricField ?? 'field'}`; };
  for (const sentence of splitEarlierColumns(answer).main.split(/(?<=[.!?])\s+|\n+/)) {
    const toks = extractNumbers(sentence);
    if (!toks.length) continue;
    // a checkpoint only scopes the figure when the sentence is about the figure AT that checkpoint ("net spend at event close"), not a relation to it ("credits posted after event close") or a forecast of it
    const scoping = sentence.replace(/\b(?:day[\s-]*(?:1|one)|first\s+day|event[\s-]*close|data[\s-]*close)\s*(?:=|:|is|was|on)\s*\d{4}-\d{2}-\d{2}/gi, ' ').replace(/\bevent\s+(?:had\s+not\s+started|starts?|started|opens?|opened)\b/gi, ' ').replace(/\b(?:after|before|since|post-?|between|until|through|following|beyond|past|from|by|day\s+before)\s+(?:the\s+)?(?:(?:event|data)[\s-]*close|day[\s-]*(?:1|one)|first\s+day)/gi, ' ');
    const forecast = /\b(?:project\w*|forecast\w*|scenario|expected|will|plan\w*|target|if you want|want me to|next step|suggest\w*|I can|re-?run|re-?pull|check)\b/i.test(sentence);
    const cps = forecast ? [] : namedCheckpointDates(scoping, checkpoints);
    const wantDates = cps;
    const namesCampaign = CAMPAIGN_NAMES.test(sentence), saysOverall = OVERALL_WORDS.test(sentence);
    const inrCtx = INR_WORDS.test(sentence), cntCtx = COUNT_WORDS.test(sentence);
    for (const t of toks) {
      const cands = all.filter(({ r }) => figureMatches(t.value, t.dp, r.signedValue) || (Math.abs(r.signedValue) <= 10 && figureMatches(t.value, t.dp, r.signedValue * 100)) || (t.dp === 0 && figureMatches(t.value, 0, Math.round(r.signedValue))));
      if (t.value === 0) continue; // a bare zero is ambiguous across fields (0 visitors, 0.00% show-up): nothing to bind
      if (!cands.length) continue; // untraced / derived / user input: handled by the figure check
      const why = new Map<TurnRef, string>();
      for (const { c, r } of cands) {
        const unit = r.unit ?? 'count', unknownUnit = unit === 'unknown';
        const fracMatch = Math.abs(r.signedValue) <= 10 && !figureMatches(t.value, t.dp, r.signedValue) && figureMatches(t.value, t.dp, r.signedValue * 100);
        let bad = '';
        if (c.tool === 'calculate') bad = ''; // the model's own arithmetic: its sign is whatever the expression produced
        else if (t.sign === '-' && r.signedValue > 0 && !fracMatch && !LOSS_WORDS.test(sentence) && /credit|net_spend|amount|delta|change|diff|headroom|gap/i.test(r.metricField ?? '')) bad = `sign: the tool value is +${Math.abs(r.signedValue).toLocaleString('en-US')}, the answer writes it negative`;
        else if (t.sign === '+' && r.signedValue < 0) bad = `sign: the tool value is negative (${canon(r)}), the answer writes it positive`;
        else if (!unknownUnit) {
          if (t.cur && unit === 'count') bad = 'unit: written in ₹ but the cited field is a count';
          else if ((t.pct || t.pp) && !isPct(unit) && !fracMatch && !/percent/.test(unit)) bad = 'unit: written as a percentage but the cited field is not a rate';
          else if (!t.cur && !t.pct && !t.pp && isInr(unit) && cntCtx && !inrCtx) bad = 'metric: the cited field is an INR amount but the sentence describes a count';
          else if (!isInr(unit) && !isPct(unit) && t.cur && unit === 'count') bad = 'unit: written in ₹ but the cited field is a count';
        }
        if (!bad && wantDates.length) {
          // named checkpoints and explicit dates only bind point-in-time / cumulative figures; a ranged figure has its own bounds
          const ranged = !!r.scope && /^range /.test(r.scope);
          const pointTool = /^(?:get_funnel|get_targets|get_spend_ledger|compare_campaigns)$/.test(c.tool);
          const needs = pointTool ? cps : [];
          if (needs.length && !ranged && r.asOf && !needs.includes(r.asOf)) bad = `scope: the sentence is about ${needs.join(' / ')} but the cited field is as of ${r.asOf}`;
        }
        if (!bad && namesCampaign && !saysOverall && !forecast && r.scope === 'event-wide') bad = 'scope: the sentence names a campaign but the cited field is event-wide';
        if (!bad) { bindings.push({ raw: t.raw, callId: c.toolCallId ?? null, tool: c.tool, field: r.metricField ?? '', unit, signedValue: r.signedValue, scope: r.scope ?? null, asOf: r.asOf ?? c.asOf, revision: r.revision ?? c.revision }); why.clear(); break; }
        why.set(r, bad);
      }
      if (why.size) { const [r, reason] = [...why.entries()][0]!; mismatches.push({ raw: `${t.raw}`, reason, canonical: canon(r) }); }
    }
  }
  const seen = new Set<string>();
  return { mismatches: mismatches.filter((m) => (seen.has(m.raw + m.reason) ? false : (seen.add(m.raw + m.reason), true))), bindings };
}

/**
 * Verify an answer ONLY against the tool calls the server executed in this turn: figures must equal a server-issued ref value, every
 * citation must resolve to one of those calls, and each figure must agree with its cited field's unit, sign and scope.
 * Earlier turns and anything else in the client transcript count for nothing.
 */
export function groundingFromCalls(answer: string, calls: TurnCall[], userText: string[] = []): GroundingResult {
  const base = groundingCheck(answer, [calls.flatMap((c) => c.refs.map((r) => r.signedValue))], userText, calls.map((c) => ({ name: c.tool, as_of: c.asOf, data_revision: c.revision })));
  const { mismatches, bindings } = claimCheck(answer, calls);
  return { ...base, claim_mismatches: mismatches, bindings, ok: base.ok && mismatches.length === 0 };
}

const isToolPart = (p: any) => typeof p?.type === 'string' && (p.type.startsWith('tool-') || p.type === 'dynamic-tool');
/** The answer an assistant message shows AND is checked/scored on: only the text after its last tool call. Text streamed before or between tool calls is interim narration and is never rendered. */
export function finalAnswerText(parts: any[]): string {
  const lastTool = parts.reduce((acc, p, i) => (isToolPart(p) ? i : acc), -1);
  return parts.slice(lastTool + 1).filter((p) => p?.type === 'text').map((p) => String(p.text ?? '')).filter((t) => t.trim()).join('\n\n');
}
