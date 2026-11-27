# PROGRESS — handoff between sessions

## Session A (M0–M3): DONE — exit gate green

| Gate | Command | Result |
|---|---|---|
| M0 scaffold | `pnpm install && pnpm turbo typecheck test build` | 5/5 tasks successful (typecheck ×2, test, build) |
| M1 convert | `uv run --with openpyxl python scripts/convert_xlsx.py && pnpm --filter @gc/core test -- manifest` | 12/12; counts equal data_audit.md (DM 483/481, People 3685, Interest 11650, Regs 2840, History 5911/5907, Check-ins 3390/3370, Targets 2, Campaigns 7, Event 1, Field guide 86, Read me 8); SHA d63f3e01… |
| M2 golden | `pnpm --filter @gc/core test` (golden.test.ts) | 13/13: 7 snapshot dates (overall/target/target_progress/3 campaign views + extras), 96 `daily_overall`, `daily_status_trend`, `attendance_by_event_day`, `weekly_campaigns` (both modes), full `data_quality` incl. `tables`, event/targets/catalog. `IGNORED_KEYS = []`. 96-day series ≈ 0.35–0.5 s (<2 s) |
| M3 analytics | `pnpm --filter @gc/core test` | strategy §7 numbers (2,972/3,397 · 2,690/3,097 · 2,276/2,725 · 2,401→2,400 / 2,850 · ₹273k/₹279k · 2,206 · −149 · 92/85/80/71/54), floor rule (B1 15→16 ⇒ 2,417, headline 2,400), what-if (+124.19 / −36.56 / ≈+88), recommendations (04-20 and 04-11), diagnose must-flags, calc, projection (post-event=actual; stopped campaign lowers), cohorts, in-memory mutation semantics (§13 list) |
| **Total** | `pnpm --filter @gc/core test` | **8 files, 72 tests passed** |

### Notes for Session B
- `@gc/core` is pure TS source (`main: src/index.ts`). Entry points: `buildDataset(raw, {tableQuality?, revision?})` → `Dataset`; `snapshot(ds, asOf, includeCampaigns?)`; `weeklySeries`, `dailyOverall`, `dailyStatusTrend`, `attendanceByDay`, `dataQuality`, `targetsView`, `recommendCampaigns`, `diagnose`, `projectVisitors`, `projectionBacktest`, `whatIfShift`, `showUpByRegistrationWeek`, `medianDaysToConfirm`, `strategyModel`, `scoreBets`, `calc`, `fmt*`; content in `strategy/content.ts` (BETS, REJECTED_IDEAS, EXPERIMENTS, KNOWN_MISSING, DECISION_RULE_SEEDS, WHY_BENGALURU) and defaults in `strategy/defaults.ts` (DEFAULT_ASSUMPTIONS, DEFAULT_PLAN_BUDGETS, DEFAULT_HISTORY).
- Input rows accept ISO strings **or** epoch ms for timestamp fields (normalised to `+05:30` ISO). `activity_date` is a `YYYY-MM-DD` string. Use `null`, not `undefined`, for blanks (DB loader must map).
- DB path: pass `tableQuality` built from `import_runs` (keyed by slug: `daily_marketing`, `people`, … — same keys as `ds.tableQuality`); `dataQuality()` renames to sheet names for audit parity. Pass `revision` = `app_meta.data_revision`.
- Campaign mgmt `status` (active/paused/stopped) is read from `ds.campaigns[cid].status` (default active) by `recommendCampaigns` display and `projectVisitors`. Planned budgets: pass `planBudgets` to `strategyModel(assumptions, {planBudgets})`.
- Snapshots/weekly are memoised in `ds._cache`; a Dataset must be rebuilt per `data_revision`.
- Decision rules, assumptions are plain arrays (`DecisionRule[]`, `Assumption[]`) so the DB tables can feed them directly.
- `reconfirmed` examples in data quality are ordered by registration_id (audit.py used sheet order, which is the same for this workbook).
- Backtest result (`projectionBacktest`, mid vs final 2,050): 02-16 1,855 · 02-23 2,137 · 03-02 2,047 · 03-09 1,763 · 03-16 1,807 · 03-23 2,033 · 03-30 2,140 · 04-06 2,151. Actual inside low–high band at 7/8 as-ofs (miss: 03-09, the C04 zero week). Report honestly in README.
- Env/tooling: pnpm was not installed; installed `pnpm@9.15.9` via `npm i -g pnpm@9 --prefix ~/.local` (PATH needs `~/.local/bin`). shadcn initialised with card, table, tabs, dialog, sheet, select, input, badge, tooltip, dropdown-menu, sonner, button (shadcn may need `<Toaster/>`/`TooltipProvider` wired into the layout in M5). `apps/web/.env.local` is git-ignored (`*.local`); never printed.
- Not yet done (later sessions): `docs-consistency.test.ts` (needs README + slides module), `scripts/slides-pdf.ts`, DB/AI packages, e2e. `data/reference/*` and `scripts/audit.py` are copied from scratch and untouched.
- No git commits made (git init only).

---

## Session B (M4–M7): DONE — exit gate green

| Gate | Command | Result |
|---|---|---|
| M4 db (PGlite) | `pnpm --filter @gc/db test` | 10/10: seed→verify (5 snapshots + data_quality + full 96-day/weekly series vs metrics.json), idempotent seed, mutation → revision bump + audit_log, reset restores ₹274,000 and appends (never truncates) audit_log, double-confirm creates exactly 1 task (`already` flag on the loser), discard creates nothing, campaign-with-activity delete refused, date/invariant validation, walk-in → 2,051/3,626 with show-up unchanged, repeated check-in id is a no-op, target version + status append, dispatcher |
| M4 db (Neon) | `pnpm db:migrate && pnpm db:seed --force && pnpm db:verify --full` then `pnpm db:reset && pnpm db:verify` | `db:verify OK on postgres — 5 snapshots + data_quality match metrics.json` (~3 s) before and after a reset |
| M5 build | `pnpm --filter web build` | compiled; routes `/ /campaigns /campaigns/[id] /diagnose /strategy /execution /data /copilot(placeholder)` + `/api/{admin/reset,export,mutations/[entity]}`. `?asOf=2025-04-20` → 2,050 / 2,200 (93.2%), ₹274,000, headroom ₹26,000, show-up 68.75% (73.21% headline incl. 125 walk-ins). `?asOf=2025-03-14` → "Attendee launch plan" |
| M6 | `/strategy`, `/diagnose` (covered by e2e f, g) | 2,401 → 2,400 / 2,850; ₹180k + ₹93k + ₹27k = ₹300k; sensitivity 2,206 / −149; scores 92/85/80/71/54; B1 clubs 15→16 ⇒ total 2,417, headline 2,400. Diagnose lists C02 wk to 9 Mar (105→35) and C04 (8→0 on 464 clicks) |
| M7 e2e | `pnpm --filter web e2e` (Playwright, local `next dev` on a PGlite file DB) | **10/10**: (a) +₹1,000 C02 debit 16 Apr → ₹275,000 / C02 ₹276.47 / 13 Apr still ₹276,500 / audit row; (b) UI reset → ₹274,000; (c) Diagnose Create task → on Execution after reload with evidence chip, status change persists, audit row; (d) pause C02 persists, lowers pre-event projection; (e) new target version → "of 2,500 · 82.0%"; (f) Strategy live recompute + Save persists; (g) findings; (h) experiment readout → Scale → follow-up task; (i) validation errors + delete-refused; 404 for unknown campaign |
| Repo gate | `pnpm turbo typecheck test build lint --force` | 10/10 tasks. core 73 tests, db 10 tests |
| Neon warm timings | `next start` (prod build) against Neon | `/` 0.4–0.9 s, `/campaigns` 0.27 s, `/strategy` 0.63 s, `/diagnose` 0.52 s, `/execution` 0.36 s, `/data` 0.47 s (first hit after start ≈ 2.9 s incl. dataset load) |

### What exists now
- `@gc/db`: `src/schema.ts` (drizzle, generated SQL in `drizzle/`), `client.ts` (driver-neutral `Db`/`Q`: postgres-js `prepare:false` or PGlite; `migrate`, `loadEnv`), `seed.ts` (`jsonb_populate_recordset` bulk load; `seed.*` pristine schema from `sql/seed_schema.sql`; management seed: team, 5 bets, 8 rejected ideas, 5 experiments, assumptions, rules, 8 starter tasks), `load.ts` (`loadDataset` cached per `dataset_revision`; returns a shallow clone stamped with current `data_revision`), `mutations.ts` (all §5 mutations + `applyMutation` dispatcher + drafts: `createDraft/confirmDraft/discardDraft`), `reset.ts`, `verify.ts`. CLI: `pnpm db:migrate|db:seed [--force]|db:reset|db:verify [--full]` (loads `apps/web/.env.local`; override with `DATABASE_URL=pglite:/abs/path`).
- `app_meta` has an extra `dataset_revision` (bumped only by writes that affect analytics; tasks/assumption edits bump `data_revision` only), so editing tasks does not reload 25k rows.
- `@gc/core` additions: `deepDiff` (shared with `db:verify`), `evaluateExperiment` (scale/change/stop/insufficient_sample), `historyFromDataset` (live 2025 history for the strategy model; equals `DEFAULT_HISTORY` on pristine data).
- Web: shell (nav, as-of picker + chips, attribution select, revision badge → change log, reset dialog), Overview, Campaigns (+ `[id]`), Diagnose (findings, heat table, cohort lag, data-quality panel, known-missing), Strategy (live workbench, bets re-rank, rejected ideas, experiment thresholds, decision-rules editor, audience sizing), Execution (kanban, experiments board + readout, campaign mgmt + allocation vs cap), Data (7 tabs + change log, server-side pagination/filters, forms, export JSON), `/api/mutations/[entity]`, `/api/admin/reset`, `/api/export`. `/copilot` is a placeholder (M8).

### Notes for Session C
- **Trend-break ids** use the week's *Sunday end date*: `trend_break:C02:2025-03-09`, `trend_break:C04:2025-03-09` (the plan's "week 03-09"). Starter tasks 1–2 carry those insight ids. Neon was reseeded with `--force` after this fix.
- Draft payload for `propose_task` is validated at `createDraft` (task shape); `confirmDraft(db, id, editedPayload?)` is exactly-once and returns `{already:true, result_ref}` for repeats (`task:<id>`, `campaign:<id>`, `experiment:<id>`). Drafts API routes `/api/drafts/:id/{confirm,discard}` are not built yet (thin wrappers over those functions + `getDraft`).
- Use `getDb()` (process-wide singleton) + `loadDataset(db)` for tool code; `getCtx()` in `apps/web/lib/data.ts` is the page-level equivalent (reads assumptions/rules from DB).
- Next only externalises `@electric-sql/pglite` and `postgres` because both are **direct deps of apps/web** (pnpm strictness); keep them there. `import.meta.url` is unusable in bundled `@gc/db` — `REPO_ROOT` is found by walking up from `cwd` to `pnpm-workspace.yaml`.
- jsonb params are cast `$n::text::jsonb` (postgres-js double-encodes a string passed to a `jsonb`-typed param).
- e2e uses `DATABASE_URL=pglite:<repo>/.pglite-e2e` (git-ignored) and `MUTATION_RATE_LIMIT=100000`; it never touches Neon. Running `next dev` overwrites `.next`, so rebuild before `next start`.
- "Overdue" on the task board compares due date with the real current date (starter tasks are 2026 "next edition" dates, so they show as overdue today).
- Pitfall in this sandbox: `pkill -f "next dev"` kills the invoking shell; find the pid with `ss -ltnp` instead.
- Not done (by design, later sessions): Copilot (M8), eval (M9), `/slides`, README, docs-consistency test, screenshots, error/loading boundaries beyond a dash 404 (M10–M11).
- No git commits made. `git rm --cached apps/web/app/page.tsx` left a staged deletion (the root page moved to `app/(dash)/page.tsx`).

---

## Session C (M8–M11): DONE — exit gate green

| Gate | Command | Result (real output) |
|---|---|---|
| Repo gate | `pnpm turbo typecheck lint test build` | `Tasks: 13 successful, 13 total` (core 76 tests, db 10, ai 51; web build compiled: `/ /campaigns /campaigns/[id] /diagnose /strategy /execution /data /copilot /slides` + `/api/{chat,drafts/[id]/confirm,drafts/[id]/discard,admin/reset,export,mutations/[entity]}`) |
| M8 tool tests | `pnpm --filter @gc/ai test` | 51/51: all **34 eval items** have deterministic ground truth through the tools (no LLM), zod/OUT_OF_COVERAGE, name→id, context inheritance, what_if never persists, calculate safety, propose_task→pending draft + concurrent double-confirm = exactly 1 task, grounding extractor (6), JSON-loop parser/retry, rate limiter |
| M8 smoke | `BASE_URL=http://localhost:3300 pnpm smoke` (prod build, Neon) | `native tool calls in 4/4 turns` (Q1 get_funnel+get_targets; Q9 get_funnel; Q10 get_funnel(C02); Q16 describe_data) → native tool calling is reliable; **JSON fallback is built and unit-tested but not needed** (`COPILOT_MODE=json`) |
| M9 eval | `pnpm eval --base-url http://localhost:3100` (local, PGlite) | **30/34 (88.2%) · refusals 3/3 · drafts 2/2** → `docs/eval-report.md`. Iteration history: 11/34 (first run, 429s from the chat rate limit) → 25 → 25 → 29 → 29 → 30. Run-to-run noise is real (±3 items). Misses: #10 (omits confirmed 58.62%), #13 (omits the 240), #28/#34 (self-computed ratios flagged by the grounding check) |
| M10 slides | `BASE_URL=http://localhost:3100 pnpm slides:pdf` | `pdfinfo`: `Pages: 3`, `Page size: 960 x 540 pts`; page 1 contains "Aman Gupta"; numbers come from `slideContent(strategyModel)` |
| M10 docs | `pnpm --filter @gc/core test` (docsConsistency.test.ts) | model = README = slides module for 2,400 · 2,850 · 2,972 · 3,397 · 2,690 · 3,097 · 2,276 · 2,725 · ₹273,000 · ₹279,000 · ₹27,000 · 2,206 · 92/85/80/71/54 |
| M10 screenshots | `BASE_URL=… COPILOT_SHOT=1 pnpm tsx scripts/screenshots.ts` | 10 PNGs in `docs/screenshots/` (all pages + live Copilot panel with Sources and "✓ All 31 figures traced") |
| e2e | `pnpm --filter web e2e` | **13/13**: the 10 changed-data scenarios (a–i + 404) + Copilot panel (mock provider: Sources + grounding chip), draft confirm → exactly one task on Execution, discard creates nothing |
| Neon | `pnpm db:verify` | `db:verify OK on postgres — 5 snapshots + data_quality match metrics.json (3348 ms)` |
| Neon timings | `next start` (prod build) on Neon | warm: `/` 0.37 s · `/campaigns` 0.26 · `/campaigns/C02` 0.42 · `/diagnose` 0.49 · `/strategy` 0.61 · `/execution` 0.31 · `/data` 0.51 · `/copilot` 0.11 · `/slides` 0.26 (first hit after start ≈ 3.3 s incl. dataset load) |

### What was added in Session C
- `@gc/ai`: `tools.ts` (18 tools; `runTool` = zod validation + typed `{error:{code,message,hint}}`), `env.ts` (`makeEnv` pins one dataset revision), `systemPrompt.ts` (v1.2, campaign-id map, "final message self-contained", "no self-computed figures", scenario-only for forward-looking), `grounding.ts` (extractor + allowed-set; figures that are a sum/difference/complement of two traced figures in the same answer are reported as *derived*, not failures), `agent.ts` (AI SDK **v7**: `streamText` with `instructions`, `isStepCount(6)`, `toUIMessageStream`; DeepSeek via `@ai-sdk/openai-compatible` with a fetch wrapper that sends `thinking:{type:'disabled'}` and falls back to `deepseek-chat` on model errors), `jsonFallback.ts`, `mock.ts`, `eval/{questions,score,client,run,smoke}.ts`.
- Web: `/api/chat` (rate limit 20/10 min per IP hash, daily cap 1,500 via `chat_logs`, history trimmed to 16, `COPILOT_MODE=native|json|mock`, logs question/tool calls/grounding/latency), `/api/drafts/:id/{confirm,discard}`, Copilot dock (resizable side panel, persisted open state) + `/copilot` full page sharing one `Chat` singleton, Sources, draft cards with editable fields, grounding chip, error/retry state; `/slides`; `scripts/{slides-pdf,screenshots}.ts`; loading skeletons on pages that never 404 (a `loading.tsx` above `campaigns/[id]` or a `Suspense` around `{children}` turns the unknown-campaign 404 into a streamed 200 — covered by the e2e 404 test); `error.tsx`, root `not-found.tsx`.
- **Overdue fix:** the task board's *overdue* now compares due dates with the **selected as-of date** (the app's clock), labelled "Overdue (due before as-of …)" with a tooltip. Rationale: the seeded tasks are next-edition (2026) items on a 2025 dataset, so the real-world date marked all of them overdue.
- README complete per §15 (incl. honest **Tools used**: Claude Code (Sonnet/Opus) + OpenAI Codex as coding/research assistants, DeepSeek powering the Copilot). `.env.example` at repo root and `apps/web`. `turbo.json`: `build` now depends on the same package's `typecheck` (they raced on `.next/types`).

### Notes for the orchestrator (deploy)
- Set env on Vercel: `DATABASE_URL` (Neon pooled), `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL=deepseek-flash`, `COPILOT_MODE=native`, `NEXT_PUBLIC_SITE_URL` (then re-run `pnpm slides:pdf` so the slide footer shows the live URL; README still has the `https://<deploy-url>` placeholder in the summary).
- Run the eval post-deploy **only on a Neon eval branch** (setup items write data and reset afterwards): `pnpm eval --base-url https://<url>`; raise `CHAT_RATE_LIMIT` (and `MUTATION_RATE_LIMIT`) on that deployment while it runs, otherwise the default 20/10-min chat limit returns 429s.
- AI SDK is v7 (`ai@7.0.183`): `instructions` (not `system`), `isStepCount`, `toUIMessageStream({stream: result.stream})`, `createUIMessageStreamResponse`. `DEEPSEEK_THINKING=enabled` re-enables reasoning (not recommended: needs `reasoning_content` round-trips).
- The Copilot answers are LLM-generated; grounding flags untraced figures but does not block them. Local eval DB / dev servers used `.pglite-eval` (git-ignored). No commits made.
