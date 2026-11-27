import { z } from 'zod';
import {
  KNOWN_MISSING, UNATTR, attendanceByDay, calc, dataQuality, diagnose, istDate, mode, recommendCampaigns, scoreBets, showUpByRegistrationWeek,
  snapshot, targetsView, weekdayMon0, whatIfShift, projectVisitors, strategyModel, lookup, addDays, diffDays, ratio,
  type Attribution, type GroupMetrics, type Snapshot,
} from '@gc/core';
import { createDraft } from '@gc/db';
import { ToolError, liveStrategy, type ToolEnv } from './env';
import { buildEvidence, callEvidence } from './evidence';

// ---------- shared schemas ----------
const AsOf = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional().describe('As-of date YYYY-MM-DD (IST end of day). Defaults to the conversation context date.');
const AttributionZ = z.enum(['first_touch', 'registration_source', 'checkin_source']).optional().describe('Attribution view; default first_touch');
const CampaignId = z.string().optional().describe("Campaign id (C01..C07), campaign name (case-insensitive, e.g. 'Paid Social'), or 'unattributed'");

export interface ToolSpec { name: string; description: string; schema: z.ZodObject<any>; mutating?: boolean; run: (env: ToolEnv, args: any) => Promise<any> | any }

// ---------- helpers ----------
export function resolveAsOf(env: ToolEnv, v?: string): string {
  const d = v ?? env.context.asOf ?? env.covEnd;
  if (d < env.covStart || d > env.covEnd) throw new ToolError('OUT_OF_COVERAGE', `${d} is outside dataset coverage ${env.covStart}..${env.covEnd}`, `Use a date between ${env.covStart} and ${env.covEnd}.`);
  return d;
}
const attrOf = (env: ToolEnv, a?: Attribution): Attribution => a ?? env.context.attribution ?? 'first_touch';

const ALIASES: Record<string, string> = { paid: 'C02', creator: 'C03', creators: 'C03', college: 'C04', referral: 'C05', referrals: 'C05', organic: 'C06', community: 'C07', ambassador: 'C01', ambassadors: 'C01', unattributed: UNATTR, walkin: UNATTR, walkins: UNATTR };
export function resolveCampaign(env: ToolEnv, v?: string | null): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const s = v.trim(), l = s.toLowerCase();
  if (env.ds.campaigns[s.toUpperCase()]) return s.toUpperCase();
  if (l === UNATTR) return UNATTR;
  const byName = Object.values(env.ds.campaigns).find((c) => c.campaign_name.toLowerCase() === l)
    ?? Object.values(env.ds.campaigns).find((c) => c.campaign_name.toLowerCase().includes(l) || l.includes(c.campaign_name.toLowerCase()) || String(c.channel).toLowerCase() === l.replace(/\s+/g, '_'));
  if (byName) return byName.campaign_id;
  const first = l.split(/\s+/)[0]!;
  if (ALIASES[l] ?? ALIASES[first]) return ALIASES[l] ?? ALIASES[first];
  throw new ToolError('UNKNOWN_CAMPAIGN', `No campaign matches "${v}"`, `Valid: ${Object.values(env.ds.campaigns).map((c) => `${c.campaign_id}=${c.campaign_name}`).join(', ')}, unattributed`);
}

async function resolveOwner(env: ToolEnv, v?: string | null): Promise<string | undefined> {
  if (!v) return undefined;
  const rows = env.mgmt.team;
  const l = v.trim().toLowerCase();
  const hit = rows.find((r) => r.owner_id.toLowerCase() === l) ?? rows.find((r) => r.name.toLowerCase() === l) ?? rows.find((r) => r.name.toLowerCase().split(' ').includes(l) || r.name.toLowerCase().includes(l));
  if (!hit) throw new ToolError('UNKNOWN_OWNER', `No team member matches "${v}"`, `Valid: ${rows.map((r) => `${r.owner_id}=${r.name}`).join(', ')}`);
  return hit.owner_id;
}

const meta = (env: ToolEnv, tool: string, as_of: string | null, units: Record<string, string>, attribution?: Attribution) => ({
  tool, as_of, data_revision: env.meta.data_revision, ...(attribution ? { attribution } : {}), units,
});
const pct2 = (f: number | null | undefined) => (f === null || f === undefined ? null : `${(f * 100).toFixed(2)}%`);
const step = (label: string, rate: number | null, numerator: number | null, denominator: number | null, note?: string) =>
  ({ step: label, rate, pct: pct2(rate), numerator, denominator, ...(note ? { note } : {}) });

const UNITS = { spend: 'INR (net of credits)', people: 'unique external people', reach: 'observations, not people', rates: 'fractions (0-1); pct is the same as a percentage' };

function stageBlock(m: GroupMetrics) {
  const r = m.rates;
  const eng = r.engaged_among_identified_people === null ? null : Math.round(r.engaged_among_identified_people * m.identified_external_people);
  return {
    platform_observations_not_people: {
      reported_reach_sum_nonunique: m.reported_reach_sum_nonunique, impressions: m.impressions, clicks: m.clicks,
      landing_page_sessions: m.landing_page_sessions, registration_starts: m.registration_starts,
      note: 'Reach is a non-unique daily sum; sessions/clicks cannot be joined to people (directional only).',
    },
    people: {
      identified: m.identified_external_people, engaged: m.engaged_people, broad_engaged: m.broad_engaged_people, registered: m.registered_people,
      confirmed: m.confirmed_people, visitors_unique_verified: m.attended_people, registered_and_attended: m.registered_and_attended_people,
      confirmed_and_attended: m.confirmed_and_attended_people, status_by_person: m.latest_status_by_person_distinct_within_status,
      confirmed_no_shows: m.confirmed_people - m.confirmed_and_attended_people,
    },
    steps: [
      step('identified → engaged', r.engaged_among_identified_people, eng, m.identified_external_people),
      step('engaged → registered', r.registered_among_engaged_people, null, m.engaged_people),
      step('identified → registered', r.registered_among_identified_people, m.registered_people, m.identified_external_people),
      step('registered → confirmed', r.confirmed_among_registered_people, m.confirmed_people, m.registered_people),
      step('registered show-up (registered∩attended / registered)', r.registered_show_up, m.registered_and_attended_people, m.registered_people),
      step('confirmed show-up (confirmed∩attended / confirmed)', r.confirmed_show_up, m.confirmed_and_attended_people, m.confirmed_people),
    ],
    cost: { net_spend_inr: m.marketing_spend_inr, cpa_per_registration_inr: r.cpa_per_registration_inr, cpa_per_visitor_inr: r.cpa_per_attendee_inr, cpm_inr: r.cpm_net_all_campaign_cost_inr, ctr_clicks_per_impression: r.clicks_per_impression },
  };
}

// ---------- tool specs ----------
export const TOOLS: ToolSpec[] = [
  {
    name: 'get_funnel',
    description: 'Funnel for the whole event or one campaign as of a date: platform observations (reach, impressions, clicks, sessions, starts) separated from unique-people stages (identified → engaged → registered → confirmed → verified visitors), step rates with numerator/denominator, registered and confirmed show-up, walk-ins, net spend and CPA, and the target in effect with progress (overall only). Works for ANY as_of date, so use it for status counts (interested/confirmed/cancelled/waitlisted in status_by_person), show-up, spend, CPA and "what moved between two dates" questions.',
    schema: z.object({ as_of: AsOf, campaign_id: CampaignId, attribution: AttributionZ }),
    run: (env, a) => {
      const asOf = resolveAsOf(env, a.as_of), attr = attrOf(env, a.attribution), cid = resolveCampaign(env, a.campaign_id ?? env.context.campaignId);
      const snap = snapshot(env.ds, asOf);
      const base = meta(env, 'get_funnel', asOf, UNITS, attr);
      if (!cid) {
        const o = snap.overall;
        return {
          ...base, scope: 'overall',
          ...stageBlock(o),
          walk_ins_attended_unregistered: o.attended_unregistered_people,
          verified_admission_events: o.external_verified_admission_events,
          headline_attendees_per_registration_including_walkins: { rate: o.rates.attendees_per_registration_headline_including_walkins, pct: pct2(o.rates.attendees_per_registration_headline_including_walkins), numerator: o.attended_people, denominator: o.registered_people, note: 'Includes walk-ins; NOT the registered show-up rate.' },
          target_in_effect: snap.target, target_progress: snap.target_progress ?? null,
          budget_cap_headroom_inr: snap.target ? Number(snap.target.marketing_budget_inr) - o.marketing_spend_inr : null,
          note: 'Overall identified includes walk-ins; campaign rows are first-touch cohorts.',
        };
      }
      const v = snap.campaigns![cid];
      if (!v) throw new ToolError('UNKNOWN_CAMPAIGN', `Campaign ${cid} not found`);
      const view: any = (v as any)[attr];
      if (attr === 'checkin_source') {
        return { ...base, scope: cid, campaign_name: v.campaign_name, checkin_source: view, note: 'Check-in source attributes each visitor to the campaign on their earliest verified admission.' };
      }
      return { ...base, scope: cid, campaign_name: v.campaign_name, ...stageBlock(view as GroupMetrics), note: 'Attribution is observational, not causal.' };
    },
  },
  {
    name: 'get_targets',
    description: 'Targets: the version in effect at the as-of date (launch plan until 14 Mar, revised from 15 Mar 09:00 IST), all versions, progress vs each goal (actual, goal, gap, fraction) and budget headroom.',
    schema: z.object({ as_of: AsOf }),
    run: (env, a) => {
      const asOf = resolveAsOf(env, a.as_of);
      const t = targetsView(env.ds, asOf);
      return { ...meta(env, 'get_targets', asOf, UNITS), target_in_effect: t.in_effect, versions: t.versions, progress: t.progress, budget: t.budget };
    },
  },
  {
    name: 'compare_campaigns',
    description: 'Rank campaigns on one metric (attribution view selectable). Returns value with numerator/denominator, status and Scale/Change/Stop recommendation. Attribution is observational: say so. Excludes Unattributed and null values.',
    schema: z.object({
      as_of: AsOf,
      metric: z.enum(['visitor_cpa', 'registration_cpa', 'registered_show_up', 'confirmed_show_up', 'registrations', 'visitors', 'confirmed_no_shows', 'ctr', 'registered_per_identified', 'confirmed_per_registered', 'net_spend']),
      attribution: AttributionZ, order: z.enum(['asc', 'desc']).optional(), campaign_ids: z.array(z.string()).optional(),
    }),
    run: (env, a) => {
      const asOf = resolveAsOf(env, a.as_of), attr = attrOf(env, a.attribution);
      const snap = snapshot(env.ds, asOf);
      const recs = Object.fromEntries(recommendCampaigns(env.ds, asOf, env.rules).map((r) => [r.campaign_id, r]));
      const only = a.campaign_ids?.length ? new Set(a.campaign_ids.map((c: string) => resolveCampaign(env, c))) : null;
      const rows: any[] = [], excluded: string[] = [];
      for (const [cid, v] of Object.entries(snap.campaigns!)) {
        if (cid === UNATTR || (only && !only.has(cid))) continue;
        let value: number | null, num: number | null = null, den: number | null = null, unit = 'INR';
        if (attr === 'checkin_source') {
          const c = v.checkin_source;
          if (a.metric === 'visitors') { value = c.attended_people; unit = 'people'; }
          else if (a.metric === 'visitor_cpa') { value = c.cpa_per_attendee_inr; num = v.first_touch.marketing_spend_inr; den = c.attended_people; }
          else throw new ToolError('UNSUPPORTED_COMBINATION', `Metric ${a.metric} is not available in the check-in-source view`, 'Use visitors or visitor_cpa, or choose first_touch / registration_source.');
        } else {
          const m = (v as any)[attr] as GroupMetrics, r = m.rates;
          switch (a.metric) {
            case 'visitor_cpa': value = r.cpa_per_attendee_inr; num = m.marketing_spend_inr; den = m.attended_people; break;
            case 'registration_cpa': value = r.cpa_per_registration_inr; num = m.marketing_spend_inr; den = m.registered_people; break;
            case 'registered_show_up': value = r.registered_show_up; num = m.registered_and_attended_people; den = m.registered_people; unit = 'fraction'; break;
            case 'confirmed_show_up': value = r.confirmed_show_up; num = m.confirmed_and_attended_people; den = m.confirmed_people; unit = 'fraction'; break;
            case 'registrations': value = m.registered_people; unit = 'people'; break;
            case 'visitors': value = m.attended_people; unit = 'people'; break;
            case 'confirmed_no_shows': value = m.confirmed_people - m.confirmed_and_attended_people; num = m.confirmed_and_attended_people; den = m.confirmed_people; unit = 'people'; break;
            case 'ctr': value = r.clicks_per_impression; num = m.clicks; den = m.impressions; unit = 'fraction (observations, directional)'; break;
            case 'registered_per_identified': value = r.registered_among_identified_people; num = m.registered_people; den = m.identified_external_people; unit = 'fraction'; break;
            case 'confirmed_per_registered': value = r.confirmed_among_registered_people; num = m.confirmed_people; den = m.registered_people; unit = 'fraction'; break;
            default: value = m.marketing_spend_inr;
          }
        }
        if (value === null) { excluded.push(cid); continue; }
        const rec = recs[cid];
        rows.push({ campaign_id: cid, name: v.campaign_name, value, pct: unit.startsWith('fraction') ? pct2(value) : undefined, unit, numerator: num, denominator: den, status: rec?.status, recommendation: rec?.decision });
      }
      const defaultDesc = !['visitor_cpa', 'registration_cpa'].includes(a.metric);
      const desc = a.order ? a.order === 'desc' : defaultDesc;
      rows.sort((x, y) => (desc ? y.value - x.value : x.value - y.value));
      return {
        ...meta(env, 'compare_campaigns', asOf, UNITS, attr), metric: a.metric, order: desc ? 'desc' : 'asc',
        ranked: rows.map((r, i) => ({ rank: i + 1, ...r })), excluded_null: excluded,
        caveat: 'Observational attribution by campaign, not causal incrementality (no experiment assignment in the data). Cost uses net spend including credits.',
        decision_mode: mode(env.ds, asOf),
      };
    },
  },
  {
    name: 'get_trend',
    description: 'Time series for a metric (weekly Mon–Sun weeks, partial first week, or daily up to 31 days), overall or per campaign (first-touch), with numerator/denominator for ratios and the 3 biggest period-over-period changes under a minimum-volume rule. Use for "what happened in week X" questions. Causes are NOT in the data.',
    schema: z.object({
      metric: z.enum(['registrations', 'identified', 'confirmed_net', 'visitors', 'clicks', 'spend', 'registrations_per_click']),
      campaign_id: CampaignId, granularity: z.enum(['day', 'week']).optional(), from: AsOf, through: AsOf,
      include_partial_in_ranking: z.boolean().optional().describe('Default false: partial periods (fewer than 7 days, e.g. the running week at the as-of cutoff) are listed but not ranked in biggest_changes.'),
    }),
    run: (env, a) => {
      // default cutoff = the conversation's as-of date (never future data); an explicit `through` wins
      const from = resolveAsOf(env, a.from ?? env.covStart), through = resolveAsOf(env, a.through ?? env.context.asOf ?? env.covEnd);
      const cid = resolveCampaign(env, a.campaign_id ?? env.context.campaignId);
      const gran = a.granularity ?? 'week';
      type Inc = { regs: number; ident: number; confnet: number; vis: number; clicks: number; spend: number };
      const incOf = (cur: any, prev: any): Inc => ({
        regs: cur.registered_people - prev.registered_people, ident: cur.identified_external_people - prev.identified_external_people,
        confnet: cur.confirmed_people - prev.confirmed_people, vis: cur.attended_people - prev.attended_people,
        clicks: cur.clicks - prev.clicks, spend: cur.marketing_spend_inr - prev.marketing_spend_inr,
      });
      const pick = (s: Snapshot) => (cid ? (s.campaigns![cid]!.first_touch as GroupMetrics) : s.overall);
      const periods: { end: string; from: string; days: number; partial: boolean; inc: Inc }[] = [];
      if (gran === 'week') {
        // date-bounded Mon–Sun periods; both edges are clipped to [from, through] (same boundaries/increments as the Diagnose weekly series)
        for (let start = from; start <= through;) {
          const end = [addDays(start, 6 - weekdayMon0(start)), through].sort()[0]!;
          const days = diffDays(end, start) + 1;
          periods.push({ from: start, end, days, partial: days < 7, inc: incOf(pick(snapshot(env.ds, end)), pick(snapshot(env.ds, addDays(start, -1)))) });
          start = addDays(end, 1);
        }
      } else {
        if (diffDays(through, from) > 31) throw new ToolError('RANGE_TOO_LARGE', 'Daily granularity is limited to 31 days', 'Use granularity=week or narrow from/through.');
        let prev = pick(snapshot(env.ds, addDays(from, -1) < env.covStart ? from : addDays(from, -1)));
        for (let d = from; d <= through; d = addDays(d, 1)) {
          const cur = pick(snapshot(env.ds, d));
          periods.push({ end: d, from: d, days: 1, partial: false, inc: incOf(cur, prev) });
          prev = cur;
        }
      }
      const val = (i: Inc) => ({ registrations: i.regs, identified: i.ident, confirmed_net: i.confnet, visitors: i.vis, clicks: i.clicks, spend: i.spend, registrations_per_click: ratio(i.regs, i.clicks) } as Record<string, number | null>)[a.metric] ?? null;
      const series = periods.map((p) => ({
        period_start: p.from, period_end: p.end, days: p.days, partial: p.partial, value: val(p.inc),
        ...(a.metric === 'registrations_per_click' ? { pct: pct2(val(p.inc)), numerator: p.inc.regs, denominator: p.inc.clicks } : {}),
        ...(a.metric === 'registrations' ? { clicks_in_period: p.inc.clicks } : {}),
      }));
      const fmtVal = (p: (typeof series)[number]) => (a.metric === 'registrations_per_click' ? (p as any).pct ?? 'n/a' : String(p.value));
      // every period in order, as quotable text: lets the answer cite the values before, at AND after a break without dropping any
      const series_text = series.map((p) => `${p.period_start}→${p.period_end}: ${fmtVal(p)}${a.metric === 'registrations' ? ` (${(p as any).clicks_in_period} clicks)` : ''}${p.partial ? ` [partial, ${p.days} d]` : ''}`);
      const changes: any[] = [], rankable = a.include_partial_in_ranking ? periods : periods.filter((p) => !p.partial);
      for (let i = 1; i < rankable.length; i++) {
        const a0 = rankable[i - 1]!, a1 = rankable[i]!, v0 = val(a0.inc), v1 = val(a1.inc);
        if (v0 === null || v1 === null || a0.end !== addDays(a1.from, -1)) continue; // only adjacent periods are compared
        const volOk = a.metric === 'registrations_per_click' ? a0.inc.clicks >= 300 && a1.inc.clicks >= 300 : Math.max(Math.abs(v0), Math.abs(v1)) >= (a.metric === 'spend' ? 1000 : 30);
        if (!volOk) continue;
        changes.push({ from_period_end: a0.end, to_period_end: a1.end, from: v0, to: v1, delta: v1 - v0, from_detail: a0.inc.clicks ? { regs: a0.inc.regs, clicks: a0.inc.clicks } : undefined, to_detail: { regs: a1.inc.regs, clicks: a1.inc.clicks } });
      }
      changes.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
      return {
        ...meta(env, 'get_trend', through, { value: a.metric === 'spend' ? 'INR' : 'people / fraction' }, 'first_touch'),
        metric: a.metric, scope: cid ?? 'overall', granularity: gran, cutoff: through, series, series_text, biggest_changes: changes.slice(0, 3),
        ranking_note: a.include_partial_in_ranking ? 'Partial periods are included in the ranking (not like-for-like).' : 'Partial periods (days < 7, flagged partial=true) are shown in series but excluded from biggest_changes.',
        caveat: 'Cause not in data: landing page, cohort lag and posting schedule are hypotheses, not findings.',
      };
    },
  },
  {
    name: 'diagnose_bottlenecks',
    description: 'Ranked findings (stage leakage by campaign, portfolio gaps, trend breaks, budget, target gap) with evidence and suggested action, plus per-campaign confirmed no-shows and Scale/Change/Stop recommendations. Use for "biggest bottleneck / why did we miss target".',
    schema: z.object({ as_of: AsOf }),
    run: (env, a) => {
      const asOf = resolveAsOf(env, a.as_of);
      const snap = snapshot(env.ds, asOf);
      const findings = diagnose(env.ds, asOf);
      const gaps = Object.entries(snap.campaigns!).filter(([k]) => k !== UNATTR).map(([k, v]) => ({
        campaign_id: k, name: v.campaign_name, confirmed: v.first_touch.confirmed_people, confirmed_and_attended: v.first_touch.confirmed_and_attended_people,
        confirmed_no_shows: v.first_touch.confirmed_people - v.first_touch.confirmed_and_attended_people, registered_show_up: v.first_touch.rates.registered_show_up,
        confirmed_show_up: v.first_touch.rates.confirmed_show_up,
      })).sort((x, y) => y.confirmed_no_shows - x.confirmed_no_shows);
      const o = snap.overall;
      const portfolio = {
        confirmed_no_shows_overall: gaps.reduce((s, g) => s + g.confirmed_no_shows, 0),
        campaign_identified_not_registered: o.identified_external_people - o.attended_unregistered_people - gaps.reduce((s, g) => s + (snap.campaigns![g.campaign_id]!.first_touch.registered_people), 0),
        walk_ins: o.attended_unregistered_people,
      };
      return {
        ...meta(env, 'diagnose_bottlenecks', asOf, UNITS, 'first_touch'), mode: mode(env.ds, asOf), findings: findings.slice(0, 14), per_campaign_gaps: gaps, portfolio,
        recommendations: recommendCampaigns(env.ds, asOf, env.rules).map((r) => ({ campaign_id: r.campaign_id, name: r.campaign_name, decision: r.decision, status: r.status, fired: r.fired })),
        caveat: 'Attribution is observational; causes are hypotheses.',
      };
    },
  },
  {
    name: 'data_quality',
    description: 'Data-quality facts: duplicate rows removed per table, reconciliation from raw check-in rows to unique verified visitors, denied/pending/non-external check-ins, scanner vs manual verification, cancelled-then-reconfirmed, unattributed rows, credits (negative spend), orphans.',
    schema: z.object({}),
    run: (env) => {
      const dq: any = dataQuality(env.ds);
      const asOf = env.covEnd;
      const snap = snapshot(env.ds, asOf);
      const ck = env.ds.checkins;
      const verified = (r: any) => r.result === 'admitted' && r.verification === 'verified';
      const raw = dq.tables['Check-ins'];
      const external = ck.filter((r) => env.ds.externalIds.has(r.person_id) && verified(r)).length;
      const nonExternal = ck.filter((r) => !env.ds.externalIds.has(r.person_id) && verified(r)).length;
      const denied = ck.filter((r) => r.result === 'denied').length, pending = ck.filter((r) => r.result === 'pending').length;
      return {
        ...meta(env, 'data_quality', asOf, { rows: 'rows', people: 'unique people' }),
        duplicates_removed_per_table: Object.fromEntries(Object.entries(dq.tables).map(([k, v]: any) => [k, v.duplicate_extra_rows])),
        checkin_reconciliation: {
          raw_rows: raw.raw_rows, unique_rows_after_dedupe: raw.unique_rows, duplicate_retries_removed: raw.duplicate_extra_rows,
          denied: denied, pending: pending, verified_admitted_non_external: nonExternal, verified_admitted_external_events: external,
          unique_verified_external_visitors: snap.overall.attended_people,
          chain: `${raw.raw_rows} rows → ${raw.unique_rows} unique → ${external} verified external events → ${snap.overall.attended_people} people`,
        },
        walk_ins: snap.overall.attended_unregistered_people,
        verification_sources_external_people: dq.verification_sources_external_people,
        cancelled_then_reconfirmed_count: dq.cancelled_then_reconfirmed_count, cancelled_then_reconfirmed_examples: (dq.cancelled_then_reconfirmed_examples ?? []).slice(0, 3),
        people_with_multiple_attempts_external: dq.people_with_multiple_attempts_external, people_with_multiple_verified_attempts_external: dq.people_with_multiple_verified_attempts_external,
        unattributed: { checkin_events: dq.unattributed_checkin_events, unique_checkin_people: dq.unattributed_unique_checkin_people, verified_external_events: dq.verified_external_unattributed_checkin_events, verified_external_people: dq.verified_external_unattributed_checkin_people },
        people_by_type: dq.people_by_type, registrations_by_type: dq.registrations_by_type,
        negative_daily_net_spend_rows: dq.negative_daily_net_spend_rows, registration_history_simultaneous_version_pairs: dq.registration_history_simultaneous_version_pairs,
        checkin_before_event_start: dq.checkin_before_event_start, checkin_after_event_end: dq.checkin_after_event_end,
        orphan_foreign_keys: Object.fromEntries(Object.entries(dq.orphan_foreign_keys).map(([t, f]: any) => [t, Object.values(f).reduce((s: number, x: any) => s + (x.rows ?? 0), 0)])),
        engagement_events_by_type: dq.engagement_events_by_type,
      };
    },
  },
  {
    name: 'get_spend_ledger',
    description: 'Net marketing spend (credits are negative postings), gross positive spend, the list of credits, and headroom vs the budget cap at an as-of date; also net at event close and data close checkpoints. Use for spend / budget / credit questions.',
    schema: z.object({ campaign_id: CampaignId, from: AsOf, through: AsOf, only_credits: z.boolean().optional() }),
    run: (env, a) => {
      const through = resolveAsOf(env, a.through), from = a.from ? resolveAsOf(env, a.from) : env.covStart;
      const cid = resolveCampaign(env, a.campaign_id);
      const rows = env.ds.daily.filter((r) => (!cid || (cid === UNATTR ? r.campaign_id === null : r.campaign_id === cid)));
      const inRange = rows.filter((r) => r.activity_date >= from && r.activity_date <= through);
      const credits = rows.filter((r) => r.marketing_spend_inr < 0 && r.activity_date <= through).map((r) => ({ activity_id: r.activity_id, date: r.activity_date, campaign_id: r.campaign_id, campaign: env.ds.campaigns[r.campaign_id ?? '']?.campaign_name, amount: r.marketing_spend_inr }));
      const netAt = (d: string) => rows.filter((r) => r.activity_date <= d).reduce((s, r) => s + r.marketing_spend_inr, 0);
      const cap = (d: string) => { const t = snapshot(env.ds, d, false).target; return t ? Number(t.marketing_budget_inr) : null; };
      const cp = (label: string, d: string) => { const c = cap(d), n = snapshot(env.ds, d, false).overall.marketing_spend_inr; return { label, date: d, net_spend_inr: cid ? netAt(d) : n, event_net_spend_overall_inr: n, cap_inr: c, headroom_inr: c === null ? null : c - n }; };
      const eventClose = istDate(env.ds.eventMs.endsAt);
      const credit_list = a.only_credits ? credits : credits;
      return {
        ...meta(env, 'get_spend_ledger', through, { spend: 'INR' }),
        scope: cid ?? 'overall', range: { from, through },
        net_spend_inr: inRange.reduce((s, r) => s + r.marketing_spend_inr, 0),
        gross_positive_spend_inr: inRange.reduce((s, r) => s + Math.max(0, r.marketing_spend_inr), 0),
        credits_total_inr: inRange.reduce((s, r) => s + Math.min(0, r.marketing_spend_inr), 0),
        credits: credit_list,
        cap_inr: cap(through), headroom_inr: (() => { const c = cap(through); return c === null ? null : c - snapshot(env.ds, through, false).overall.marketing_spend_inr; })(),
        checkpoints: [cp('event close', eventClose), cp('data close', env.covEnd)],
        note: 'Net spend includes credits (negative postings). Headroom is overall net spend vs the target-version cap in effect.',
      };
    },
  },
  {
    name: 'get_attendance',
    description: 'Attendance by event day (verified admission events, distinct visitors, new vs returning), scanner vs manual verification, walk-ins (attended without registration) and unique visitors in total.',
    schema: z.object({}),
    run: (env) => {
      const days = attendanceByDay(env.ds);
      const dq: any = dataQuality(env.ds);
      const snap = snapshot(env.ds, env.covEnd);
      return {
        ...meta(env, 'get_attendance', env.covEnd, { people: 'unique external people', events: 'verified admission events' }),
        by_day: Object.entries(days).map(([date, d]) => ({ date, weekday: new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }), events: d.external_verified_admission_events, distinct_visitors: d.unique_external_visitors_on_day, new: d.new_unique_external_visitors_since_prior_days, returning: d.returning_unique_external_visitors })),
        unique_visitors_total: snap.overall.attended_people,
        walk_ins_attended_without_registration: snap.overall.attended_unregistered_people,
        verification_sources_external_people: dq.verification_sources_external_people,
        note: 'scanner_total counts people with ≥1 scanner verification; manual_only are people verified only by manual entry.',
      };
    },
  },
  {
    name: 'lookup_registration',
    description: 'Look up one registration or person: person type and first touch, registration, the full status history (versions with effective times, IST), and check-ins. Provide registration_id (e.g. R0001) or person_id (e.g. E0001).',
    schema: z.object({ registration_id: z.string().optional(), person_id: z.string().optional() }),
    run: (env, a) => {
      let reg = a.registration_id ? env.ds.regsById.get(a.registration_id.trim().toUpperCase()) : undefined;
      let pid: string | undefined = a.person_id?.trim().toUpperCase() ?? reg?.person_id;
      if (!reg && pid) reg = env.ds.regs.find((r) => r.person_id === pid);
      if (!reg && !pid) throw new ToolError('NOT_FOUND', 'No registration or person found', 'Provide a valid registration_id (R0001) or person_id.');
      pid = pid ?? reg?.person_id;
      const person = env.ds.peopleById.get(pid!);
      if (!person) throw new ToolError('NOT_FOUND', `Person ${pid} not found`);
      const strip = ({ t, ...r }: any) => r;
      const hist = reg ? env.ds.history.filter((h) => h.registration_id === reg!.registration_id).map(strip) : [];
      const ck = env.ds.checkins.filter((c) => c.person_id === pid).map(strip);
      return {
        ...meta(env, 'lookup_registration', env.covEnd, { time: 'IST (+05:30)' }),
        person: { person_id: person.person_id, person_type: person.person_type, first_seen_at: person.first_seen_at, first_touch_source: (person as any).first_touch_source, first_campaign_id: person.first_campaign_id },
        registration: reg ? strip(reg) : null, history_versions: hist, latest_status: hist.at(-1)?.status ?? null,
        distinct_registration_ids_for_person: new Set(env.ds.regs.filter((r) => r.person_id === pid).map((r) => r.registration_id)).size,
        checkins: ck,
      };
    },
  },
  {
    name: 'list_campaigns',
    description: 'Campaign management records: status (active/paused/stopped), owner, plan budget for next edition, notes, plus net spend and the current Scale/Change/Stop recommendation at the as-of date.',
    schema: z.object({ status: z.enum(['active', 'paused', 'stopped']).optional(), as_of: AsOf }),
    run: (env, a) => {
      const asOf = resolveAsOf(env, a.as_of);
      const recs = Object.fromEntries(recommendCampaigns(env.ds, asOf, env.rules).map((r) => [r.campaign_id, r]));
      const snap = snapshot(env.ds, asOf);
      const rows = Object.values(env.ds.campaigns).map((c: any) => ({
        campaign_id: c.campaign_id, name: c.campaign_name, channel: c.channel, owner: c.owner_name, status: c.status ?? 'active', plan_budget_inr: c.plan_budget_inr ?? null,
        notes: c.notes ?? null, net_spend_inr: snap.campaigns![c.campaign_id]?.first_touch.marketing_spend_inr, recommendation: recs[c.campaign_id]?.decision,
      })).filter((r) => !a.status || r.status === a.status);
      const notActive = rows.filter((r) => r.status !== 'active').map((r) => ({ campaign_id: r.campaign_id, name: r.name, status: r.status }));
      return { ...meta(env, 'list_campaigns', asOf, { spend: 'INR' }), campaigns: rows, active_campaign_ids: rows.filter((r) => r.status === 'active').map((r) => r.campaign_id),
        not_active: notActive, status_note: notActive.length ? `NOT active (name them with their status when listing active campaigns): ${notActive.map((n) => `${n.name} is ${n.status}`).join('; ')}.` : 'All campaigns are active.',
        plan_budget_total_inr: rows.reduce((s, r) => s + Number(r.plan_budget_inr ?? 0), 0) };
    },
  },
  {
    name: 'list_tasks',
    description: 'Tasks on the Execution board. Default shows open tasks (not done). Filter by status (todo, in_progress, blocked, done, open, all), campaign, owner; overdue_as_of marks tasks due before that date.',
    schema: z.object({
      status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'open', 'all']).optional(), campaign_id: CampaignId, owner_id: z.string().optional(),
      overdue_as_of: z.string().optional(), limit: z.number().max(50).optional(),
    }),
    run: async (env, a) => {
      const cid = resolveCampaign(env, a.campaign_id), owner = await resolveOwner(env, a.owner_id);
      const st = a.status ?? 'open', names = new Map(env.mgmt.team.map((m) => [m.owner_id, m.name]));
      const rows = env.mgmt.tasks
        .filter((t: any) => (st === 'open' ? t.status !== 'done' : st === 'all' || t.status === st) && (!cid || cid === UNATTR || t.campaign_id === cid) && (!owner || t.owner_id === owner))
        .sort((x: any, y: any) => (x.due_date === y.due_date ? x.id - y.id : x.due_date === null ? 1 : y.due_date === null ? -1 : x.due_date < y.due_date ? -1 : 1))
        .slice(0, Math.min(a.limit ?? 30, 50))
        .map((t: any) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date, campaign_id: t.campaign_id, owner_id: t.owner_id, owner_name: t.owner_id ? names.get(t.owner_id) ?? null : null, bet_id: t.bet_id, experiment_id: t.experiment_id, insight_id: t.insight_id, created_via: t.created_via }));
      return { ...meta(env, 'list_tasks', a.overdue_as_of ?? null, { due_date: 'YYYY-MM-DD' }), count: rows.length, tasks: rows.map((r: any) => ({ ...r, overdue: a.overdue_as_of && r.due_date && r.status !== 'done' ? r.due_date < a.overdue_as_of : undefined })), note: 'Seeded task dates are for the next edition (2026 planning window).' };
    },
  },
  {
    name: 'list_experiments',
    description: 'Planned experiments with thresholds: primary KPI, scale / change / stop rules, guardrails, readout date, status, observed value and decision. Filter by status or bet (B1..B5).',
    schema: z.object({ status: z.string().optional(), bet_id: z.string().optional() }),
    run: async (env, a) => {
      const betName = new Map(env.mgmt.bets.map((b: any) => [b.id, b.name]));
      const rows = env.mgmt.experiments
        .filter((e: any) => (!a.status || e.status === a.status) && (!a.bet_id || e.bet_id === a.bet_id.toUpperCase()))
        .map(({ observation: _o, ...e }: any) => ({ ...e, bet_name: betName.get(e.bet_id) ?? null }));
      return { ...meta(env, 'list_experiments', null, { thresholds: 'unit per kpi_unit' }), experiments: rows, note: 'Thresholds are planning rules for the next edition; none has run yet unless status says so.' };
    },
  },
  {
    name: 'get_projection',
    description: 'HISTORICAL event-end forecast shown on the Overview page: low/mid/high projected unique verified visitors (and registrations) at event close, computed as of a past date from active campaigns\' trailing 7/14/28-day registration rates × show-up assumptions + walk-ins, with current registrations, days left, per-campaign status (paused/stopped campaigns add nothing) and assumptions. Use for "will we hit / what is the forecast / projected visitors for the event" and for "what does pausing X do to the forecast". Observed actuals are never changed. NOT the next-edition plan (use get_strategy_model for that).',
    schema: z.object({ as_of: AsOf }),
    run: (env, a) => {
      const asOf = resolveAsOf(env, a.as_of);
      const p = projectVisitors(env.ds, asOf, env.assumptions);
      return {
        ...meta(env, 'get_projection', asOf, { visitors: 'unique verified visitors', registrations: 'unique registered people' }),
        label: p.label, mode: p.mode, rate_windows_days: [7, 14, 28], days_left: p.days_left, current_registered: p.current_registered,
        visitors: p.visitors, registrations: p.registrations, campaigns: p.campaigns, assumptions: p.assumptions,
        active_campaigns: p.campaigns.filter((c) => c.status !== 'paused' && c.status !== 'stopped').map((c) => c.campaign_id),
        paused_or_stopped_campaigns: p.campaigns.filter((c) => c.status === 'paused' || c.status === 'stopped').map((c) => ({ campaign_id: c.campaign_id, status: c.status })),
        observed_actuals: { actuals_changed_by_management_status: false, statement: 'Observed actuals are unchanged by a campaign status change; only the forecast band moves (paused/stopped campaigns add nothing to it).' },
        note: p.mode === 'actual' ? 'The event has ended: projection equals the observed actual.' : 'Forecast for the dataset\'s historical event (2025), an ASSUMPTION-based band; not evidence and not the 2026 plan.',
      };
    },
  },
  {
    name: 'get_strategy_model',
    description: 'NEXT-EDITION (2026) planning only: strategy model (base 2,400 / stretch 2,850): reference carry-forward, five ranked bets with formulas and visitors, registrations → confirmed → registered visitors → walk-ins → total, spend/reserve vs cap, CPA, sensitivity and capacity, with every assumption tagged S (sourced) / A (assumption) / D (dataset). This is a PLAN, not evidence.',
    schema: z.object({ scenario: z.enum(['base', 'stretch', 'both']).optional() }),
    run: async (env, a) => {
      const m = liveStrategy(env);
      const sc = a.scenario ?? 'both';
      const pick = (r: typeof m.base) => ({
        scenario: r.scenario, headline_visitors: r.headline, raw_total: r.total, registrations: r.registrations, confirmed: r.confirmed, registered_visitors: r.registered_visitors,
        reference: { spend_inr: r.reference.spend, registrations: r.reference.registered, confirmed: r.reference.confirmed, visitors: r.reference.visitors },
        bets: r.bets.map((b) => ({ id: b.id, kind: b.kind, extra_regs: b.extra_regs, visitors: b.visitors, budget_inr: b.budget, formula: b.formula })),
        acquisition_visitors: r.acquisition_visitors, reminder_visitors: r.reminder_visitors, walk_ins: r.walkins,
        spend_inr: r.spend, bets_spend_inr: r.bets_spend, reserve_inr: r.reserve, cap_inr: r.cap, cpa: r.cpa, reach: r.reach, capacity: r.capacity,
      });
      const bets = env.mgmt.bets;
      const scores = scoreBets(bets.map((b) => ({ id: b.id, impact: b.impact, confidence: b.confidence, ease: b.ease })));
      return {
        ...meta(env, 'get_strategy_model', null, { spend: 'INR', visitors: 'unique verified visitors' }),
        label: 'PLAN / ASSUMPTIONS — not evidence', ...(sc !== 'stretch' ? { base: pick(m.base) } : {}), ...(sc !== 'base' ? { stretch: pick(m.stretch) } : {}),
        reconciliation: m.reconciliation, sensitivity_downside: m.sensitivity, growth_vs_2025: m.growth_vs_2025,
        bet_scores: scores.map((s) => ({ id: s.id, name: bets.find((b) => b.id === s.id)?.name, score: s.score })), score_weights: 'impact 50% · confidence 30% · ease 20%',
        assumptions: env.assumptions.filter((x) => sc === 'both' || x.scenario === sc || x.scenario === 'all').map((x) => ({ key: x.key, scenario: x.scenario, value: x.value, unit: x.unit, tag: x.kind === 'sourced' ? 'S' : x.kind === 'data' ? 'D' : 'A', label: x.label })),
        caveats: ['Marginal returns of new channels are unmeasured', 'Capacity ≤1,800 distinct/day', 'Benchmarks come from different contexts'],
      };
    },
  },
  {
    name: 'what_if',
    description: 'SCENARIO ONLY, never persists. kind=budget_shift moves amount_inr between two campaigns at historical average CPA (visitor CPA post-event; registration CPA × show-up pre-event; method=diminishing applies a marginal-efficiency haircut to the receiving campaign). kind=assumption_change re-runs the strategy model with one assumption changed. Always label output as a scenario, not evidence.',
    schema: z.object({
      kind: z.enum(['budget_shift', 'assumption_change']), from_campaign_id: z.string().optional(), to_campaign_id: z.string().optional(),
      amount_inr: z.number().int().positive().max(300000).optional(), assumption_key: z.string().optional(), assumption_value: z.number().optional(),
      as_of: AsOf, method: z.enum(['average_cpa', 'diminishing']).optional(),
    }),
    run: (env, a) => {
      const asOf = resolveAsOf(env, a.as_of);
      if (a.kind === 'assumption_change') {
        if (!a.assumption_key || a.assumption_value === undefined) throw new ToolError('MISSING_ARGS', 'assumption_key and assumption_value are required', 'Call get_strategy_model to see assumption keys.');
        if (!env.assumptions.some((x) => x.key === a.assumption_key)) throw new ToolError('UNKNOWN_ASSUMPTION', `No assumption ${a.assumption_key}`, `Keys: ${[...new Set(env.assumptions.map((x) => x.key))].join(', ')}`);
        const changed = env.assumptions.map((x) => (x.key === a.assumption_key ? { ...x, value: a.assumption_value! } : x));
        const before = liveStrategy(env), after = liveStrategy(env, changed);
        return {
          ...meta(env, 'what_if', asOf, { visitors: 'unique verified visitors' }), label: 'SCENARIO — not evidence', kind: a.kind, assumption: { key: a.assumption_key, new_value: a.assumption_value },
          before: { base: before.base.total, stretch: before.stretch.total }, after: { base: after.base.total, stretch: after.stretch.total },
          delta: { base: after.base.total - before.base.total, stretch: after.stretch.total - before.stretch.total }, caveats: ['assumption-driven; marginal returns unmeasured'],
        };
      }
      if (!a.from_campaign_id || !a.to_campaign_id || !a.amount_inr) throw new ToolError('MISSING_ARGS', 'from_campaign_id, to_campaign_id and amount_inr are required for budget_shift');
      const from = resolveCampaign(env, a.from_campaign_id)!, to = resolveCampaign(env, a.to_campaign_id)!;
      if (from === UNATTR || to === UNATTR) throw new ToolError('INVALID_CAMPAIGN', 'Unattributed cannot receive or give budget');
      const me = lookup(env.assumptions, 'marginal_efficiency', 'base'), showUp = lookup(env.assumptions, 'showup_mid', 'base');
      const r = whatIfShift(env.ds, { from, to, amount: a.amount_inr, asOf, method: a.method, marginalEfficiency: me, showUp });
      if (r.error) throw new ToolError('WHATIF_UNAVAILABLE', r.error);
      return { ...meta(env, 'what_if', asOf, { visitors: 'unique verified visitors', amount: 'INR' }), kind: a.kind, from, from_name: env.ds.campaigns[from]?.campaign_name, to, to_name: env.ds.campaigns[to]?.campaign_name, ...r, net_visitors_rounded: Math.round(r.net), persisted: false };
    },
  },
  {
    name: 'calculate',
    description: 'Safe arithmetic calculator (numbers, + - * / % ^ ( ), min, max, round, sqrt, abs). Use for ANY derived number (differences, ratios, hypothetical CPAs) so that figures are traceable.',
    schema: z.object({ expression: z.string().max(200) }),
    run: (env, a) => {
      const r = calc(a.expression);
      if ('error' in r) throw new ToolError('CALC_ERROR', r.error, 'Use only numbers, + - * / % ^, parentheses, min/max/round/sqrt/abs.');
      return { ...meta(env, 'calculate', null, {}), expression: a.expression, value: r.value };
    },
  },
  {
    name: 'describe_data',
    description: 'What data exists (tables/fields from the field guide, optionally filtered by topic) and what it CANNOT answer (KNOWN_MISSING: revenue, demographics, cancellation reasons, incrementality, unique reach, etc.). Call before answering anything that may not be in the data.',
    schema: z.object({ topic: z.string().optional() }),
    run: (env, a) => {
      const guide = env.ds.fieldGuide as any[];
      const t = a.topic?.toLowerCase();
      const hit = t ? guide.filter((g) => `${g.source_table} ${g.field} ${g.meaning}`.toLowerCase().includes(t)) : [];
      const tables: Record<string, string[]> = {};
      for (const g of guide) (tables[String(g.source_table)] ??= []).push(String(g.field));
      const snap = snapshot(env.ds, env.covEnd, false);
      return {
        ...meta(env, 'describe_data', env.covEnd, {}), coverage: { from: env.covStart, to: env.covEnd, timezone: 'IST', currency: 'INR' },
        tables, ...(t ? { topic: a.topic, matching_fields: hit.slice(0, 20), topic_matches_known_missing: KNOWN_MISSING.filter((m) => m.toLowerCase().includes(t)) } : {}),
        KNOWN_MISSING: KNOWN_MISSING,
        definitions: {
          unique_verified_external_visitor: 'External person with ≥1 check-in where result=admitted and verification=verified',
          registered_show_up: 'registered ∩ attended / registered (excludes walk-ins)', reach: 'Non-unique daily sum, not people',
          net_spend: 'Daily marketing spend including negative credits', as_of: 'IST end of day',
        },
        reach_total_nonunique: snap.overall.reported_reach_sum_nonunique,
        closest_available_headline: { unique_verified_visitors: snap.overall.attended_people, registered_people: snap.overall.registered_people, identified_people: snap.overall.identified_external_people, net_spend_inr: snap.overall.marketing_spend_inr },
      };
    },
  },
  {
    name: 'propose_task',
    description: 'Draft a task for the Execution board. Creates a PENDING draft only; nothing is created until the user clicks Confirm. owner_id may be a team member name or id (Aman, Meera, Arjun, Nisha, Dev). due_date YYYY-MM-DD. Only call when the user asks for an action/task. The description may contain only facts from tool results or the user request (no invented figures or dates).',
    mutating: true,
    schema: z.object({
      title: z.string().min(3).max(200), description: z.string().max(2000).optional(), campaign_id: z.string().optional(), owner_id: z.string().optional(),
      due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), priority: z.enum(['p0', 'p1', 'p2']), experiment_id: z.number().int().optional(), bet_id: z.string().optional(),
      insight_id: z.string().optional(),
      evidence: z.array(z.object({ tool: z.string(), metric: z.string(), value: z.union([z.number(), z.string()]) })),
    }),
    run: async (env, a) => {
      const cid = resolveCampaign(env, a.campaign_id);
      const owner = await resolveOwner(env, a.owner_id);
      const payload: Record<string, unknown> = {
        title: a.title, description: a.description ?? null, campaign_id: cid && cid !== UNATTR ? cid : null, owner_id: owner ?? null, due_date: a.due_date ?? null, priority: a.priority,
        experiment_id: a.experiment_id ?? null, bet_id: a.bet_id ?? null, insight_id: a.insight_id ?? null, status: 'todo',
      };
      // evidence is resolved against THIS turn's tool runs: each chip carries the run's own date/revision (never the page date); unresolvable items are flagged unverified
      const evidence = buildEvidence(a.evidence, env.calls);
      let d;
      try { d = await createDraft(env.db, { kind: 'task', payload, evidence, conversation_id: env.conversationId }); }
      catch (e: any) { throw new ToolError('INVALID_DRAFT', e.message ?? String(e), 'Check dates (YYYY-MM-DD) and ids.'); }
      return { ...meta(env, 'propose_task', null, {}), draft_id: d.draft_id, draft_kind: 'task', status: 'pending', payload, evidence: evidence?.items ?? [], evidence_unverified: (evidence?.items ?? []).filter((i) => i.verified === false).length, preview: `Task: ${a.title}${owner ? ` · owner ${owner}` : ''}${a.due_date ? ` · due ${a.due_date}` : ''} · ${a.priority}`, note: 'DRAFT ONLY — nothing is created until the user clicks Confirm.' };
    },
  },
  {
    name: 'propose_campaign_change',
    description: 'Draft a change to a campaign (status active/paused/stopped and/or plan_budget_inr). Creates a PENDING draft only; the user must click Confirm. Only call when the user asks for an action.',
    mutating: true,
    schema: z.object({
      campaign_id: z.string(), status: z.enum(['active', 'paused', 'stopped']).optional(), plan_budget_inr: z.number().int().min(0).max(300000).optional(), reason: z.string().max(500),
      evidence: z.array(z.object({ tool: z.string(), metric: z.string(), value: z.union([z.number(), z.string()]) })),
    }),
    run: async (env, a) => {
      const cid = resolveCampaign(env, a.campaign_id);
      if (!cid || cid === UNATTR) throw new ToolError('INVALID_CAMPAIGN', 'A real campaign id is required');
      if (a.status === undefined && a.plan_budget_inr === undefined) throw new ToolError('MISSING_ARGS', 'Provide status and/or plan_budget_inr');
      const payload: Record<string, unknown> = { campaign_id: cid, reason: a.reason, ...(a.status ? { status: a.status } : {}), ...(a.plan_budget_inr !== undefined ? { plan_budget_inr: a.plan_budget_inr } : {}) };
      const evidence = buildEvidence(a.evidence, env.calls);
      const d = await createDraft(env.db, { kind: 'campaign_update', payload, evidence, conversation_id: env.conversationId });
      return { ...meta(env, 'propose_campaign_change', null, {}), draft_id: d.draft_id, draft_kind: 'campaign_update', status: 'pending', payload, evidence: evidence?.items ?? [], preview: `Campaign ${cid}${a.status ? ` → ${a.status}` : ''}${a.plan_budget_inr !== undefined ? ` · plan budget ₹${a.plan_budget_inr}` : ''}`, note: 'DRAFT ONLY — nothing changes until the user clicks Confirm.' };
    },
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
export const toolByName = (n: string) => TOOLS.find((t) => t.name === n);

/** Run a tool by name with zod validation; errors become typed `{error:{code,message,hint}}` results (never thrown). */
export async function runTool(env: ToolEnv, name: string, rawArgs: unknown, toolCallId?: string): Promise<any> {
  const out = await runToolRaw(env, name, rawArgs);
  // server-issued evidence refs for this call (trusted call history); the model never sees them (see stripEvidence)
  const ce = callEvidence(toolCallId ?? `tc_${env.calls.length + 1}_${name}`, name, out);
  env.calls.push(ce);
  return out && typeof out === 'object' ? { ...out, _evidence: ce } : out;
}

async function runToolRaw(env: ToolEnv, name: string, rawArgs: unknown): Promise<any> {
  const spec = toolByName(name);
  if (!spec) return { tool: name, data_revision: env.meta.data_revision, error: { code: 'UNKNOWN_TOOL', message: `No tool named ${name}`, hint: `Tools: ${TOOL_NAMES.join(', ')}` } };
  const parsed = spec.schema.safeParse(rawArgs ?? {});
  if (!parsed.success) return { tool: name, data_revision: env.meta.data_revision, error: { code: 'BAD_ARGUMENTS', message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), hint: 'Dates are YYYY-MM-DD; fix the arguments and retry.' } };
  try {
    return await spec.run(env, parsed.data);
  } catch (e: any) {
    if (e instanceof ToolError) return { tool: name, data_revision: env.meta.data_revision, error: { code: e.code, message: e.message, hint: e.hint ?? '' } };
    return { tool: name, data_revision: env.meta.data_revision, error: { code: 'INTERNAL', message: String(e?.message ?? e), hint: 'Retry or use another tool.' } };
  }
}

export { projectVisitors, strategyModel, showUpByRegistrationWeek };
