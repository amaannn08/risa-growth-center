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
