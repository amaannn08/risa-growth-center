import type { ChatContext } from './env';
import { explicitDates, namedCheckpointDates } from './grounding';

/** Campaign mentions → ids. */
const CAMPAIGNS: [string, RegExp][] = [
  ['C01', /\bC01\b|ambassadors?/i], ['C02', /\bC02\b|paid(?:\s+social)?/i], ['C03', /\bC03\b|creators?(?:\s+partners?)?/i], ['C04', /\bC04\b|college(?:\s+partnerships?)?/i],
  ['C05', /\bC05\b|(?:student\s+)?referrals?/i], ['C06', /\bC06\b|organic(?:\s+search)?/i], ['C07', /\bC07\b|community(?:\s+groups?)?/i],
];
export const campaignsMentioned = (text: string) => CAMPAIGNS.filter(([, re]) => re.test(text)).map(([id]) => id);

/** Measures a person can name. "better / worth / best" are judgements, NOT measures. */
const METRIC = /\b(spen[dt]|spend|spending|cost|costs|cpa|budget|registrations?|registered|sign-?ups?|visitors?|attend\w*|show-?up|no-?shows?|confirm\w*|ctr|click\w*|impressions?|conversion|per\s+visitor|per\s+registration)\b/i;
const METRIC_PAIR = /\b(?:clicks?|impressions?|registrations?|visitors?|confirmations?|spend|cost|cpa|ctr|reach|show-?up|sessions?)\b/gi;
/** The user explicitly says no measure has been chosen. */
const NO_METRIC = /\bno\s+(?:success\s+|primary\s+)?(?:metric|measure|kpi)\b|\bwithout\s+(?:a\s+)?(?:success\s+)?(?:metric|measure|kpi)\b|\b(?:metric|measure|kpi)\s+(?:is\s+)?(?:not|isn.?t)\s+(?:chosen|set|picked|defined)\b|\bunset\b/i;
const JUDGEMENT = /\b(better|best|worse|worst|worth|did\s+well|performed|more\s+valuable|prefer)\b/i;
const COMPARATIVE = /\b(which|what)\s+(one|of\s+(them|those|these|the\s+two)|campaign|channel)\b|\bwhich\s+(did|does|is|was|performed|spent|cost)\b|\bwho\s+(did|performed)\b|\bcompare\b/i;
const ANAPHORA = /\b(those|these|the|both)\s+(two|pair)\b|\bthem\b|\bboth\b|\bthat\s+(one|campaign)\b|\bthe\s+(former|latter)\b|\bwhich\s+one\b|\bone\s+of\s+(them|those)\b/i;
const ALL = /\ball\s+(?:seven|7|the)?\s*campaigns?\b|\beach\s+campaign\b|\bevery\s+campaign\b|\bwhich\s+(?:campaign|channel)\s+(?:has|had|is|was|did|spent|cost|got|gets)\b/i;
const JUDGE_ONE = /\bworth\s+the\s+money\b|\bwas\s+(?:it|that(?:\s+campaign)?)\s+worth\b|\bis\s+(?:it|that\s+campaign)\s+better\b/i;

export interface Resolution { subjects: string[]; all: boolean; metric: boolean; asOf: string | null; /** every date or named checkpoint the request itself mentions (ISO, "23 Feb", "event close"…) */ dates: string[]; /** what is being compared: two campaigns at one date, or one campaign at two dates */ axis: 'subjects' | 'time' }
/** Named checkpoints resolve to labels here (their ISO dates are fixed by the tools); only the COUNT of distinct time points matters for the axis. */
const FAKE_CP = { event_close: 'event close', data_close: 'data close', day_1: 'day 1' };
export function timePoints(text: string, year = '2025'): string[] {
  const pts = new Set<string>([...explicitDates(text, year), ...namedCheckpointDates(text, FAKE_CP)]);
  return [...pts];
}

/**
 * Resolve what a comparison/judgement question is about from the request itself, the page context and the conversation:
 *  - subjects: campaigns named now, else (for "those two / them / which one") the campaigns of the latest earlier turn that named ≥ 2, else the campaign page context;
 *  - metric: an explicit measure now or (for follow-ups like "what about …") in the previous user turn; "no metric chosen" keeps it unresolved;
 *  - date: explicit date now, the page date or the data-close default. A date is never asked for.
 */
export type Turn = string | { role: 'user' | 'assistant'; text: string };
const norm = (h: Turn[]) => h.map((t) => (typeof t === 'string' ? { role: 'user' as const, text: t } : t));

export function resolveComparison(question: string, context: ChatContext = {}, turns: Turn[] = []): Resolution {
  const history = norm(turns);
  const now = campaignsMentioned(question);
  let subjects = now;
  if (subjects.length < 2 && ANAPHORA.test(question)) {
    for (const h of [...history].reverse()) { const m = campaignsMentioned(h.text); if (m.length >= 2) { subjects = m; break; } }
  }
  if (!subjects.length && context.campaignId) subjects = [context.campaignId];
  const metricNow = METRIC.test(question) && !NO_METRIC.test(question);
  // a measure the USER already gave earlier in the thread carries over (unless they now say none is chosen)
  const lastUserMetric = [...history].reverse().find((h) => h.role === 'user' && METRIC.test(h.text));
  const metricPrior = !NO_METRIC.test(question) && !!lastUserMetric && !NO_METRIC.test(lastUserMetric.text);
  const date = /\b\d{4}-\d{2}-\d{2}\b/.exec(question)?.[0] ?? context.asOf ?? null;
  const dates = timePoints(question);
  // one subject at two (or more) time points compares the subject with ITSELF over time; it does not need a second campaign
  const axis = dates.length >= 2 && subjects.length <= 1 && !ALL.test(question) ? 'time' : 'subjects';
  return { subjects, all: ALL.test(question), metric: metricNow || metricPrior, asOf: dates.length === 1 ? dates[0]! : date, dates, axis };
}

const OPTIONS = {
  both: 'Which campaigns do you want to compare, and on what measure? I would rather ask than guess. Likely options:\n\n' +
    '1. **All seven campaigns** ranked by cost per verified visitor\n' +
    '2. **Paid Social vs Creator Partners** (the two biggest spenders) on registered show-up\n' +
    '3. **College Partnerships vs Creator Partners** on visitors and cost per visitor\n\n' +
    'Reply with a number (or name the pair, the metric and a date; the default date is data close, 2025-04-20).',
};
export const CLARIFY_TEXT = OPTIONS.both;

const NAME: Record<string, string> = { C01: 'Campus Ambassadors', C02: 'Paid Social', C03: 'Creator Partners', C04: 'College Partnerships', C05: 'Student Referrals', C06: 'Organic Search', C07: 'Community Groups' };
const list = (ids: string[]) => ids.map((i) => NAME[i] ?? i).join(' and ');

/**
 * Deterministic pre-flight guard, run BEFORE any tool. A comparison/judgement question is answered when its subject set and measure resolve;
 * otherwise we ask ONLY for what is missing (and echo what we did resolve) instead of assuming or re-asking. Returns null when it can be answered.
 */
export function clarifyingQuestion(question: string, context: ChatContext = {}, history: Turn[] = []): string | null {
  const named = campaignsMentioned(question);
  // only questions that are ABOUT campaigns (a campaign/channel is named, or the question points at "those two / which one") are in scope:
  // "14 March vs 15 March", "spend at close vs data close" or "progress vs the target" are not campaign comparisons
  const aboutCampaigns = named.length > 0 || /\b(campaigns?|channels?)\b/i.test(question) || ANAPHORA.test(question) || !!context.campaignId;
  const comparative = COMPARATIVE.test(question) || JUDGE_ONE.test(question) || (/\b(or|vs\.?|versus)\b/i.test(question) && named.length >= 2);
  if (!comparative || !aboutCampaigns) return null;
  const r = resolveComparison(question, context, history);
  const single = JUDGE_ONE.test(question) && !COMPARATIVE.test(question.replace(JUDGE_ONE, ''));
  const metrics = new Set([...question.matchAll(METRIC_PAIR)].map(([metric]) => metric.toLowerCase().replace(/s$/, '')));
  const withinCampaign = r.subjects.length === 1 && metrics.size >= 2 && !/\b(?:other|second|another)\s+(?:campaign|channel)\b/i.test(question) && !/\b(?:which one|those two|them)\b/i.test(question);
  const needSubjects = !r.all && r.axis !== 'time' && r.subjects.length < (single || withinCampaign ? 1 : 2);
  // a measure is only demanded for judgement-style asks ("better", "worth it"); a ranking question that names its measure is fine
  const needMetric = !r.metric && (JUDGEMENT.test(question) || NO_METRIC.test(question) || (needSubjects && !r.all));
  if (!needSubjects && !needMetric) return null;
  if (needSubjects && needMetric) return OPTIONS.both;
  const dateNote = r.asOf ? ` (as of ${r.asOf})` : '';
  if (needSubjects) {
    const known = r.subjects.length ? ` I have ${list(r.subjects)} so far.` : '';
    return `Which campaigns do you mean?${known} The measure${dateNote} is already clear, so I only need the campaigns. Likely options:\n\n` +
      '1. **All seven campaigns**\n2. **Paid Social vs Creator Partners** (the two biggest spenders)\n3. **College Partnerships vs Creator Partners**\n\nReply with a number or name the campaigns.';
  }
  return `On what measure should I compare ${r.all ? 'the campaigns' : list(r.subjects)}${dateNote}? I would rather ask than pick one for you. Likely options:\n\n` +
    '1. **Net spend** (what each cost)\n2. **Cost per verified visitor**\n3. **Registered show-up** (registered who attended)\n\nReply with a number or name the measure.';
}
