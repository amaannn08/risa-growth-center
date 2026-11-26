import { coverageEnd, type Dataset } from './dataset';
import { ratio } from './groupMetrics';
import { mode, recommendCampaigns } from './recommend';
import { snapshot } from './snapshot';
import { weeklySeries } from './series';
import { targetsView } from './targets';
import { UNATTR } from './types';

export interface Finding {
  id: string; kind: 'stage_leakage' | 'portfolio_gap' | 'trend_break' | 'budget' | 'target_gap';
  severity: 'high' | 'medium' | 'low' | 'info'; campaign_id?: string; title: string;
  evidence: { metric: string; value: number | null; numerator?: number; denominator?: number; comparison?: { label: string; value: number | null }; lost?: number };
  suggested_action: string; caveat?: string; as_of: string; data_revision: number;
}
export const CAUSE_CAVEAT = 'Cause not in data: landing page, cohort lag and posting schedule are hypotheses.';
const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);

type Stage = { key: 'identified_to_registered' | 'registered_to_confirmed' | 'confirmed_to_attended'; label: string; num: string; den: string; post?: boolean };
const STAGES: Stage[] = [
  { key: 'identified_to_registered', label: 'Identified → registered', num: 'registered_people', den: 'identified_external_people' },
  { key: 'registered_to_confirmed', label: 'Registered → confirmed', num: 'confirmed_people', den: 'registered_people' },
  { key: 'confirmed_to_attended', label: 'Confirmed → attended', num: 'confirmed_and_attended_people', den: 'confirmed_people', post: true },
];

export function diagnose(ds: Dataset, asOf: string = coverageEnd(ds)): Finding[] {
  const rev = ds.revision, snap = snapshot(ds, asOf), post = mode(ds, asOf) === 'post_event';
  const findings: Finding[] = [];
  const camps = Object.entries(snap.campaigns!).filter(([id]) => id !== UNATTR);

  // 1. Stage leakage: lost = max(0, (overall − campaign) × campaign denominator). Overall = campaign cohorts combined (excludes walk-ins).
  for (const st of STAGES) {
    if (st.post && !post) continue;
    const num = camps.reduce((s, [, v]) => s + (v.first_touch as any)[st.num], 0);
    const den = camps.reduce((s, [, v]) => s + (v.first_touch as any)[st.den], 0);
    const overall = ratio(num, den);
    if (overall === null) continue;
    for (const [cid, v] of camps) {
      const n = (v.first_touch as any)[st.num] as number, d = (v.first_touch as any)[st.den] as number;
      const rate = ratio(n, d);
      if (rate === null) continue;
      const lost = Math.max(0, (overall - rate) * d);
      if (lost < 10) continue;
      findings.push({
        id: `stage_leakage_${st.key}:${cid}:${asOf}`, kind: 'stage_leakage', campaign_id: cid,
        severity: lost >= 80 ? 'high' : lost >= 30 ? 'medium' : 'low',
        title: `${v.campaign_name}: ${st.label} ${pct(rate)} vs ${pct(overall)} overall (~${Math.round(lost)} people lost)`,
        evidence: { metric: `${st.key}_rate`, value: rate, numerator: n, denominator: d, comparison: { label: 'all campaigns', value: overall }, lost },
        suggested_action: st.key === 'confirmed_to_attended'
          ? `Test a reconfirmation nudge and arrival-flow fix for ${v.campaign_name} registrants (B4).`
          : st.key === 'identified_to_registered' ? `Review the landing page and registration friction for ${v.campaign_name} leads.` : `Check confirmation follow-up timing for ${v.campaign_name}.`,
        caveat: 'Attribution is observational; cause not in data.', as_of: asOf, data_revision: rev,
      });
    }
  }
  findings.sort((a, b) => (b.evidence.lost ?? 0) - (a.evidence.lost ?? 0));

  // 2. Portfolio gaps
  const identified = camps.reduce((s, [, v]) => s + v.first_touch.identified_external_people, 0);
  const registered = camps.reduce((s, [, v]) => s + v.first_touch.registered_people, 0);
  findings.push({
    id: `portfolio_gap:identified_unregistered:${asOf}`, kind: 'portfolio_gap', severity: 'medium',
    title: `${identified - registered} campaign-identified people have not registered`,
    evidence: { metric: 'identified_not_registered', value: identified - registered, numerator: registered, denominator: identified, comparison: { label: 'identified (excl. walk-ins)', value: identified } },
    suggested_action: 'Run a registration-completion nudge to identified, unregistered people.', as_of: asOf, data_revision: rev,
  });
  if (post) {
    const confirmed = snap.overall.confirmed_people, both = snap.overall.confirmed_and_attended_people;
    findings.push({
      id: `portfolio_gap:confirmed_no_shows:${asOf}`, kind: 'portfolio_gap', severity: 'high',
      title: `${confirmed - both} confirmed registrants did not attend`,
      evidence: { metric: 'confirmed_no_shows', value: confirmed - both, numerator: both, denominator: confirmed, comparison: { label: 'confirmed show-up', value: ratio(both, confirmed) } },
      suggested_action: 'Prioritise WhatsApp reconfirmation (B4) and slot reminders for next edition.', as_of: asOf, data_revision: rev,
    });
  }

  // 3. Trend breaks on weekly registrations_per_click (complete weeks only)
  const weeks = weeklySeries(ds).filter((w) => w.through <= asOf);
  for (const cid of ds.campaignIds) {
    for (let i = 1; i < weeks.length; i++) {
      const p = weeks[i - 1]!.campaigns[cid]!.first_touch.period_increment, c = weeks[i]!.campaigns[cid]!.first_touch.period_increment;
      const rp = ratio(p.registered_people, p.clicks), rc = ratio(c.registered_people, c.clicks);
      const bothClicks = p.clicks >= 300 && c.clicks >= 300;
      const relChange = rp && rc !== null ? (rc - rp) / rp : null;
      const regChange = p.registered_people > 0 ? (c.registered_people - p.registered_people) / p.registered_people : c.registered_people > 0 ? Infinity : 0;
      const flag =
        (bothClicks && relChange !== null && Math.abs(relChange) >= 0.5) ||
        (c.registered_people === 0 && c.clicks >= 300) ||
        (Math.abs(regChange) >= 1 && Math.max(p.registered_people, c.registered_people) >= 30);
      if (!flag) continue;
      const w = weeks[i]!;
      findings.push({
        id: `trend_break:${cid}:${w.through}`, kind: 'trend_break', campaign_id: cid, severity: c.registered_people === 0 || (relChange !== null && relChange < 0) ? 'high' : 'low',
        title: `${ds.campaigns[cid]!.campaign_name}: week to ${w.through} registrations ${p.registered_people}→${c.registered_people} (clicks ${p.clicks}→${c.clicks})`,
        evidence: { metric: 'registrations_per_click', value: rc, numerator: c.registered_people, denominator: c.clicks, comparison: { label: `prior week (${weeks[i - 1]!.through})`, value: rp } },
        suggested_action: `Audit ${ds.campaigns[cid]!.campaign_name} for the week of ${w.from}; interview owners before changing spend.`,
        caveat: CAUSE_CAVEAT, as_of: asOf, data_revision: rev,
      });
    }
  }

  // 4. Budget
  const tv = targetsView(ds, asOf);
  if (tv.budget) {
    const afterClose = ds.daily.filter((r) => r.marketing_spend_inr < 0 && r.activity_date <= asOf);
    findings.push({
      id: `budget:overall:${asOf}`, kind: 'budget', severity: tv.budget.headroom < 0 ? 'high' : 'info',
      title: `Net spend ₹${tv.budget.spend.toLocaleString('en-US')} vs cap ₹${tv.budget.cap.toLocaleString('en-US')} (headroom ₹${tv.budget.headroom.toLocaleString('en-US')})`,
      evidence: { metric: 'net_spend', value: tv.budget.spend, numerator: tv.budget.spend, denominator: tv.budget.cap, comparison: { label: 'credits posted', value: afterClose.reduce((s, r) => s + r.marketing_spend_inr, 0) } },
      suggested_action: afterClose.length ? `Reconcile ${afterClose.length} vendor credit posting(s) when comparing spend across dates.` : 'Hold the remaining headroom as reserve until gates pass.',
      as_of: asOf, data_revision: rev,
    });
  }

  // 5. Target gap
  if (tv.progress && tv.in_effect) {
    for (const [k, p] of Object.entries(tv.progress)) {
      const isBudget = k === 'marketing_budget_inr';
      findings.push({
        id: `target_gap:${k}:${asOf}`, kind: 'target_gap', severity: isBudget ? 'info' : (p.fraction ?? 1) < 0.9 ? 'high' : (p.fraction ?? 1) < 1 ? 'medium' : 'info',
        title: `${k.replace(/_goal$|_inr$/, '').replace(/_/g, ' ')}: ${p.actual.toLocaleString('en-US')} vs ${p.goal.toLocaleString('en-US')} (${tv.in_effect.target_version})`,
        evidence: { metric: k, value: p.fraction, numerator: p.actual, denominator: p.goal, comparison: { label: 'actual − goal', value: p.actual_minus_goal } },
        suggested_action: isBudget ? 'Track against the cap.' : p.actual_minus_goal < 0 ? 'Close the gap with the highest-show-up channels.' : 'Target met; protect conversion.',
        as_of: asOf, data_revision: rev,
      });
    }
  }
  return findings;
}

