import { fmtInr, fmtInt } from '../format';
import { BETS, EXPERIMENTS, REJECTED_IDEAS, WHY_BENGALURU } from './content';
import { scoreBets, type StrategyModel } from './model';

/** Content of the three strategy slides. Numbers come ONLY from the strategy model (+ 2025 history); /slides renders this module verbatim. */
export interface SlideInputs { visitors2025?: number; registeredShowUp2025?: number; spend2025?: number; siteUrl?: string }

const sym = (op: string) => (op === '>=' ? '≥' : op === '<=' ? '≤' : op);

export function slideContent(m: StrategyModel, i: SlideInputs = {}) {
  const b = m.base, s = m.stretch;
  const v25 = i.visitors2025 ?? 2050, spend25 = i.spend2025 ?? 274000, showUp25 = i.registeredShowUp2025 ?? 0.6875;
  const pair = (f: (r: typeof b) => string) => `${f(b)} | ${f(s)}`;
  const scores = scoreBets(BETS.map((x) => ({ id: x.id, impact: x.impact, confidence: x.confidence, ease: x.ease })));
  const betRows = scores.map((sc, idx) => {
    const bet = BETS.find((x) => x.id === sc.id)!;
    const bb = b.bets.find((x) => x.id === sc.id)!, bs = s.bets.find((x) => x.id === sc.id)!;
    return {
      rank: idx + 1, id: bet.id, name: bet.name, score: sc.score, ice: `${bet.impact}/${bet.confidence}/${bet.ease}`, mechanism: bet.mechanism,
      visitors: `+${fmtInt(bb.visitors)} / +${fmtInt(bs.visitors)}`, budget: bs.budget > bb.budget ? `${fmtInr(bb.budget)} (+${fmtInr(bs.budget - bb.budget)} gated)` : fmtInr(bb.budget),
      owner: bet.owner, window: `T−${bet.start_offset_weeks} → T−${bet.end_offset_weeks} wk`, formula: `${bb.formula} = ${fmtInt(bb.visitors)}`,
    };
  });
  const refTotals = b.reference;
  return {
    siteUrl: i.siteUrl ?? 'https://<deploy-url>',
    slide1: {
      title: `How high can we aim? ${fmtInt(b.headline)} verified visitors (stretch ${fmtInt(s.headline)}) on ₹3L in Bengaluru`,
      byline: 'Aman Gupta · IIT Kharagpur · Challenge A: Attendee Growth',
      why: WHY_BENGALURU.map((w) => ({ fact: w.fact, tag: w.tag })),
      funnel: [
        ['Target pool', `${fmtInt(b.reach.pool)} (25 club campuses × 2,000 · 20 catchments × 1,500 · 40k alumni/interest)`, ''],
        ['Reach (dedup., A)', fmtInt(b.reach.reached), fmtInt(s.reach.reached)],
        ['Identified', fmtInt(b.reach.identified), fmtInt(s.reach.identified)],
        ['Registered', fmtInt(b.registrations), fmtInt(s.registrations)],
        ['Confirmed', fmtInt(b.confirmed), fmtInt(s.confirmed)],
        ['Registered visitors', fmtInt(b.registered_visitors), fmtInt(s.registered_visitors)],
        ['+ walk-ins', fmtInt(b.walkins), fmtInt(s.walkins)],
        ['Unique verified visitors', `${fmtInt(b.total)} ≈ ${fmtInt(b.headline)}`, fmtInt(s.headline)],
        ['Net spend / reserve', `${fmtInr(b.spend)} / ${fmtInr(b.reserve)}`, `${fmtInr(s.spend)} / ${fmtInr(s.reserve)}`],
        ['CPA reg / visitor', `${fmtInr(b.cpa.registration)} / ${fmtInr(b.cpa.visitor)}`, `${fmtInr(s.cpa.registration)} / ${fmtInr(s.cpa.visitor)}`],
      ] as [string, string, string][],
      growth: `+${Math.round(m.growth_vs_2025.base * 100)}% / +${Math.round(m.growth_vs_2025.stretch * 100)}% vs ${fmtInt(v25)} in 2025`,
      believe: [
        `Built bottom-up from the 2025 cohort (D): ${fmtInt(v25)} visitors, ${(showUp25 * 100).toFixed(2)}% registered show-up, ${fmtInr(Math.round(spend25 / v25))}/visitor.`,
        `Reference keeps proven channels (${fmtInr(refTotals.spend)} → ${fmtInt(refTotals.visitors)} registered visitors); five bets add ${fmtInt(b.acquisition_visitors)}–${fmtInt(s.acquisition_visitors)} + reminders ${fmtInt(b.reminder_visitors)}–${fmtInt(s.reminder_visitors)}.`,
        'Turnout benchmarks 64.7% (Vihaya) and ~72% free events (PheedLoop).',
        `Capacity ≤${fmtInt(b.capacity.cap_per_day)}/day · ≤${fmtInt(b.capacity.cap_weekend)} weekend · 4 QR lanes = ${fmtInt(b.capacity.scans_per_hour)} scans/h.`,
        `Downside ${fmtInt(m.sensitivity.base.no_reminders_no_walkins)} (no reminder lift, no walk-ins); −5 pp show-up = ${fmtInt(m.sensitivity.base.showup_drop_visitors)}.`,
      ],
      statLine: pair((r) => fmtInt(r.headline)),
    },
    slide2: {
      title: 'Where we place our bets: five ranked, eight deferred or rejected',
      bets: betRows,
      budgetBar: [
        { label: `Reference ${fmtInr(b.reference.spend)} (Paid Social ₹93k → ₹35k, Creators ₹59k → ₹23k)`, value: b.reference.spend },
        { label: `Bets ${fmtInr(b.bets_spend)}`, value: b.bets_spend },
        { label: `Reserve ${fmtInr(b.reserve)}`, value: b.reserve },
      ],
      budgetNote: `${fmtInr(b.reference.spend)} + ${fmtInr(b.bets_spend)} + ${fmtInr(b.reserve)} = ${fmtInr(b.cap)} cap (base; stretch spends ${fmtInr(s.spend)}, reserve ${fmtInr(s.reserve)}).`,
      double: 'Double down: B1 + B2, the highest show-up channels (College Partnerships 85.6%, Campus Ambassadors 75%).',
      reject: ['Creator expansion (₹337/visitor, 50% show-up)', 'Broad paid prospecting (retarget only)', '₹49 deposit (reach loss)', 'Gamified passport (protect ingress)'],
      rejectedCount: REJECTED_IDEAS.length,
      constraints: 'One cohort per person · B1/B2 on disjoint campuses · B4 layered on residual no-shows · B3 needs dev time · capacity caps upside.',
      framework: 'Score = 50% impact + 30% confidence + 20% ease (each 0–5), scaled to 100.',
    },
    slide3: {
      title: 'How we’ll know it’s working, and adapt before it’s too late',
      thresholds: EXPERIMENTS.map((e) => ({ bet: e.bet_id, name: e.name, kpi: e.primary_kpi, leading: e.leading_signal, risk: e.risk, scale: `${sym(e.scale_op)} ${e.scale_value}${e.kpi_unit === '%' ? '%' : ''}`, change: e.change_rule, stop: `${sym(e.stop_op)} ${e.stop_value}${e.kpi_unit === '%' ? '%' : ''} ${e.stop_note}` })),
      cadence: 'Weekly review T−6 → T−3 weeks · daily from T−14 days · reserve released only on a passed gate (B5 second ₹6k needs ≥40 visitors at ≤₹150 marginal).',
      ladder: ['Clicks → reg/click', 'Confirmed/registered at T−14', 'Reconfirmation at T−2', 'Verified show-up'],
      loop: [
        'Diagnose flags Paid Social: 50% registered show-up, 240 confirmed no-shows',
        'Copilot what-if: ₹10k Paid Social → College Partnerships ≈ +88 visitors (scenario, not evidence)',
        'Draft task → user confirms → Execution board',
        'Data edit → numbers update (revision counter)',
        'Copilot says when data cannot answer (incrementality, unique reach)',
      ],
      hygiene: 'Cluster randomisation · holdouts · arm logged before exposure · ITT show-up with intervals.',
    },
  };
}

/** Flatten every string in the content (used by docs-consistency tests). */
export function slideText(c: unknown): string {
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (Array.isArray(c)) return c.map(slideText).join(' ');
  if (c && typeof c === 'object') return Object.values(c).map(slideText).join(' ');
  return '';
}
