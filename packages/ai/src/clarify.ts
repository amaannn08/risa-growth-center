import type { ChatContext } from './env';

const CAMPAIGN_WORDS = /\bC0[1-7]\b|ambassador|paid( social)?|creator|college|referral|organic|community|unattributed|walk-?in|campaign\s+[a-z]/i;
const COMPARATIVE = /\b(which|what)\s+(one|of\s+(them|those|these|the\s+two))\b[^?]*\b(better|best|worse|worst|more|less|higher|lower|did\s+well)\b|\bwhich\s+(did|does|is|was|performed)\s+(better|best|worse|worst)\b|\bwho\s+(did|performed)\s+better\b|\bcompare\s+(them|these|those|the\s+two)\b/i;

export const CLARIFY_TEXT =
  'Which campaigns do you want to compare, and on what measure? I would rather ask than guess. Likely options:\n\n' +
  '1. **All seven campaigns** ranked by cost per verified visitor\n' +
  '2. **Paid Social vs Creator Partners** (the two biggest spenders) on registered show-up\n' +
  '3. **College Partnerships vs Creator Partners** on visitors and cost per visitor\n\n' +
  'Reply with a number (or name the pair, the metric and a date; the default date is data close, 2025-04-20).';

/**
 * Deterministic pre-flight guard: a comparative question with no referent (no campaign named, no campaign page context, no earlier turns)
 * gets a short clarifying question instead of an assumed pair/metric. Returns null when the question can be answered.
 */
export function clarifyingQuestion(question: string, context: ChatContext = {}, priorTurns = 0): string | null {
  if (priorTurns > 0 || context.campaignId || CAMPAIGN_WORDS.test(question)) return null;
  return COMPARATIVE.test(question) ? CLARIFY_TEXT : null;
}
