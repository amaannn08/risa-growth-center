# Copilot eval report

- Run: 2026-11-27T00:57:53.475Z · mode `native` · model `deepseek-flash` · target http://localhost:3100
- **Overall: 30/34 (88.2%)** · refusals 3/3 · drafts 2/2
- Scoring per item: any-expected-tool called · every `must` figure/phrase present (numbers matched numerically at the expected precision) · no `mustNot` · **grounding: 0 untraced figures** · refusals must name the missing data and invent no number · drafts must call `propose_task` and never claim creation.
- Deterministic ground truth (no LLM) for all 34 items lives in `packages/ai/test/tools.test.ts`.

| # | Pass | Question | Tools called | Notes |
|---|---|---|---|---|
| 1 | ✅ | What's our funnel as of data close? | get_funnel, get_targets |  |
| 2 | ✅ | How close were we to target on 20 April? | get_targets, get_funnel, calculate, calculate |  |
| 3 | ✅ | What was our spend at event close vs data close, and why are they different? | get_spend_ledger, calculate, calculate |  |
| 4 | ✅ | Which target applied on 14 March vs 15 March and what moved? | get_targets, get_targets, calculate, calculate, calculate, calculate, calculate, calculate, calculate |  |
| 5 | ✅ | On 11 April how many registrations were confirmed, cancelled and waitlisted, and how many still interested? | get_funnel |  |
| 6 | ✅ | How many people came on Sunday and how many of them were new? | get_attendance |  |
| 7 | ✅ | Why do 3,390 check-in rows give only 2,050 visitors? | data_quality, get_attendance, calculate, calculate, calculate, calculate |  |
| 8 | ✅ | What happened to registration R0001? | lookup_registration |  |
| 9 | ✅ | What's the registered show-up rate? Is 2,050/2,800 right? | get_funnel, get_attendance, calculate |  |
| 10 | ❌ | And for Paid Social? | get_funnel, calculate, calculate, compare_campaigns | missing: 58.62 |
| 11 | ✅ | Which campaign has the lowest cost per visitor? | compare_campaigns |  |
| 12 | ✅ | Does College Partnerships really beat Creator Partners? | compare_campaigns, compare_campaigns, get_funnel, get_funnel, calculate, calculate |  |
| 13 | ❌ | Where is the biggest bottleneck? | diagnose_bottlenecks, get_funnel | missing: 240 |
| 14 | ✅ | What happened to Paid Social in early March? | get_trend, get_trend, calculate, calculate, calculate, calculate, get_spend_ledger |  |
| 15 | ✅ | Why did College Partnerships register nobody the week of 9 March? | get_trend, get_trend, get_funnel, list_campaigns |  |
| 16 | ✅ | What's our unique reach? | describe_data, get_funnel |  |
| 17 | ✅ | What was ticket revenue? | describe_data |  |
| 18 | ✅ | What's the gender split of attendees? | describe_data |  |
| 19 | ✅ | Why did people cancel? Then create a reminder task. | describe_data, get_funnel, propose_task |  |
| 20 | ✅ | What if we move ₹10k from Paid Social to College Partnerships? | what_if, compare_campaigns |  |
| 21 | ✅ | What would visitor CPA be if we'd spent the full ₹300,000? | get_funnel, get_spend_ledger, calculate, calculate |  |
| 22 | ✅ | What's the next-edition plan and how confident are we? | get_strategy_model, get_targets, calculate, calculate |  |
| 23 | ✅ | Create a task for Meera to launch the group-pass pilot by 2026-01-20 | describe_data, get_strategy_model, propose_task |  |
| 24 | ✅ | What tasks are open for Paid Social? | list_tasks |  |
| 25 | ✅ | What are the stop thresholds for the referral experiment? | list_experiments |  |
| 26 | ✅ | Total spend at data close and Paid Social's cost per visitor? | get_spend_ledger, get_funnel |  |
| 27 | ✅ | How many identified people and verified visitors do we have now, and what is the registered show-up? | get_funnel |  |
| 28 | ❌ | How many visitors do we have now, and how many verified admission events? | get_funnel, get_attendance | untraced: 1.59 |
| 29 | ✅ | Which campaigns are active? | list_campaigns |  |
| 30 | ✅ | What is our progress vs the visitor target at event close? | get_targets, get_funnel |  |
| 31 | ✅ | How many attended without registering, and what is the scanner-only count? | get_attendance, data_quality |  |
| 32 | ✅ | CTR of Paid Social vs Organic Search? | compare_campaigns, calculate |  |
| 33 | ✅ | What attendance will we get if we double paid budget next year? | get_strategy_model, get_funnel, what_if, calculate |  |
| 34 | ❌ | How did the campaign do? | get_funnel, get_targets, diagnose_bottlenecks, calculate, calculate | untraced: 58.61% |

## Transcript excerpts

**#1** What's our funnel as of data close?
> **At data close (2025-04-20, first-touch), the funnel ran 3,625 identified → 3,317 engaged → 2,800 registered → 2,500 confirmed → 2,050 unique verified visitors, with 125 walk-ins; the visitor goal (2,200) was missed by 150 and registrations (3,200) by 400.** …  
> _get_funnel → get_targets · 4584 ms_

**#2** How close were we to target on 20 April?
> On 20 April we beat the identified-people goal but missed registrations and unique verified visitors, against the revised plan in effect since 15 Mar. | Goal (revised plan) | Actual | Goal | Gap | % of goal | |---|---|---|---|---| | Identified external people …  
> _get_targets → get_funnel → calculate → calculate · 4848 ms_

**#3** What was our spend at event close vs data close, and why are they different?
> Net spend fell by ₹2,500 between event close and data close, because ₹6,500 of credits were posted after event close (₹2,500 of them dated after 13 Apr). | Checkpoint | Date | Net spend | Headroom vs ₹300,000 cap | |---|---|---|---| | Event close | 2025-04-13 …  
> _get_spend_ledger → calculate → calculate · 4781 ms_

**#4** Which target applied on 14 March vs 15 March and what moved?
> The launch plan applied through 14 March; the revised plan took effect 15 March 09:00 IST and raised every goal by 400 people and the budget cap by ₹60,000. | Goal | 14 Mar (launch plan) | 15 Mar (revised plan) | Change | |---|---|---|---| | Identified externa…  
> _get_targets → get_targets → calculate → calculate → calculate → calculate → calculate → calculate → calculate · 4257 ms_

**#5** On 11 April how many registrations were confirmed, cancelled and waitlisted, and how many still interested?
> On 11 April 2025 (as_of, first-touch view): 2,500 confirmed, 183 cancelled, 88 waitlisted, 29 still interested — out of 2,800 registered. | Status | People | |---|---| | Confirmed | 2,500 | | Cancelled | 183 | | Waitlisted | 88 | | Interested | 29 | | Register…  
> _get_funnel · 3058 ms_

**#6** How many people came on Sunday and how many of them were new?
> On Sunday 13 Apr 2025, 1,345 unique external visitors were verified; 620 of them were new and 725 were returning (Saturday 12 Apr had 1,430 visitors, all new) [get_attendance · 2025-04-20 · r68]. | Day | Verified admission events | Distinct visitors | New | Re…  
> _get_attendance · 3656 ms_

**#7** Why do 3,390 check-in rows give only 2,050 visitors?
> **Because check-in rows are admission events, not people: 3,390 rows collapse to 3,370 unique rows, 3,250 verified external admission events, and 2,050 unique verified external visitors — the last drop is repeat entries (734 external people had multiple attemp…  
> _data_quality → get_attendance → calculate → calculate → calculate → calculate · 5295 ms_

**#8** What happened to registration R0001?
> R0001 (Leena Kapoor, external, first touch C01 Campus Ambassadors) went interested → confirmed → cancelled → confirmed again, and was ultimately admitted on 13 Apr after one denied scan on 12 Apr. | Time (IST) | Event | |---|---| | 2025-02-25 09:00 | First see…  
> _lookup_registration · 3148 ms_

**#9** What's the registered show-up rate? Is 2,050/2,800 right?
> No — 2,050/2,800 is not the registered show-up rate. The registered show-up rate is **68.75%** (1,925 of 2,800 registered people attended) [get_funnel · 2025-04-20 · r68]. | Measure | Numerator / denominator | Rate | |---|---|---| | Registered show-up (registe…  
> _get_funnel → get_attendance → calculate · 4459 ms_

**#10** And for Paid Social?
> **Paid Social's registered show-up rate is 50.00% (340 of 680 registered attended) — tied for lowest of the seven campaigns and 18.75 points below the 68.75% portfolio rate** [get_funnel · 2025-04-20 · r68; compare_campaigns · 2025-04-20 · r68]. | Rank | Campa…  
> _get_funnel → calculate → calculate → compare_campaigns · 6335 ms_

**#11** Which campaign has the lowest cost per visitor?
> **Student Referrals (C05) has the lowest cost per unique verified external visitor: ₹69.09** (₹19,000 net spend / 275 visitors) [compare_campaigns · 2025-04-20 · r68]. | Rank | Campaign | Visitor CPA | Net spend | Visitors | |---|---|---|---|---| | 1 | C05 Stu…  
> _compare_campaigns · 3169 ms_

**#12** Does College Partnerships really beat Creator Partners?
> Yes — on every measured stage, College Partnerships (C04) is clearly ahead of Creator Partners (C03) at 2025-04-20, first-touch. | Metric | C04 College Partnerships | C03 Creator Partners | |---|---|---| | Net spend | ₹31,000 | ₹59,000 | | Unique verified visi…  
> _compare_campaigns → compare_campaigns → get_funnel → get_funnel → calculate → calculate · 4398 ms_

**#13** Where is the biggest bottleneck?
> **The biggest bottleneck is confirmed → attended: 575 confirmed registrants never showed up (confirmed show-up 77.00%, 1,925/2,500), and Paid Social (C02) is the worst offender at 58.62% (340/580, ~107 people lost vs the overall rate)** [diagnose_bottlenecks ·…  
> _diagnose_bottlenecks → get_funnel · 4590 ms_

**#14** What happened to Paid Social in early March?
> **Paid Social (C02) registrations fell sharply in the week of 3–9 Mar, then clicks collapsed the following week — the cause is not in the data.** | Week (Mon–Sun) | Registrations | Clicks | Regs/click | |---|---|---|---| | 10–16 Feb | 124 | 986 | — | | 17–23 F…  
> _get_trend → get_trend → calculate → calculate → calculate → calculate → get_spend_ledger · 5586 ms_

**#15** Why did College Partnerships register nobody the week of 9 March?
> **The premise needs correcting: the zero-registration week was 3–9 March, not the week of 9 March.** The week starting 10 March was C04's biggest jump of the period (0 → 64 registrations). The data cannot explain *why* either week moved — no landing-page, post…  
> _get_trend → get_trend → get_funnel → list_campaigns · 4454 ms_

**#16** What's our unique reach?
> **Unique reach isn't in the data.** Reach is only recorded as a non-unique daily platform sum (666,297), and cross-day/cross-platform audience overlap is not supplied — so no deduplicated reach figure exists [describe_data · 2025-04-20 · r68]. Closest availabl…  
> _describe_data → get_funnel · 2826 ms_

**#17** What was ticket revenue?
> **The data cannot answer this: CampusFest 2025 has no revenue or ticket-price field.** `describe_data` lists "Revenue" and "Ticket price / paid vs free" under KNOWN_MISSING, so no ticket revenue figure exists in the dataset [describe_data · 2025-04-20 · r68]. …  
> _describe_data · 3148 ms_

**#18** What's the gender split of attendees?
> The dataset cannot answer this: gender (and age or any other demographic) is not recorded for attendees or anyone else — it's listed in KNOWN_MISSING [describe_data · 2025-04-20 · r68]. **Closest available evidence (no demographic breakdown):** - 2,050 unique …  
> _describe_data · 2591 ms_

**#19** Why did people cancel? Then create a reminder task.
> **Why people cancelled is not in the data** — cancellation reasons are a KNOWN_MISSING field [describe_data · 2025-04-20 · r68]. Only counts and status history exist. Closest evidence (first-touch, as of 2025-04-20) [get_funnel · 2025-04-20 · r68]: - 183 cance…  
> _describe_data → get_funnel → propose_task · 6333 ms_

**#20** What if we move ₹10k from Paid Social to College Partnerships?
> **Scenario (not evidence):** shifting ₹10,000 from Paid Social to College Partnerships would add roughly **+88 net unique verified visitors** at historical average CPAs — but marginal returns of extra spend are unmeasured, so treat this as an upper-bound illus…  
> _what_if → compare_campaigns · 3354 ms_

**#21** What would visitor CPA be if we'd spent the full ₹300,000?
> **If the same 2,050 unique verified visitors had been produced for ₹300,000, visitor CPA would be ₹146.34 — but that is a scenario, not a forecast: the data cannot tell us how many extra visitors the unspent ₹26,000 would have bought.** | Item | Value | |---|-…  
> _get_funnel → get_spend_ledger → calculate → calculate · 4362 ms_

**#22** What's the next-edition plan and how confident are we?
> **The next-edition plan is a scenario, not a forecast: base 2,400 unique verified visitors (+17.07% vs 2025's 2,050) and stretch 2,850 (+18.75% vs base), both inside the 3,000 weekend capacity cap.** Confidence is moderate — most bet inputs are tagged assumpti…  
> _get_strategy_model → get_targets → calculate → calculate · 4383 ms_

**#23** Create a task for Meera to launch the group-pass pilot by 2026-01-20
> Draft task created for Meera (owner T03), due 2026-01-20 — pending your Confirm; nothing is on the board yet. | Field | Value | |---|---| | Title | Launch group-pass pilot (B1 College group passes) by 2026-01-20 | | Owner | Meera (T03) | | Due | 2026-01-20 | |…  
> _describe_data → get_strategy_model → propose_task · 5127 ms_

**#24** What tasks are open for Paid Social?
> One open task exists for Paid Social (C02): a P0 landing-page audit, still in `todo`. | Field | Value | |---|---| | Task | Audit Paid Social landing page drop (wk of 9 Mar: 105→35 regs) | | Status / priority | todo / p0 | | Owner | Arjun Verma (T04) | | Due | …  
> _list_tasks · 2683 ms_

**#25** What are the stop thresholds for the referral experiment?
> **Tiered friend referrals (B3) stops if visit→registration falls below 10% after 200 qualified visits** — or if abuse exceeds 5%, or cost exceeds ₹180 per incremental visitor [list_experiments · 2025-04-20 · r68]. | Rule | Threshold | |---|---| | Primary KPI |…  
> _list_experiments · 2494 ms_

**#26** Total spend at data close and Paid Social's cost per visitor?
> **Total net spend at data close (2025-04-20) was ₹275,000; Paid Social's cost per unique verified visitor was ₹276.47.** | Metric | Value | Source | |---|---|---| | Net spend, data close (2025-04-20) | ₹275,000 | [get_spend_ledger · 2025-04-20 · r69] | | Gross…  
> _get_spend_ledger → get_funnel · 3866 ms_

**#27** How many identified people and verified visitors do we have now, and what is the registered show-up?
> As of 2025-04-20 (first-touch, rev 72): **3,626 identified people** and **2,051 unique verified external visitors**; **registered show-up is 68.75%** (1,925 of 2,800 registered attended) [get_funnel · 2025-04-20 · r72]. | Metric | Value | |---|---| | Identifie…  
> _get_funnel · 3328 ms_

**#28** How many visitors do we have now, and how many verified admission events?
> **2,050 unique verified external visitors, from 3,251 verified admission events** (as of 2025-04-20, first-touch view) [get_funnel · 2025-04-20 · r74; get_attendance · 2025-04-20 · r74]. | Metric | Value | |---|---| | Unique verified external visitors | 2,050 …  
> _get_funnel → get_attendance · 3467 ms_

**#29** Which campaigns are active?
> Six of seven campaigns are active as of 2025-04-20 (C02 Paid Social is not active). | ID | Campaign | Owner | Plan budget | Net spend | Recommendation | |---|---|---|---|---|---| | C01 | Campus Ambassadors | Meera Iyer | ₹42,000 | ₹42,000 | Scale | | C03 | Cre…  
> _list_campaigns · 3163 ms_

**#30** What is our progress vs the visitor target at event close?
> At event close (2025-04-20) we reached **2,050 of 2,500 unique verified external visitors — 82.00% of the visitor target, a shortfall of 450** [get_targets · 2025-04-20 · r78]. | Goal (Eval stretch plan, effective 2025-04-01) | Actual | Goal | Gap | Progress |…  
> _get_targets → get_funnel · 3591 ms_

**#31** How many attended without registering, and what is the scanner-only count?
> **125 people attended without registering (walk-ins), and 1,810 unique external visitors were verified by scanner only** [get_attendance · 2025-04-20 · r79]. | Measure | Count | Definition | |---|---|---| | Walk-ins | 125 | attended without registration | | Sc…  
> _get_attendance → data_quality · 3686 ms_

**#32** CTR of Paid Social vs Organic Search?
> Organic Search has the higher CTR: 3.51% vs 2.11% for Paid Social (a 1.41 percentage-point gap) [compare_campaigns · 2025-04-20 · r79]. | Campaign | CTR | Clicks / Impressions | Status | Recommendation | |---|---|---|---|---| | C06 Organic Search | 3.51% | 2,4…  
> _compare_campaigns → calculate · 3839 ms_

**#33** What attendance will we get if we double paid budget next year?
> **Scenario only — the data cannot answer this directly.** The dataset has no experiment where paid budget was varied, so marginal returns of extra paid spend are unmeasured; the closest evidence is 2025 Paid Social (C02) at ₹273.53 per unique verified visitor,…  
> _get_strategy_model → get_funnel → what_if → calculate · 5470 ms_

**#34** How did the campaign do?
> **CampusFest 2025 missed its revised attendee and registration goals but beat the identified-people goal and stayed under budget.** 2,050 unique verified external visitors vs a 2,200 goal (93.18%), 2,800 registrations vs 3,200 (87.50%), 3,625 identified vs 3,6…  
> _get_funnel → get_targets → diagnose_bottlenecks → calculate → calculate · 4260 ms_

