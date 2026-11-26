/** Static strategy content shared by slides, Strategy page, Copilot and README. Numbers come from model.ts, not from here. */
export const BETS = [
  { id: 'B1', rank: 1, name: 'College group passes', impact: 5, confidence: 5, ease: 3, owner_id: 'T03', owner: 'Partnerships lead (Meera Iyer)', start_offset_weeks: 8, end_offset_weeks: 2,
    mechanism: 'Student clubs reserve day slots for their groups, then students confirm individually. 2025 College Partnerships turnout was 85.6%.',
    dependencies: 'Disjoint campuses from B2; slot allocation needs a waitlist.' },
  { id: 'B2', rank: 2, name: 'Campus ambassador leaderboard', impact: 4.5, confidence: 4, ease: 4, owner_id: 'T03', owner: 'Campus lead (Meera Iyer)', start_offset_weeks: 7, end_offset_weeks: 1,
    mechanism: 'Reward verified visitors with capped campus leaderboards and club recognition; ~30–40 reps at 8–9 registrations each.',
    dependencies: 'Runs on campuses outside the B1 treatment; fraud checks on ineligible/duplicate sign-ups.' },
  { id: 'B3', rank: 3, name: 'Tiered friend referrals', impact: 4, confidence: 4, ease: 4, owner_id: 'T06', owner: 'Referral owner (Dev Malhotra)', start_offset_weeks: 5, end_offset_weeks: 1,
    mechanism: 'Unique invite links with rewards unlocked at verified admission, plus student-friendly group perks.',
    dependencies: 'Needs developer time for link attribution; abuse monitoring.' },
  { id: 'B4', rank: 4, name: 'WhatsApp reconfirmation and logistics', impact: 3, confidence: 3.5, ease: 5, owner_id: 'T00', owner: 'Lifecycle owner (Aman Gupta)', start_offset_weeks: 2, end_offset_weeks: 0,
    mechanism: 'Opt-in messages at T−7, T−2 and event morning with one-tap reconfirm/cancel, QR, route and slot. Turnout lever, not acquisition.',
    dependencies: 'Layered on residual no-shows; WhatsApp template approval and opt-in copy.' },
  { id: 'B5', rank: 5, name: 'Paid retargeting after landing-page fix', impact: 2, confidence: 3, ease: 4, owner_id: 'T04', owner: 'Performance owner (Arjun Verma)', start_offset_weeks: 5, end_offset_weeks: 2,
    mechanism: 'Consented warm audiences; exclude registrants; emphasise date, lineup and travel. Pilot only.',
    dependencies: 'Landing-page fix first; second ₹6k tranche released from reserve only on a passed gate.' },
] as const;

export const REJECTED_IDEAS = [
  { id: 'X1', name: 'Creator expansion', mechanism: 'More paid creator collaborations', indicative_visitors: '30–60', indicative_cost: '₹10–16k', decision: 'Hold', reason: '2025 cost was ₹337/visitor at 50% show-up; hold until local tests improve show-up.' },
  { id: 'X2', name: 'Refundable ₹49 deposit', mechanism: 'Refundable reservation deposit on oversubscribed slots', indicative_visitors: '−20 to +30 net', indicative_cost: '₹5–10k', decision: 'Deprioritize', reason: 'Payment friction can reduce reach; test only as a slot-level A/B.' },
  { id: 'X3', name: 'Gamified check-in passport', mechanism: 'Stamp/reward after verified first admission', indicative_visitors: '8–20', indicative_cost: '₹8–12k', decision: 'Low priority', reason: 'Protect ingress throughput; low upside.' },
  { id: 'X4', name: 'Metro shuttle', mechanism: 'Pooled shuttle for campuses with a route gap', indicative_visitors: '15–30', indicative_cost: '₹8–15k', decision: 'Directions everywhere; shuttle only if friction measured', reason: 'Madhavara metro is ~0.5 km from BIEC; route friction not yet measured.' },
  { id: 'X5', name: 'Staged lineup reveal', mechanism: 'Time announcements around group-registration windows', indicative_visitors: '39–90', indicative_cost: '₹8–15k (talent excluded)', decision: 'Bundle into existing channels', reason: 'Attendance lift is a hypothesis; test staged vs single announcement.' },
  { id: 'X6', name: 'Industry workshops', mechanism: 'Partner firms host reservable workshops', indicative_visitors: '52–90', indicative_cost: '₹12–20k', decision: 'Pilot only with a partner', reason: 'Needs a partner and controlled marketing budget.' },
  { id: 'X7', name: 'Search/community intent pages', mechanism: 'Arrival guides and interest landing pages', indicative_visitors: '53–96', indicative_cost: '₹6–12k', decision: 'Kept in reference; first reserve alternative', reason: '2025 Organic Search and Community Groups were ₹72 and ₹97 per visitor.' },
  { id: 'X8', name: 'Broad paid prospecting', mechanism: 'More top-of-funnel paid social', indicative_visitors: '—', indicative_cost: '—', decision: 'Rejected', reason: 'Paid Social was ₹274/visitor at 50% show-up; retargeting only (B5).' },
] as const;

export const EXPERIMENTS = [
  { bet_id: 'B1', name: 'Group-pass slots', hypothesis: 'Group-slot access lifts registrations per activated club without hurting confirmation.', primary_kpi: 'Incremental registrations per activated club (by T−14), confirmed ≥85%', kpi_unit: 'regs/club',
    assignment_unit: 'club (matched, randomised)', min_sample: 15, scale_op: '>=', scale_value: 15, stop_op: '<', stop_value: 8,
    change_rule: '8–14: tighten roster flow', stop_note: 'or modeled incremental visitor cost > ₹180', guardrails: ['confirmed ≥ 85% at T−14', 'incremental visitor cost ≤ ₹180'], risk: 'Clubs over-promise rosters', leading_signal: 'Slots reserved per club' },
  { bet_id: 'B2', name: 'Ambassador leaderboard', hypothesis: 'Attendance-linked leaderboard lifts extra registrations per active rep.', primary_kpi: 'Extra registrations per active rep after 2 weeks, ≥80% confirmed by T−14', kpi_unit: 'regs/rep',
    assignment_unit: 'campus (matched, disjoint from B1)', min_sample: 30, scale_op: '>=', scale_value: 4, stop_op: '<', stop_value: 2,
    change_rule: '2–3: coach reps', stop_note: 'or duplicate/ineligible > 5%', guardrails: ['duplicate/ineligible ≤ 5%', 'confirmed ≥ 80% by T−14'], risk: 'Rep drop-off; gaming', leading_signal: 'Active reps / week' },
  { bet_id: 'B3', name: 'Tiered referrals', hypothesis: 'Two-sided perks lift visit→registration versus share-only.', primary_kpi: 'Visit→registration after 200 qualified visits', kpi_unit: '%',
    assignment_unit: 'seed cluster', min_sample: 200, scale_op: '>=', scale_value: 16, stop_op: '<', stop_value: 10,
    change_rule: '10–15.9%: rework reward/copy', stop_note: 'or abuse > 5%, or > ₹180 per incremental visitor', guardrails: ['abuse ≤ 5%', '≤ ₹180 / incremental visitor'], risk: 'Referral abuse', leading_signal: 'Visit→reg rate' },
  { bet_id: 'B4', name: 'WhatsApp reconfirmation', hypothesis: 'One-tap reconfirmation lifts verified show-up among confirmed registrants.', primary_kpi: 'Reconfirmation at T−2 (delivery ≥90%)', kpi_unit: '%',
    assignment_unit: 'person (stratified ~20% holdout)', min_sample: 1750, scale_op: '>=', scale_value: 55, stop_op: '<', stop_value: 40,
    change_rule: '40–54.9%: change timing/copy', stop_note: 'or opt-out > 2%. Final metric = ITT verified show-up lift; scale next edition at ≥ 4 pp with interval', guardrails: ['delivery ≥ 90%', 'opt-out ≤ 2%'], risk: 'Template approval delay; opt-in volume', leading_signal: 'Reconfirm rate at T−2' },
  { bet_id: 'B5', name: 'Paid retargeting', hypothesis: 'Retargeted warm audiences register incrementally at an acceptable cost.', primary_kpi: 'Incremental reg/click at ≥400 qualified clicks; T−7 confirmation ≥85%', kpi_unit: '%',
    assignment_unit: 'audience (holdout within geo)', min_sample: 400, scale_op: '>=', scale_value: 10, stop_op: '<', stop_value: 6,
    change_rule: '6–9.9%: rework', stop_note: 'or confirmation < 75%, or marginal visitor cost > ₹200. 2nd ₹6k only if forecast ≥ 40 more visitors at ≤ ₹150', guardrails: ['T−7 confirmation ≥ 85%', 'marginal visitor cost ≤ ₹200'], risk: 'Landing-page quality', leading_signal: 'Incremental reg/click' },
] as const;

export const WHY_BENGALURU = [
  { fact: '1,148 colleges in Bengaluru Urban (AISHE 2023–24)', tag: 'S', url: 'https://cdnbbsr.s3waas.gov.in/s392049debbe566ca5782a3045cf300a3c/uploads/2026/07/202607131602421770.pdf#page=36' },
  { fact: '~800,000 higher-education enrolments in the district (private HEIs ~600,000)', tag: 'S', url: 'https://nsearchives.nseindia.com/corporate/Registration_29092025062424_ProjectScholarspaceConsolidatedDRHP.pdf' },
  { fact: 'IIM Bangalore Unmaad: local intercollegiate festival precedent', tag: 'S', url: 'https://www.iimb.ac.in/unmaad-2026' },
  { fact: 'BIEC venue candidate; Madhavara metro ~0.5 km (Green Line)', tag: 'S', url: 'https://www.bengalurutechsummit.com/pdf/BTS-Exhibitor-Manual-9sqm.pdf' },
] as const;

/** What the dataset cannot answer. Shared by Diagnose panel and the Copilot describe_data tool. */
export const KNOWN_MISSING = [
  'Unique (deduplicated) reach — reach is a non-unique daily sum (666,297)',
  'Platform audience overlap', 'Revenue', 'Ticket price / paid vs free', 'Gender, age or other demographics',
  'College or institution of attendees', 'Sponsor data', 'Cancellation reasons', 'Booking group size',
  'Experiment assignment / incrementality (attribution is observational)', 'Individual intent',
  'Session-to-person join (anonymous sessions cannot be tied to identified people)', 'Peak concurrent occupancy',
  'Creative-level performance', 'Next-edition actuals',
] as const;

export const DECISION_RULE_SEEDS = [
  { mode: 'post_event', metric: 'visitor_cpa', scale_op: '<=', scale_value: 120, stop_op: '>', stop_value: 200, min_registered: 50 },
  { mode: 'post_event', metric: 'registered_show_up', scale_op: '>=', scale_value: 0.75, stop_op: '<', stop_value: 0.6, min_registered: 50 },
  { mode: 'pre_event', metric: 'registration_cpa', scale_op: '<=', scale_value: 90, stop_op: '>', stop_value: 150, min_registered: 50 },
  { mode: 'pre_event', metric: 'confirmed_per_registered', scale_op: '>=', scale_value: 0.88, stop_op: '<', stop_value: 0.8, min_registered: 50 },
] as const;
