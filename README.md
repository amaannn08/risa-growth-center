# RISA Growth Center — CampusFest Challenge A (Attendee Growth)

**Aman Gupta · IIT Kharagpur** · City: **Bengaluru** · Target: **2,400 base / 2,850 stretch unique verified external visitors** at a **₹300,000 marketing cap** (2025 actual: 2,050).

- **Live app:** https://risa-growth-center-six.vercel.app
- **Slides (3 pages, 16:9):** [`docs/strategy-slides.pdf`](docs/strategy-slides.pdf) — rendered from the live `/slides` route by `pnpm slides:pdf`
- **Copilot eval report:** [`docs/eval-report.md`](docs/eval-report.md) · progress log: [`docs/PROGRESS.md`](docs/PROGRESS.md)
- Screenshots: [`docs/screenshots/`](docs/screenshots)

## 1. 60-second demo script

1. Open **Overview**, set *As of* to **13 Apr** (chip "Event close"). Visitors 2,050 vs the revised target 2,200 (−150); spend ₹276,500.
2. Open the **Copilot** panel: *"Why did we miss the visitor target?"* → `get_targets` + `diagnose_bottlenecks`: gap −150; Paid Social 50% registered show-up, 240 confirmed no-shows. Open **Sources** to see each tool call, as-of date and data revision; the grounding chip says every figure is traced.
3. Follow-up *"and how did creators compare?"* (inherits the date and attribution).
4. *"What if we move ₹10k from Paid Social to College Partnerships?"* → `what_if`: +124.19 / −36.56 ≈ **+88 visitors**, labelled *SCENARIO — not evidence*, with caveats.
5. *"Draft a group-pass pilot task for Meera due 2026-01-20"* (an absolute planned due date, so the demo is reproducible on any day) → `propose_task` shows a **draft card**. Click **Confirm** → "Task #n created · Open in Execution"; it is on the board after reload, with an evidence chip and an audit-log row.
6. **Data → Daily marketing → add** a ₹1,000 Paid Social debit dated 16 Apr. Re-ask *"what's Paid Social's cost per visitor now?"* → ₹276.47 at rev+1 (20 Apr total ₹275,000, 13 Apr still ₹276,500).
7. *"Which campaign actually caused more attendance?"* → the Copilot says incrementality is not in the data and points to the B1/B2 experiments.
8. **Reset to original dataset** (top bar) restores ₹274,000. The change log keeps every edit and reset.

## 2. The challenge, the city and why Bengaluru

Challenge A: grow *unique verified external visitors* for the next CampusFest edition inside a marketing cap, and build a Growth Center that lets a growth lead understand the 2025 funnel, decide where to put money, run the plan and ask questions of the data. The assignment asks for correct numbers first, then a grounded chatbot, an insight → action workflow that persists, strategy reasoning and polish; the build follows that order.

**Why Bengaluru** (sourced, checked 27 Nov 2026; full list in §12):

| Evidence (S) | Value |
|---|---|
| Colleges, Bengaluru Urban (AISHE 2023–24) | **1,148** (Pune district 517, Hyderabad 465) |
| Higher-education enrolments in the district (public filing using an AISHE extract) | **~0.8 M** (~0.6 M private HEIs) |
| Local intercollegiate fest precedent | IIM Bangalore **Unmaad** |
| Venue lead | **BIEC**; Madhavara metro ~0.5 km (Green Line) |

Mumbai (Mood Indigo, 150,000+ reported footfall), Delhi NCR (Rendezvous, 160,000+) and Chennai (Saarang, 80,000+) have stronger festival brands, but the footfall figures use organiser definitions and need a venue and travel plan per catchment; Hyderabad/Pune are credible campus-led alternatives with fewer colleges per district. Bengaluru combines the densest college base, a local fest precedent and a transit-linked venue, which fits a campus-led, group-driven plan.

## 3. Data understanding

The workbook (`data/source/Attendee Dataset.xlsx`, SHA-256 `d63f3e01…3469`) is converted **once, offline** by `scripts/convert_xlsx.py` into `data/source/raw/*.json` (every row as supplied, retries included, timestamps `+05:30`). The app never parses the xlsx at runtime.

- **Time:** naive xlsx timestamps are IST. "As of D" means *end of day D IST* (`ts < D+1 00:00 +05:30`); activity dates use `activity_date <= D`. Targets: **launch plan** until 15 Mar 09:00 IST, **revised plan** afterwards.
- **Dedupe by stable ID** (identical retries are no-ops, conflicting repeats are rejected): 2 daily-marketing, 4 registration-history and 20 check-in retry rows removed.
- **Unique verified external visitor** = external person with ≥1 check-in where `result=admitted` and `verification=verified`. 3,390 rows → 3,370 unique → 3,250 verified external events → **2,050 people**. (Excluded: 50 denied, 30 pending, 40 verified non-external.) Scanner verification covers 1,885 people; manual-only adds 165.
- **Identified** includes walk-ins (125 verified attendees with no registration); **registered** = external people with a registration in any current status (2,800); **confirmed** = latest status is `confirmed` (2,500). Latest status = last history row with `effective_at` before the as-of cut-off.
- **Registered show-up is a cohort intersection** (registered ∩ attended ÷ registered) = 1,925 / 2,800 = **68.75%**. The 73.21% headline (2,050 / 2,800) includes the 125 walk-ins and is *not* a show-up rate. Confirmed show-up = 1,925 / 2,500 = 77.0%.
- **Net spend** includes credits (negative postings): ₹276,500 at event close (13 Apr), ₹274,000 at data close (C03 −₹2,000 on 16 Apr, C05 −₹500 on 18 Apr; two further credits on 10 Apr are already inside the 13 Apr figure).
- **Reach is a non-unique daily sum** (666,297). Reach, impressions, clicks, sessions and starts are *observations, not people* and are shown separately from person stages; session-to-person joins do not exist.
- **Attribution views:** *first touch* (default; the person's first campaign), *registration source* (campaign of the registration / engagement) and *check-in source* (campaign of the person's earliest verified admission). All are observational.

**Data-quality panel (Diagnose page):** duplicates removed (2 / 4 / 20), 36 cancelled-then-reconfirmed registrations, 734 people with multiple check-in attempts (725 with multiple verified), 170 unattributed check-in rows (145 people; 150 verified external events / 125 people), 0 orphan keys, 0 simultaneous history versions.

**What the data cannot answer** (shared by the Diagnose page and the Copilot `describe_data` tool): unique reach · platform audience overlap · revenue · ticket price / paid vs free · demographics · attendee institution · sponsor data · cancellation reasons · booking group size · experiment assignment / incrementality · individual intent · session-to-person join · peak concurrent occupancy · creative-level performance · next-edition actuals.

## 4. Target model (single source of truth: `packages/core/src/strategy/model.ts`)

Tags: **S** sourced benchmark · **D** from the 2025 dataset · **A** assumption. Every value is an editable row in `plan_assumptions` (Strategy page), and the slides, Strategy page, Copilot and this README read the same model (guarded by `docs-consistency.test.ts`).

| Assumption | Base | Stretch | Tag |
|---|---:|---:|:--:|
| Working pool: 25 club campuses × 2,000 + 20 catchments × 1,500 + 40,000 alumni/interest | 120,000 | 120,000 | A |
| Assumed deduplicated reach | 80,000 | 105,000 | A |
| Identified pre-event people | 5,000 (6.25% of reach) | 6,000 (5.71%) | A |
| Marginal efficiency above the 2025 spend level | 0.6 | 0.6 | A |
| B1 clubs × extra regs/club × turnout | 15 × 20 × 0.80 | 18 × 25 × 0.85 | A (2025 C04 turnout 85.6% D) |
| B2 extra regs × turnout | 250 × 0.72 | 360 × 0.78 | A |
| B3 qualified visits × visit→reg × turnout | 1,250 × 16% × 0.75 | 1,500 × 20% × 0.80 | S (commerce referral median 14–15%) / A |
| B5 extra regs × turnout | 60 × 0.50 | 125 × 0.56 | A |
| B4 treated × show-up lift | 1,750 × 4.0 pp | 2,229 × (5.8 + 0.7) pp | S (healthcare SMS proxy) / A |
| B4 eligibility: WhatsApp opt-in rate · holdout share | 90% · 20% | 90% · 20% | A |
| B4 day-of 2nd reminder wave (incremental lift, **ASSUMPTION**) | 0 pp (pre-event wave only) | +0.7 pp | A (unvalidated) |
| Share of added registrations that confirm | 90% | 92% | A |
| Walk-ins (capacity-limited) | 125 | 125 | D |
| Turnout benchmarks (projection band) | 64.7% Vihaya · 72% PheedLoop free | | S |
| Capacity | ≤1,700 concurrent · ≤1,800 distinct/day · ≤3,000 weekend · 4 QR lanes × 8 scans/min = 1,920/h | | A |
| Marketing cap | ₹300,000 | ₹300,000 | D |

**Calculation chain** (rounded per campaign / bet):

1. **Reference carry-forward (₹180k)** = `hist × min(b/h,1) + hist × max(b/h−1,0) × 0.6`, h = 2025 net spend, b = 2026 plan budget, first-touch outcomes at 20 Apr. Five strong cohorts at b = h (₹122k: C01 42k, C04 31k, C05 19k, C06 14k, C07 16k) → 1,770 regs / 1,630 confirmed / 1,410 visitors. Paid Social ₹35k of ₹93k → 256 / 218 / 128. Creators ₹23k of ₹59k → 136 / 113 / 68. **Reference = 2,162 regs → 1,961 confirmed → 1,606 registered visitors.**
2. **Bets** add (extra regs → visitors): B1 300 → **240** / 450 → **383**; B2 250 → **180** / 360 → **281**; B3 200 → **150** / 300 → **240**; B5 60 → **30** / 125 → **70**; B4 (turnout only) 1,750 × 4.0 pp = **70** / 2,229 × (5.8 + 0.7) pp = **145**. B4 treated = min(target, ⌊confirmed × 90% opt-in⌋ × (1 − 20% holdout)): base ⌊2,690 × 0.9⌋ = 2,421 opted in → 1,936 treatable ≥ 1,750; stretch ⌊3,097 × 0.9⌋ = 2,787 → 2,229 treatable = the stretch target. (The earlier stretch target of 2,500 treated needed ≥ 3,125 eligible people at a 20% holdout — more than the 3,097 confirmed even at 100% opt-in — so it was revised down to the feasible 2,229 (⌊⌊3,097 × 0.9⌋ × 0.8⌋); the model now caps treatment and raises a warning if an edit makes the target infeasible. **ASSUMPTION — two-wave cadence:** to keep the 2,850 stretch without inventing treated people, the stretch reminder programme is a pre-event wave (5.8 pp, healthcare-SMS benchmark) plus a day-of wave (+0.7 pp, about 12% of wave 1 — strongly diminishing returns on the same people). It raises visits per treated person (6.5 pp), not the treated count, so treated ≤ eligible stays true; the 0.7 pp is an unvalidated guess that the B4 holdout will measure. Base stays single-wave.)
3. Added registrations 810 / 1,235 → added confirmations round(810 × 0.90) = 729 / round(1,235 × 0.92) = 1,136.
4. **Registrations 2,972 / 3,397** (= 2,162 + 810 / 1,235). **Confirmed 2,690 / 3,097** (= 1,961 + 729 / 1,136).
5. **Registered visitors 2,276 / 2,725** = 1,606 + acquisition 600 / 974 + reminders 70 / 145 (76.6% / 80.2% of registrations).
6. **+ walk-ins 125 → 2,401 / 2,850 → headline `floor(total/50)×50` = 2,400 / 2,850** (+17% / +39% vs 2,050).
7. **Spend** = ₹180,000 + bets (₹33k + 24k + 18k + 6k + 12k = ₹93k; stretch B5 ₹12k = ₹99k) = **₹273,000 / ₹279,000**; **reserve ₹27,000 / ₹21,000** inside the ₹300,000 cap. CPA: registration ₹92 / ₹82, visitor ₹114 / ₹98; visitor CPA if the full cap is spent ₹125 / ₹106.
8. **Reach cross-check:** regs / identified = 59.4% / 56.6% versus 77.2% in 2025 — broader reach converts lower, which is why the base case does not assume the historical rate.

**Plan constraints are checked, not assumed** (Strategy page → *Reconciliation*, and `get_strategy_model.reconciliation`): reserve ≥ 0 (spend ≤ cap), assumed deduplicated reach ≤ the working pool, identified ≤ reach, B4 target treated ≤ opted-in confirmed registrants after the holdout (opt-in rate and holdout share are shown in the reconciliation; the model caps treatment and warns when infeasible), and the day split must reconcile to the modeled raw total. Base case: 1,400 + 1,300 − 300 = 2,400 against the modeled 2,401, i.e. a **1-visitor rounding gap, left explicit** rather than hidden; the check tolerates ±1.

**Dated reach/budget bridge (illustrative; assumed event day T0 = Sat 11 Apr 2026, all A):**

| Segment (working pool, A) | Pool | Reach base / stretch | Bets and window | Budget |
|---|---|---|---|---|
| 25 club campuses × 2,000 | 50,000 | 40,000 / 45,000 (80% / 90%) | B1 group passes 14 Feb → 28 Mar · B2 ambassadors 21 Feb → 4 Apr | ₹33k + ₹24k |
| 20 catchments × 1,500 | 30,000 | 20,000 / 27,000 (67% / 90%) | B3 referrals 7 Mar → 4 Apr (all segments) | ₹18k |
| Alumni / interest communities | 40,000 | 20,000 / 33,000 (50% / 83%) | B5 retargeting 7 Mar → 28 Mar (gated 2nd ₹6k) | ₹6k (+₹6k) |
| Confirmed registrants | n/a | n/a | B4 WhatsApp reconfirmation 4 Apr → 11 Apr | ₹12k |
| **Total** | **120,000** | **80,000 / 105,000** (stretch = 87.5% of the pool, with no channel or partner commitments yet) | | ₹93k bets + ₹180k reference |

**Worked downside (base, partner shortfall + overlap):** if a third of the group-pass clubs fail to activate (15 → 10 clubs: B1 240 → 160 visitors, −80) **and** 15% of ambassador registrations duplicate group-pass registrants (250 → 213: B2 180 → 153, −27), total visitors fall **2,401 → 2,294** (headline 2,250; registrations 2,972 → 2,835). The model's day-split check then flags the unchanged 2,400 split (a gap of −106), which is the signal to re-plan capacity. B1 and B2 share an owner and overlap on 21 Feb → 28 Mar, so staffing is the binding constraint to cost before launch.

**Sensitivity:** no reminder lift and no walk-ins → 2,401 − 70 − 125 = **2,206**; −5 pp registered show-up on 2,972 registrations → **−149** visitors.
**Capacity:** base day split 1,400 + 1,300 − 300 repeat = 2,400; stretch 1,600 + 1,600 − 350 = 2,850 — both under the weekend cap; the model flags totals above 3,000 or 1,800/day.

## 5. Prioritisation, five bets and what we rejected

Score = (0.5 × impact + 0.3 × confidence + 0.2 × ease) / 5 × 100 (each 0–5; weights editable on the Strategy page, live re-rank).

| # | Bet | Score (I/C/E) | +Visitors base / stretch | Budget | Owner · window |
|---|---|---|---|---|---|
| 1 | College group passes | **92** (5 / 5 / 3) | +240 / +383 | ₹33k | Partnerships lead · T−8 → T−2 wk |
| 2 | Campus ambassador leaderboard | **85** (4.5 / 4 / 4) | +180 / +281 | ₹24k | Campus lead · T−7 → T−1 |
| 3 | Tiered friend referrals | **80** (4 / 4 / 4) | +150 / +240 | ₹18k | Referral owner · T−5 → T−1 |
| 4 | WhatsApp reconfirmation (turnout, not acquisition) | **71** (3 / 3.5 / 5) | +70 / +145 | ₹12k | Lifecycle owner · T−2 → T0 |
| 5 | Paid retargeting after landing-page fix | **54** (2 / 3 / 4) | +30 / +70 | ₹6k (+₹6k gated) | Performance owner · T−5 → T−2 |

Scores in rank order: **92 / 85 / 80 / 71 / 54**. Double down on B1 + B2 — **not** because they are the highest show-up channels: College Partnerships had the best 2025 registered show-up (85.6%) but Campus Ambassadors (75%) ranks **fifth of seven** (behind C04, C07, C05 and C06). B2 earns its place on **access** (a rep network inside campuses on disjoint pools from B1), **scale** (the largest controllable registration lever after B1) and **execution feasibility** (existing owner, ₹24k, rep-level tracking), and its show-up is a tested assumption (B2 experiment), not a historical fact. Each person is assigned to one bet; B1/B2 run on disjoint campuses; B4 is layered on residual no-shows; B3 needs developer time; capacity caps upside.

**Rejected / deprioritised** (Strategy page, with reasons): creator expansion (hold — ₹337/visitor at 50% show-up) · refundable ₹49 deposit (reach loss, −20 to +30 net) · gamified passport (protect ingress, 8–20) · metro shuttle (directions everywhere; shuttle only where friction is measured) · staged lineup reveal (bundle into existing channels) · industry workshops (pilot only with a partner) · search/community intent pages (kept in reference; first reserve alternative) · broad paid prospecting (rejected; retargeting only).

## 6. Experimentation

| Bet | Primary KPI | Scale | Change | Stop |
|---|---|---|---|---|
| B1 | Incremental regs per activated club (by T−14), confirmed ≥85% | ≥15 | 8–14: tighten roster flow | <8, or modeled incremental visitor cost >₹180 |
| B2 | Extra regs per active rep after 2 wk, ≥80% confirmed by T−14 | ≥4 | 2–3: coach | <2, or duplicate/ineligible >5% |
| B3 | Visit→registration after 200 qualified visits | ≥16% | 10–15.9%: rework reward/copy | <10%, abuse >5%, or >₹180/incremental visitor |
| B4 | Reconfirmation at T−2 (delivery ≥90%) | ≥55% | 40–54.9%: change timing/copy | <40% or opt-out >2% (final metric: ITT verified show-up lift ≥4 pp) |
| B5 | Incremental reg/click at ≥400 qualified clicks; T−7 confirmation ≥85% | ≥10% | 6–9.9%: rework | <6%, confirmation <75%, or marginal visitor cost >₹200 |

**What the readout UI enforces** (Execution → *Record readout*; adjudicated by the server in the write transaction, the client's decision is ignored): the KPI value (or numerator and denominator), the sample size and **one observation per guardrail** are mandatory; a missing input, a sample below the minimum, **or any guardrail rule that is not a typed record** (e.g. an old free-text string) records **insufficient evidence** (no Scale/Change/Stop). A hard guardrail breach (named in the stop rule: B1/B3 cost > ₹180, B2 duplicates > 5%, B3 abuse > 5%, B4 opt-out > 2%, B5 marginal cost > ₹200) → Stop; a soft breach (e.g. B1 confirmation < 85%) blocks Scale (→ Change). **B5's confirmation has two thresholds:** ≥ 85% is the Scale floor, and **< 75% is a hard floor that Stops** the bet (between 75% and 85% → Change). **A Stop blocks the reserve release** (B5's second ₹6k is held even if the forecast gate passes). Observations are validated by one shared function (readout form and server): numerator/denominator come in pairs, are whole numbers, a % KPI cannot exceed 100 or have numerator > denominator, a denominator cannot exceed the sample, and **the ratio is computed server-side — an explicit KPI that conflicts with its counts is rejected** (the B3 case of 90% against 1/250). The KPI counts, guardrail observations and the rule trace are stored on the experiment. Guardrails live as typed records `{key, label, op, value, hard?, stop_op?, stop_value?}` (migration `0003` converts the five shipped sets in both `public` and `seed` schemas). Two decisions stay **distinct**: B5's *reserve release* (≥ 40 more visitors at ≤ ₹150) and B4's *final holdout result* (ITT show-up lift ≥ 4 pp with the interval above zero), each with its own inputs and result.

Cadence: weekly review T−6 → T−3 weeks, daily from T−14 days. Reserve is released only on a passed gate (B5's second ₹6k needs ≥40 more visitors at ≤₹150 marginal). Leading-indicator ladder: clicks → reg/click → confirmed/registered at T−14 → reconfirmation at T−2 → verified show-up. Hygiene: cluster randomisation, holdouts, arm logged before exposure, stable person IDs, ITT show-up with intervals. In the app, **Execution → Record readout** applies the thresholds (`evaluateExperiment`) and can create the follow-up task. The campaign **Scale / Change / Stop** badge uses the editable decision rules (post-event: visitor CPA ≤ ₹120 and registered show-up ≥ 75% scale; > ₹200 or < 60% stop; pre-event: registration CPA ≤ ₹90 and confirmed/registered ≥ 88% scale; > ₹150 or < 80% stop; < 50 registrations = insufficient data).

## 7. Product

```
Browser (as-of in URL) ─▶ Next.js 15 App Router (RSC pages + client islands)
                              │ lib/data.ts: dataset cached per data revision
                              ├─▶ @gc/core   pure TS metric engine, analytics, strategy model, calculator (no IO)
                              ├─▶ @gc/db     Drizzle schema, seed, mutations + audit_log, reset, drafts (Neon Postgres / PGlite)
                              └─▶ @gc/ai     tools (thin wrappers over core+db), prompt, grounding check, eval  ─▶ DeepSeek (OpenAI-compatible)
```

- **One engine.** Dashboard, Copilot tools, slides and tests all call `@gc/core` (`packages/core/src`); no metric is computed in SQL or a React component. Raw rows live in Postgres; analytics are computed per request from a dataset cached by `data_revision`, so edits change dashboards and Copilot answers on the next request. Every tool result carries `data_revision`.
- **Management features:** edit daily spend (credits allowed), add people / registrations / status changes / check-ins / target versions with invariants (history is append-only); campaign status (active/paused/stopped) and plan budgets; tasks (kanban), experiments (readouts), bets, assumptions, decision rules; audit log with before/after; JSON export; **Reset to original dataset** (one transaction from a pristine `seed` schema; the audit log is never truncated). *Overdue* on the task board is measured against the selected **as-of date** (the app's clock), not the real-world date, because the seeded tasks are next-edition (2026) items on a 2025 dataset.
- **Insight → action (works without the LLM):** Diagnose finding → **Create task** (prefilled with `insight_id` and an evidence snapshot) → card on Execution with an evidence chip → status changes persist → audit-log row. With the LLM the same path is `propose_task` → draft card → **Confirm**.
- **Projection to event day** (pre-event as-of): trailing 7/14/28-day registration run-rate per active campaign × days left × a show-up band (64.7% / 70% / 72%) + a walk-in allowance (all assumptions editable, labelled ASSUMPTION). Pausing or stopping a campaign removes its run-rate. **Backtest** (mid projection vs the final 2,050, at each Sunday): 16 Feb 1,855 · 23 Feb 2,137 · 2 Mar 2,047 · 9 Mar 1,763 · 16 Mar 1,807 · 23 Mar 2,033 · 30 Mar 2,140 · 6 Apr 2,151. The actual lies inside the low–high band at 7 of 8 as-ofs; the miss is 9 Mar, the week College Partnerships registered zero. It is a linear run-rate, not a forecast guarantee.
- **Copilot design** (`packages/ai`):
  - *Tools* (zod schemas, typed errors, every result includes `{tool, as_of, data_revision, attribution, units}`): `get_funnel`, `get_targets`, `compare_campaigns`, `get_trend`, `diagnose_bottlenecks`, `data_quality`, `get_spend_ledger`, `get_attendance`, `lookup_registration`, `list_campaigns`, `list_tasks`, `list_experiments`, `get_projection` (the dated 2025 event-end low/mid/high band the Overview shows, with assumptions and revision), `get_strategy_model` (next-edition 2026 plan only), `what_if` (never persists), `calculate` (recursive-descent parser, no `eval`), `describe_data`, `propose_task`, `propose_campaign_change`.
  - *Prompt rules* (`systemPrompt.ts`, versioned): every number from a tool or `calculate`; cite `[tool · as_of · rev]` (only tools actually executed in the turn); resolve the subject set, measure and date from the request and the conversation first and ask ONE short question (2–3 options, no tools) only for what is still unresolved, never re-asking a resolved follow-up; user-typed numbers are scenario inputs, never evidence; event-end forecasts go to `get_projection`, next-edition planning to `get_strategy_model`; evidence vs assumption/scenario; attribution is observational; say plainly when data cannot answer (check `describe_data` first); follow-ups inherit date/campaign/attribution; never claim a task was created.
  - *Server-issued evidence refs* (`evidence.ts`): every tool call gets a server-side call id and one ref per numeric field `{toolCallId, tool, metricField, unit, signedValue, attribution, asOf, revision}` (stored compactly per call in `chat_logs.tool_calls`). The model never sees the refs (`toModelOutput` strips them); the UI receives them with the tool result. **Citations and the grounding badge render from the refs of the tool calls in this assistant turn only** — earlier turns and anything else in the client transcript count for nothing. All citation forms are validated (`[get_funnel · 2025-04-20 · r7]`, `[calculate · r69]`, `[get_funnel]`); a citation that does not resolve to a call of this turn (wrong tool, stale revision, different date) is shown struck through as *unverified*. `propose_task` resolves each evidence item to a ref (same tool and signed figure) and stores it with the item, so a task chip shows **the tool run's own date and revision**, not the page date; an item that resolves to no ref is stored `verified: false` and shown as *unverified*.
  - *Grounding check* (`grounding.ts`): after the answer, figures are extracted (dates, IDs, citations and small counts ignored) and matched against the refs' signed values for this turn (raw, rounded, ×100 for fractions) and (reported separately, never as evidence) the user's own message; a figure that equals the sum/difference of two traced figures shown in the same answer is labelled *derived*. The UI shows "✓ All N figures traced" or "⚠ k not traced", and the result is stored in `chat_logs`.
  - *Drafts:* `propose_*` only inserts `action_drafts(status=pending)`. **Confirm** (`POST /api/drafts/:id/confirm`) is exactly-once (`UPDATE … WHERE status='pending' RETURNING`; repeats return the existing `result_ref`), with the user able to edit fields first; **Discard** creates nothing.
  - *Runtime:* DeepSeek `deepseek-flash` via the OpenAI-compatible API (`thinking` disabled, temperature 0.1, ≤6 tool steps, history trimmed to 16 messages, one dataset revision pinned per answer, automatic fallback to `deepseek-chat` on model errors). `COPILOT_MODE=native|json|mock`: `json` is a validated JSON tool loop fallback (not needed — native tool calling was reliable in the smoke test); `mock` is a fixed script for e2e. Rate limit 20 questions / 10 min / IP hash plus a 1,500/day cap (a durable Postgres `rate_counters` row, reserved before the provider call). The key is server-side only.
  - *Refusals:* unique reach, revenue, demographics, cancellation reasons and incrementality are answered with "not in the data", the closest evidence and a suggested way to collect it.

## 8. Testing

| Layer | What | Command |
|---|---|---|
| Metric engine | **Golden test** against an *independent* Python audit (`scripts/audit.py` → `data/reference/metrics.json`): 7 snapshot dates (overall, target, progress, 3 attribution views + extras), all 96 daily rows, daily status trend, weekly series (both modes), attendance by day, data quality; deep-equal with 1e-7 tolerance and no ignored keys. Plus time/EOD, dedupe, calculator, strategy numbers, what-if, recommendations, diagnose, projection, cohorts, in-memory mutation semantics, docs-consistency | `pnpm --filter @gc/core test` |
| Database | seed → verify against `metrics.json`, each mutation bumps revision + writes audit, reset restores ₹274,000, draft confirm exactly-once, discard creates nothing, delete-with-activity refused | `pnpm --filter @gc/db test`; `pnpm db:verify` (also on Neon) |
| Copilot tools | Deterministic ground truth for **all 59 eval items** without any LLM, `get_projection` (the Overview band, and that pausing Paid Social moves the midpoint 2,091 → 2,088 while observed actuals stay fixed), the clarifying-question guard, citation-of-a-tool-that-did-not-run flagging, user-numbers-are-not-evidence, zod/OUT_OF_COVERAGE rejection, name → id resolution, context inheritance, draft idempotency, grounding extractor, JSON-loop parser, the durable Postgres rate limiter | `pnpm --filter @gc/ai test` |
| End-to-end | Playwright on a local PGlite DB: changed-data scenarios (spend debit, reset, insight → task, pause, new target), strategy recompute, readout, validation, Copilot panel with a mocked provider (Sources + draft card), as-of cutoff on a Monday (C02 on 3 Mar: ₹0 posted, week marked partial), the confirmed Copilot draft's evidence chip on its own board card, experiment readout with a missing sample → *insufficient evidence*, the B5/B4 distinct gates, and a 390 px mobile suite (Copilot sheet usable and closable; no horizontal page overflow) | `pnpm --filter web e2e` |
| LLM eval | 59 questions (the original 34 + the grader's 20 red-team questions with verified answers + 1 clarification probe + 4 round-3 regression cases) through `/api/chat` with scoring on tools, numbers, forbidden phrases, refusals, drafts and grounding | `pnpm eval --base-url http://localhost:3000` → [`docs/eval-report.md`](docs/eval-report.md) |

**LLM eval results** (all `deepseek-flash`, native tool calling, scored identically: expected tool, every expected figure/phrase, no forbidden phrase, **zero untraced figures and no citation of a tool that did not run in the turn**). Single runs are noisy at temperature 0.1: treat each pass rate as one sample, not a guarantee.

- **Shipped build, deployed Vercel demo + Neon — [`docs/eval-report.md`](docs/eval-report.md) (run 27 Nov 2026 against https://risa-growth-center-six.vercel.app, 55 items): 51 / 55 (92.7%), refusals 7/7, drafts 2/3.** This is the report of the build that is deployed. Its four misses: **#15** (College Partnerships zero-registration week: the answer omitted the weekly values 77, 80 and 97), **#19** ("Why did people cancel? Then create a reminder task": no `propose_task` call, so no draft was recorded), **#29** ("Which campaigns are active?": Paid Social was left out without saying it is *paused*) and **#52** (the forecast answer did not say that observed actuals were *unchanged*). No claim of 55/55 is made for the deployed system.
- **Round 3 (this change set) targets those four by improving tools and the prompt, never by hard-coding answers:** `get_trend` returns every period as quotable `series_text`, honours the as-of cutoff and flags partial periods (#15); the prompt says a task requested in the same message is drafted in that turn (#19); `list_campaigns` returns `not_active` with each status word (#29); `get_projection` returns an explicit `observed_actuals` statement (#52). Four regression items were added (ids 56–59, so the set is now 59). The deterministic tool-level ground truth for all 59 runs in `pnpm --filter @gc/ai test`; the LLM results of **local** runs (PGlite, not the deployed system) are a different sample on different code from the deployed 51/55 above: the first run scored 54/59 because a new clarification guard wrongly treated "X vs Y" questions about dates and targets as campaign comparisons (#3, #4, #30; #46 was a model miss and #59 a tool-choice strictness in the new item) — the guard was narrowed to questions that are about campaigns, with a test over every eval question — and the re-run on the fixed code scored **59/59 (100%), refusals 7/7, drafts 4/4** ([`docs/eval-report-local-r3.md`](docs/eval-report-local-r3.md)). Treat 59/59 as one favourable sample, not a rate. The deployed demo has not been re-evaluated since this round; it needs `pnpm db:migrate` (migrations `0003`, `0004`) and a redeploy first.
- **Scoring changes since round 1 (numbers are not directly comparable):** citations are checked against the tool calls the server executed in the turn (including the abbreviated `[calculate · r69]` form); a ratio/share/multiple that is exact arithmetic on two traced figures shown in the answer (e.g. 183 ÷ 2,800 = 6.54%) is accepted as *derived* and labelled as such.
- **Round 1, deployed demo (`docs/eval-report-live-34.md`, 34 items): 32 / 34 (94.1%)**, refusals 3/3, drafts 2/2 (misses: #15 weekly values and #30, an untraced 93.18%).

## 9. Setup

Prerequisites: Node 22+, pnpm 9 (`corepack enable` or `npx pnpm@9`), [uv](https://docs.astral.sh/uv/) (only to re-convert the workbook).

```bash
pnpm install
# Option A (no accounts needed): local embedded Postgres. Export ONCE so every command below sees it (a per-command prefix only applies to that command).
export DATABASE_URL=pglite:.pglite-demo  # resolved against the repo root; if unset, the db:* scripts and `pnpm dev` default to pglite:.pglite
# Option B: Neon + the Copilot. Put the values in the git-ignored env file instead (scripts and Next both read it):
#   cp .env.example apps/web/.env.local   # DATABASE_URL (Neon pooled URL), DEEPSEEK_API_KEY, DEEPSEEK_MODEL, COPILOT_MODE
pnpm db:migrate --dry-run                # optional: applies every migration to a throwaway in-memory DB and lists them (never touches DATABASE_URL)
pnpm db:migrate && pnpm db:seed          # idempotent; `--force` re-seeds
pnpm db:verify                           # snapshots + data quality vs metrics.json
pnpm dev                                 # http://localhost:3000
pnpm test                                # core + db + ai
pnpm --filter web e2e                    # Playwright (local PGlite, never Neon)
pnpm smoke                               # (second shell, `pnpm dev` running, DEEPSEEK_API_KEY set) 4 Copilot turns; exits non-zero if native tool calling fails
pnpm eval --base-url http://localhost:3000   # LLM eval (local server or a Neon eval branch only; add `--out docs/<name>.md` to keep the shipped report)
pnpm slides:pdf                          # → docs/strategy-slides.pdf (a LOCAL server must be running: BASE_URL=http://localhost:3000 NEXT_PUBLIC_SITE_URL=<live url>)
```

- **No Neon?** Use `DATABASE_URL=pglite:./.pglite` (file DB, embedded Postgres) — the same code path, used by tests and e2e. A relative `pglite:` path is resolved against the **monorepo root** (not the current directory), so `pnpm db:*` (run from `packages/db`) and `pnpm dev` (run from `apps/web`) share one file; absolute paths also work. Smoke-tested from a fresh copy of the repository: `export DATABASE_URL=pglite:.pglite-demo` then `pnpm db:migrate && pnpm db:seed && pnpm db:verify` creates exactly one `.pglite-demo` at the repo root and verifies against `metrics.json` (a `DATABASE_URL=… pnpm db:migrate && pnpm db:seed` one-liner scopes the variable to the first command only, so use `export`). Existing Neon databases need `pnpm db:migrate` once for the later migrations: `0001`/`0002` (`rate_counters`, `audit_log.client_id`, `experiments.observation`), **`0003`** (the five shipped guardrail sets become typed records in `public.experiments` **and** `seed.experiments`, so Reset restores them) and **`0004`** (B4 opt-in/holdout assumptions and the revised stretch treatment target, again in both schemas). `pnpm db:migrate --dry-run` proves the SQL on an in-memory database without connecting to Neon.
- **Re-convert the workbook:** `uv run --with openpyxl python scripts/convert_xlsx.py` (writes `data/source/raw/*.json` and `manifest.json`; counts are asserted by `manifest.test.ts`).
- **Deploy (Vercel):** project Root Directory `apps/web`; install `pnpm install --frozen-lockfile`; build `cd ../.. && pnpm turbo run build --filter=web` (see `vercel.json`); Node 22; env `DATABASE_URL` (pooled), `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL=deepseek-flash`, `COPILOT_MODE=native`, `NEXT_PUBLIC_SITE_URL`. Workspace packages ship TypeScript source (`transpilePackages`), PGlite is externalised and server-only.
- Pinned versions: Next 15.5.29 · React 19.3.1 · TypeScript 5.9.3 · Tailwind 4.3.5 + shadcn/ui · Recharts 3.11.1 · Drizzle ORM 0.44.7 · postgres-js 3.4.9 · zod 3.25.76 · AI SDK `ai` 7.0.183 / `@ai-sdk/react` 4.0.188 / `@ai-sdk/openai-compatible` 3.0.96 · Vitest 2.1.9 · Playwright 1.65.1.

## 10. Tools used (honest account)

- **Claude Code (Sonnet / Opus)** was the coding assistant for planning, implementation, tests and documentation of this repository, and **OpenAI Codex** was used as a research/audit assistant (market and benchmark research, the independent Python audit `scripts/audit.py` and the data audit that produced the golden `metrics.json`). Their output was reviewed and verified: the metric engine is checked against the independent audit by the golden test, the database layer by `db:verify`, the Copilot by tool-level ground-truth tests and an LLM eval.
- **DeepSeek API (`deepseek-flash`)** powers the in-product Copilot (tool calling).
- **Stack:** Neon (Postgres), Vercel, Next.js, React, Tailwind, Drizzle, Recharts, shadcn/ui, Vercel AI SDK, Vitest, Playwright, uv + openpyxl (one-off conversion).
- **Reused vs written:** shadcn/ui primitives and library documentation were reused; the metric engine, strategy model, analytics, schema, mutations, tools, prompt, grounding check, eval harness, UI pages and slides were written for this project. Market figures are quoted from the sources in §12 and tagged S/A/D wherever they enter the model.

## 11. Known limitations

- Synthetic single-edition data; the 2026 plan is a model, not a forecast. Benchmarks come from different contexts (healthcare SMS reminders, commerce referrals, ticketing platforms) and are used as priors to be tested by the experiments in §6.
- Attribution is observational; campaign comparisons are not causal. Marginal returns of extra spend are unmeasured (the model applies a 0.6 efficiency haircut as an assumption).
- The projection is a linear run-rate; the backtest misses one of eight as-ofs.
- **Shared public demo (no per-session workspaces — a deliberate scope decision).** Reads are consistent even though writes are shared: a page render or Copilot answer loads the revision, the dataset, assumptions/rules **and the management rows it shows (tasks, experiments, bets)** inside ONE transaction snapshot (`REPEATABLE READ`, read-only on Postgres), and the dataset cache is keyed by that snapshot's own revision, so a concurrent write can never show revision N+1 data under revision N (`db.test.ts` → revision-overlap). The top-bar revision comes from its own snapshot, so it can lag the page body by one edit. There is no authentication and the live demo uses a single shared database: any visitor's edits, drafts and resets are visible to every other visitor (a banner says so; **Reset to original dataset** restores the seed and the top bar shows "edits since reset"). The audit log keeps every edit and reset and records an anonymous per-request **client id** (a hashed IP, never the address) on each row, so activity can be attributed to a client during review. The chat rate limit (20 questions / 10 min per client), the mutation limit and the daily provider cap are **durable** (a Postgres `rate_counters` table, atomic upsert with expiry; the daily cap reserves a slot *before* the provider is called), so they hold across serverless instances. Evaluators who need isolation should run locally on PGlite (`DATABASE_URL=pglite:./.pglite`).
- The public `/api/export` returns the whole (synthetic) dataset; keep real data out of this demo.
- The Copilot's citation check is enforced server-side for the non-streamed modes (an unverifiable citation is replaced by a marker) and, for streamed native answers, rendered in the UI from the server-issued refs (unresolvable citations are struck through and counted in the badge) and stored in `chat_logs.grounding`; a ref identifies the tool, field and figure, but the model can still cite a *different, valid* call of the same tool for a figure (flagged only when tool, revision or date do not match any call of the turn).
- Experiment readouts adjudicate KPI + sample + guardrail observations; the per-bet assignment/power plan (cluster sizes, intervals) remains a planning document in §6, not enforced by the UI.
- LLM non-determinism: mitigated by tool grounding, the grounding chip and the eval, not eliminated. The eval's pass rate is a sample, and answers can vary between runs.
- Capacity numbers (1,700 / 1,800 / 3,000) are assumptions pending a signed venue layout.

## 12. Sources (checked 27 Nov 2026)

AISHE 2023–24 (MoE) [Box 2](https://cdnbbsr.s3waas.gov.in/s392049debbe566ca5782a3045cf300a3c/uploads/2026/07/202607131602421770.pdf#page=36) · [AISHE 2021–22](https://www.education.gov.in/sites/upload_files/mhrd/files/statistics-new/AISHE%20Book_2021-22_4.pdf) · [NSE-hosted filing (Bengaluru higher education)](https://nsearchives.nseindia.com/corporate/Registration_29092025062424_ProjectScholarspaceConsolidatedDRHP.pdf) · [BIEC brochure](https://www.biec.in/images/PDF/BIEC-%20BROCHURE.pdf) · [BIEC capacity chart](https://www.biec.in/capacity_chart) · [Bengaluru Tech Summit exhibitor manual](https://www.bengalurutechsummit.com/pdf/BTS-Exhibitor-Manual-9sqm.pdf) · [BMRCL route map](https://english.bmrc.co.in/schematic-route-map/) · [IIM Bangalore Unmaad](https://www.iimb.ac.in/unmaad-2026) · [IIT Bombay annual report 2022–23](https://www.iitb.ac.in/sites/www.iitb.ac.in/files/2024-03/Annual%20Report%202022-23.pdf) · [IIT Delhi Rendezvous](https://www.rdv-iitd.org/) · [IIT Madras annual report 2024–25](https://www.iitm.ac.in/sites/default/files/Others/Annual%20Report%202024-25%20final%20upload.pdf) · [YouGov India Media Morph 2024](https://d3nkl3psvxxpe9.cloudfront.net/documents/YouGov_India_Media_Morph_Report_April_2024.pdf) · [DataReportal Digital 2026 India](https://datareportal.com/reports/digital-2026-india) · [Vihaya Events ticketing India](https://events.vihaya.app/reports/event-ticketing-india-2026) · [Eventbrite turnout](https://www.eventbrite.ca/blog/how-to-increase-event-attendance/) · [PheedLoop Event Data Lab #05](https://pheedloop.com/blog/event-data-lab-report-5) · [Superads India CPM](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/india) · [Superads India CPC](https://www.superads.ai/facebook-ads-costs/cpc-cost-per-click/india) · [Hypee creator benchmarks](https://www.hypee.co.in/india-creator-benchmarks) · [Digital Berries rate cards](https://www.digitalberries.co.in/insights/influencer-pricing-report-india-2026) · [Mood Indigo campus representatives](https://my.moodi.org/pr) · [Internshala Student Partner](https://internshala.com/competitions/internshala-student-partner-program/) · [Talkable referral study](https://get.talkable.com/analytics/reward-size-and-conversion) · [Hallsworth et al. SMS reminder trials](https://doi.org/10.1371/journal.pone.0137306) · [Cochrane SMS reminders](https://pubmed.ncbi.nlm.nih.gov/24310741/) · [WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing#rate-cards) · [DeepSeek function calling](https://api-docs.deepseek.com/guides/tool_calls) · [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers) · [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) · [Vercel Turborepo](https://vercel.com/docs/monorepos/turborepo).
