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
5. *"Draft a group-pass pilot task for Meera due next Friday"* → `propose_task` shows a **draft card**. Click **Confirm** → "Task #n created · Open in Execution"; it is on the board after reload, with an evidence chip and an audit-log row.
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
| B4 treated × show-up lift | 1,750 × 4.0 pp | 2,500 × 5.8 pp | S (healthcare SMS proxy) / A |
| Share of added registrations that confirm | 90% | 92% | A |
| Walk-ins (capacity-limited) | 125 | 125 | D |
| Turnout benchmarks (projection band) | 64.7% Vihaya · 72% PheedLoop free | | S |
| Capacity | ≤1,700 concurrent · ≤1,800 distinct/day · ≤3,000 weekend · 4 QR lanes × 8 scans/min = 1,920/h | | A |
| Marketing cap | ₹300,000 | ₹300,000 | D |

**Calculation chain** (rounded per campaign / bet):

1. **Reference carry-forward (₹180k)** = `hist × min(b/h,1) + hist × max(b/h−1,0) × 0.6`, h = 2025 net spend, b = 2026 plan budget, first-touch outcomes at 20 Apr. Five strong cohorts at b = h (₹122k: C01 42k, C04 31k, C05 19k, C06 14k, C07 16k) → 1,770 regs / 1,630 confirmed / 1,410 visitors. Paid Social ₹35k of ₹93k → 256 / 218 / 128. Creators ₹23k of ₹59k → 136 / 113 / 68. **Reference = 2,162 regs → 1,961 confirmed → 1,606 registered visitors.**
2. **Bets** add (extra regs → visitors): B1 300 → **240** / 450 → **383**; B2 250 → **180** / 360 → **281**; B3 200 → **150** / 300 → **240**; B5 60 → **30** / 125 → **70**; B4 (turnout only) 1,750 × 4.0 pp = **70** / 2,500 × 5.8 pp = **145**.
3. Added registrations 810 / 1,235 → added confirmations round(810 × 0.90) = 729 / round(1,235 × 0.92) = 1,136.
4. **Registrations 2,972 / 3,397** (= 2,162 + 810 / 1,235). **Confirmed 2,690 / 3,097** (= 1,961 + 729 / 1,136).
5. **Registered visitors 2,276 / 2,725** = 1,606 + acquisition 600 / 974 + reminders 70 / 145 (76.6% / 80.2% of registrations).
6. **+ walk-ins 125 → 2,401 / 2,850 → headline `floor(total/50)×50` = 2,400 / 2,850** (+17% / +39% vs 2,050).
7. **Spend** = ₹180,000 + bets (₹33k + 24k + 18k + 6k + 12k = ₹93k; stretch B5 ₹12k = ₹99k) = **₹273,000 / ₹279,000**; **reserve ₹27,000 / ₹21,000** inside the ₹300,000 cap. CPA: registration ₹92 / ₹82, visitor ₹114 / ₹98; visitor CPA if the full cap is spent ₹125 / ₹105.
8. **Reach cross-check:** regs / identified = 59.4% / 56.6% versus 77.2% in 2025 — broader reach converts lower, which is why the base case does not assume the historical rate.

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

Scores in rank order: **92 / 85 / 80 / 71 / 54**. Double down on B1 + B2 (highest show-up channels: College Partnerships 85.6%, Campus Ambassadors 75%). Each person is assigned to one bet; B1/B2 run on disjoint campuses; B4 is layered on residual no-shows; B3 needs developer time; capacity caps upside.

**Rejected / deprioritised** (Strategy page, with reasons): creator expansion (hold — ₹337/visitor at 50% show-up) · refundable ₹49 deposit (reach loss, −20 to +30 net) · gamified passport (protect ingress, 8–20) · metro shuttle (directions everywhere; shuttle only where friction is measured) · staged lineup reveal (bundle into existing channels) · industry workshops (pilot only with a partner) · search/community intent pages (kept in reference; first reserve alternative) · broad paid prospecting (rejected; retargeting only).

## 6. Experimentation

| Bet | Primary KPI | Scale | Change | Stop |
|---|---|---|---|---|
| B1 | Incremental regs per activated club (by T−14), confirmed ≥85% | ≥15 | 8–14: tighten roster flow | <8, or modeled incremental visitor cost >₹180 |
| B2 | Extra regs per active rep after 2 wk, ≥80% confirmed by T−14 | ≥4 | 2–3: coach | <2, or duplicate/ineligible >5% |
| B3 | Visit→registration after 200 qualified visits | ≥16% | 10–15.9%: rework reward/copy | <10%, abuse >5%, or >₹180/incremental visitor |
| B4 | Reconfirmation at T−2 (delivery ≥90%) | ≥55% | 40–54.9%: change timing/copy | <40% or opt-out >2% (final metric: ITT verified show-up lift ≥4 pp) |
| B5 | Incremental reg/click at ≥400 qualified clicks; T−7 confirmation ≥85% | ≥10% | 6–9.9%: rework | <6%, confirmation <75%, or marginal visitor cost >₹200 |

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
  - *Tools* (zod schemas, typed errors, every result includes `{tool, as_of, data_revision, attribution, units}`): `get_funnel`, `get_targets`, `compare_campaigns`, `get_trend`, `diagnose_bottlenecks`, `data_quality`, `get_spend_ledger`, `get_attendance`, `lookup_registration`, `list_campaigns`, `list_tasks`, `list_experiments`, `get_strategy_model`, `what_if` (never persists), `calculate` (recursive-descent parser, no `eval`), `describe_data`, `propose_task`, `propose_campaign_change`.
  - *Prompt rules* (`systemPrompt.ts`, versioned): every number from a tool or `calculate`; cite `[tool · as_of · rev]`; evidence vs assumption/scenario; attribution is observational; say plainly when data cannot answer (check `describe_data` first); follow-ups inherit date/campaign/attribution; never claim a task was created.
  - *Grounding check* (`grounding.ts`): after the answer, figures are extracted (dates, IDs, citations and small counts ignored) and matched against every number in this conversation's tool results (raw, rounded, ×100 for fractions) and the user's own message; a figure that equals the sum/difference of two traced figures shown in the same answer is labelled *derived*. The UI shows "✓ All N figures traced" or "⚠ k not traced", and the result is stored in `chat_logs`.
  - *Drafts:* `propose_*` only inserts `action_drafts(status=pending)`. **Confirm** (`POST /api/drafts/:id/confirm`) is exactly-once (`UPDATE … WHERE status='pending' RETURNING`; repeats return the existing `result_ref`), with the user able to edit fields first; **Discard** creates nothing.
  - *Runtime:* DeepSeek `deepseek-flash` via the OpenAI-compatible API (`thinking` disabled, temperature 0.1, ≤6 tool steps, history trimmed to 16 messages, one dataset revision pinned per answer, automatic fallback to `deepseek-chat` on model errors). `COPILOT_MODE=native|json|mock`: `json` is a validated JSON tool loop fallback (not needed — native tool calling was reliable in the smoke test); `mock` is a fixed script for e2e. Rate limit 20 questions / 10 min / IP hash plus a 1,500/day cap (via `chat_logs`). The key is server-side only.
  - *Refusals:* unique reach, revenue, demographics, cancellation reasons and incrementality are answered with "not in the data", the closest evidence and a suggested way to collect it.

## 8. Testing

| Layer | What | Command |
|---|---|---|
| Metric engine | **Golden test** against an *independent* Python audit (`scripts/audit.py` → `data/reference/metrics.json`): 7 snapshot dates (overall, target, progress, 3 attribution views + extras), all 96 daily rows, daily status trend, weekly series (both modes), attendance by day, data quality; deep-equal with 1e-7 tolerance and no ignored keys. Plus time/EOD, dedupe, calculator, strategy numbers, what-if, recommendations, diagnose, projection, cohorts, in-memory mutation semantics, docs-consistency | `pnpm --filter @gc/core test` |
| Database | seed → verify against `metrics.json`, each mutation bumps revision + writes audit, reset restores ₹274,000, draft confirm exactly-once, discard creates nothing, delete-with-activity refused | `pnpm --filter @gc/db test`; `pnpm db:verify` (also on Neon) |
| Copilot tools | Deterministic ground truth for **all 34 eval items** without any LLM, zod/OUT_OF_COVERAGE rejection, name → id resolution, context inheritance, draft idempotency, grounding extractor, JSON-loop parser, rate limiter | `pnpm --filter @gc/ai test` |
| End-to-end | Playwright on a local PGlite DB: changed-data scenarios (spend debit, reset, insight → task, pause, new target), strategy recompute, readout, validation, Copilot panel with a mocked provider (Sources + draft card) | `pnpm --filter web e2e` |
| LLM eval | 34 questions through `/api/chat` with scoring on tools, numbers, forbidden phrases, refusals, drafts and grounding | `pnpm eval --base-url http://localhost:3000` → [`docs/eval-report.md`](docs/eval-report.md) |

**LLM eval result** (`docs/eval-report.md`, local server + PGlite DB, `deepseek-flash`, native tool calling): **30 / 34 (88.2%) — refusals 3/3, drafts 2/2**. A pass needs the expected tool, every expected figure/phrase, no forbidden phrase and **zero untraced figures**. Remaining misses in that run: #10 omitted the confirmed show-up (58.62%), #13 omitted Paid Social's 240 no-shows, #28 and #34 stated a ratio the model computed itself (flagged by the grounding check, as designed). Honest notes: the pass rate moved between runs (25 → 29 → 30 of 34 across prompt/tool-description iterations; the first run was also throttled by the 20-per-10-minute chat limit, which the eval server raises), single runs are noisy at temperature 0.1, and the eval has not yet been run against a deployed Neon eval branch.

## 9. Setup

Prerequisites: Node 22+, pnpm 9 (`corepack enable` or `npx pnpm@9`), [uv](https://docs.astral.sh/uv/) (only to re-convert the workbook).

```bash
pnpm install
cp .env.example apps/web/.env.local     # DATABASE_URL (Neon pooled URL), DEEPSEEK_API_KEY, DEEPSEEK_MODEL, COPILOT_MODE
pnpm db:migrate && pnpm db:seed          # idempotent; `--force` re-seeds
pnpm db:verify                           # snapshots + data quality vs metrics.json
pnpm dev                                 # http://localhost:3000
pnpm test                                # core + db + ai
pnpm --filter web e2e                    # Playwright (local PGlite, never Neon)
pnpm eval --base-url http://localhost:3000   # LLM eval (local server or a Neon eval branch only)
pnpm slides:pdf                          # → docs/strategy-slides.pdf (server must be running)
```

- **No Neon?** Use `DATABASE_URL=pglite:./.pglite` (file DB, embedded Postgres) — the same code path, used by tests and e2e.
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
- No authentication and a single shared demo database: use **Reset to original dataset**; the top bar shows "edits since reset". Rate limits are in-memory per server instance.
- LLM non-determinism: mitigated by tool grounding, the grounding chip and the eval, not eliminated. The eval's pass rate is a sample, and answers can vary between runs.
- Capacity numbers (1,700 / 1,800 / 3,000) are assumptions pending a signed venue layout.

## 12. Sources (checked 27 Nov 2026)

AISHE 2023–24 (MoE) [Box 2](https://cdnbbsr.s3waas.gov.in/s392049debbe566ca5782a3045cf300a3c/uploads/2026/07/202607131602421770.pdf#page=36) · [AISHE 2021–22](https://www.education.gov.in/sites/upload_files/mhrd/files/statistics-new/AISHE%20Book_2021-22_4.pdf) · [NSE-hosted filing (Bengaluru higher education)](https://nsearchives.nseindia.com/corporate/Registration_29092025062424_ProjectScholarspaceConsolidatedDRHP.pdf) · [BIEC brochure](https://www.biec.in/images/PDF/BIEC-%20BROCHURE.pdf) · [BIEC capacity chart](https://www.biec.in/capacity_chart) · [Bengaluru Tech Summit exhibitor manual](https://www.bengalurutechsummit.com/pdf/BTS-Exhibitor-Manual-9sqm.pdf) · [BMRCL route map](https://english.bmrc.co.in/schematic-route-map/) · [IIM Bangalore Unmaad](https://www.iimb.ac.in/unmaad-2026) · [IIT Bombay annual report 2022–23](https://www.iitb.ac.in/sites/www.iitb.ac.in/files/2024-03/Annual%20Report%202022-23.pdf) · [IIT Delhi Rendezvous](https://www.rdv-iitd.org/) · [IIT Madras annual report 2024–25](https://www.iitm.ac.in/sites/default/files/Others/Annual%20Report%202024-25%20final%20upload.pdf) · [YouGov India Media Morph 2024](https://d3nkl3psvxxpe9.cloudfront.net/documents/YouGov_India_Media_Morph_Report_April_2024.pdf) · [DataReportal Digital 2026 India](https://datareportal.com/reports/digital-2026-india) · [Vihaya Events ticketing India](https://events.vihaya.app/reports/event-ticketing-india-2026) · [Eventbrite turnout](https://www.eventbrite.ca/blog/how-to-increase-event-attendance/) · [PheedLoop Event Data Lab #05](https://pheedloop.com/blog/event-data-lab-report-5) · [Superads India CPM](https://www.superads.ai/facebook-ads-costs/cpm-cost-per-mille/india) · [Superads India CPC](https://www.superads.ai/facebook-ads-costs/cpc-cost-per-click/india) · [Hypee creator benchmarks](https://www.hypee.co.in/india-creator-benchmarks) · [Digital Berries rate cards](https://www.digitalberries.co.in/insights/influencer-pricing-report-india-2026) · [Mood Indigo campus representatives](https://my.moodi.org/pr) · [Internshala Student Partner](https://internshala.com/competitions/internshala-student-partner-program/) · [Talkable referral study](https://get.talkable.com/analytics/reward-size-and-conversion) · [Hallsworth et al. SMS reminder trials](https://doi.org/10.1371/journal.pone.0137306) · [Cochrane SMS reminders](https://pubmed.ncbi.nlm.nih.gov/24310741/) · [WhatsApp pricing](https://developers.facebook.com/docs/whatsapp/pricing#rate-cards) · [DeepSeek function calling](https://api-docs.deepseek.com/guides/tool_calls) · [Next.js route handlers](https://nextjs.org/docs/app/getting-started/route-handlers) · [Neon connection pooling](https://neon.com/docs/connect/connection-pooling) · [Vercel Turborepo](https://vercel.com/docs/monorepos/turborepo).
