# Copilot eval report

- Run: 2026-11-27T01:17:30.605Z · mode `native` · model `deepseek-flash` · target https://risa-growth-center-six.vercel.app
- **Overall: 32/34 (94.1%)** · refusals 3/3 · drafts 2/2
- Scoring per item: any-expected-tool called · every `must` figure/phrase present (numbers matched numerically at the expected precision) · no `mustNot` · **grounding: 0 untraced figures** · refusals must name the missing data and invent no number · drafts must call `propose_task` and never claim creation.
- Deterministic ground truth (no LLM) for all 34 items lives in `packages/ai/test/tools.test.ts`.

| # | Pass | Question | Tools called | Notes |
|---|---|---|---|---|
| 1 | ✅ | What's our funnel as of data close? | get_funnel |  |
| 2 | ✅ | How close were we to target on 20 April? | get_targets, get_funnel, calculate, calculate |  |
| 3 | ✅ | What was our spend at event close vs data close, and why are they different? | get_spend_ledger, calculate, calculate |  |
| 4 | ✅ | Which target applied on 14 March vs 15 March and what moved? | get_targets, get_targets, calculate, calculate, calculate, calculate, calculate, calculate, calculate |  |
| 5 | ✅ | On 11 April how many registrations were confirmed, cancelled and waitlisted, and how many still interested? | get_funnel |  |
| 6 | ✅ | How many people came on Sunday and how many of them were new? | get_attendance |  |
| 7 | ✅ | Why do 3,390 check-in rows give only 2,050 visitors? | data_quality, get_attendance, calculate, calculate, calculate, calculate |  |
| 8 | ✅ | What happened to registration R0001? | lookup_registration |  |
| 9 | ✅ | What's the registered show-up rate? Is 2,050/2,800 right? | get_funnel |  |
| 10 | ✅ | And for Paid Social? | get_funnel, compare_campaigns, calculate |  |
| 11 | ✅ | Which campaign has the lowest cost per visitor? | compare_campaigns |  |
| 12 | ✅ | Does College Partnerships really beat Creator Partners? | compare_campaigns, get_funnel, get_funnel, calculate, calculate |  |
| 13 | ✅ | Where is the biggest bottleneck? | diagnose_bottlenecks, get_funnel |  |
| 14 | ✅ | What happened to Paid Social in early March? | get_trend, get_trend, calculate, calculate, calculate, calculate, list_campaigns |  |
| 15 | ❌ | Why did College Partnerships register nobody the week of 9 March? | get_trend, get_trend, get_trend, get_trend, get_trend, get_trend, describe_data, list_campaigns | missing: 80; 97 |
| 16 | ✅ | What's our unique reach? | describe_data, get_funnel |  |
| 17 | ✅ | What was ticket revenue? | describe_data |  |
| 18 | ✅ | What's the gender split of attendees? | describe_data |  |
| 19 | ✅ | Why did people cancel? Then create a reminder task. | describe_data, get_funnel, propose_task |  |
| 20 | ✅ | What if we move ₹10k from Paid Social to College Partnerships? | what_if, compare_campaigns |  |
| 21 | ✅ | What would visitor CPA be if we'd spent the full ₹300,000? | get_funnel, get_spend_ledger, calculate, calculate |  |
| 22 | ✅ | What's the next-edition plan and how confident are we? | get_strategy_model, get_targets, calculate, calculate, calculate, calculate |  |
| 23 | ✅ | Create a task for Meera to launch the group-pass pilot by 2026-01-20 | describe_data, list_experiments, propose_task |  |
| 24 | ✅ | What tasks are open for Paid Social? | list_tasks |  |
| 25 | ✅ | What are the stop thresholds for the referral experiment? | list_experiments |  |
| 26 | ✅ | Total spend at data close and Paid Social's cost per visitor? | get_spend_ledger, get_funnel |  |
| 27 | ✅ | How many identified people and verified visitors do we have now, and what is the registered show-up? | get_funnel |  |
| 28 | ✅ | How many visitors do we have now, and how many verified admission events? | get_funnel, get_attendance |  |
| 29 | ✅ | Which campaigns are active? | list_campaigns |  |
| 30 | ❌ | What is our progress vs the visitor target at event close? | get_targets, get_funnel | untraced: 93.18% |
| 31 | ✅ | How many attended without registering, and what is the scanner-only count? | get_attendance, data_quality |  |
| 32 | ✅ | CTR of Paid Social vs Organic Search? | compare_campaigns |  |
| 33 | ✅ | What attendance will we get if we double paid budget next year? | get_strategy_model, get_funnel, what_if, calculate |  |
| 34 | ✅ | How did the campaign do? | get_funnel, get_targets, diagnose_bottlenecks |  |

## Transcript excerpts

**#1** What's our funnel as of data close?
> **At data close (2025-04-20, first-touch), 2,050 unique verified external visitors attended from 2,800 registrations — 150 short of the 2,200 visitor goal, with ₹26,000 of budget unspent.** | Stage (unique people) | Count | Step rate | |---|---|---| | Identifi…  
> _get_funnel · 7363 ms_

**#2** How close were we to target on 20 April?
> **We hit the identified-people goal but missed registrations and verified visitors.** Against the revised plan in effect from 15 Mar 2025: | Goal | Actual | Goal | Gap | Progress | |---|---|---|---|---| | Identified external people | 3,625 | 3,600 | +25 | 100.…  
> _get_targets → get_funnel → calculate → calculate · 5901 ms_

**#3** What was our spend at event close vs data close, and why are they different?
> Net spend fell by ₹2,500 between event close and data close: ₹276,500 → ₹274,000, because credits posted after the event were netted against gross spend. | Checkpoint | Net spend | Headroom vs ₹300,000 cap | |---|---|---| | Event close (2025-04-13) | ₹276,500 …  
> _get_spend_ledger → calculate → calculate · 5439 ms_

**#4** Which target applied on 14 March vs 15 March and what moved?
> **14 March used the "Attendee launch plan"; from 15 March 09:00 IST the "Attendee revised plan" applied — every goal rose by 400 people and the budget cap by ₹60,000.** | Goal | 14 Mar (launch plan) | 15 Mar (revised plan) | Change | |---|---|---|---| | Identi…  
> _get_targets → get_targets → calculate → calculate → calculate → calculate → calculate → calculate → calculate · 6195 ms_

**#5** On 11 April how many registrations were confirmed, cancelled and waitlisted, and how many still interested?
> On 11 April 2025 (first-touch view): 2,500 confirmed, 183 cancelled, 88 waitlisted, 29 still interested — 2,800 registered in total [get_funnel · 2025-04-11 · r3]. | Status | People | |---|---| | Confirmed | 2,500 | | Cancelled | 183 | | Waitlisted | 88 | | In…  
> _get_funnel · 4803 ms_

**#6** How many people came on Sunday and how many of them were new?
> **Sunday 13 Apr 2025: 1,345 distinct visitors, of whom 620 were new and 725 returning** [get_attendance · 2025-04-20 · r3]. | Day | Verified admission events | Distinct visitors | New | Returning | |---|---|---|---|---| | Sat 12 Apr | 1,905 | 1,430 | 1,430 | 0…  
> _get_attendance · 4844 ms_

**#7** Why do 3,390 check-in rows give only 2,050 visitors?
> **Rows are admission events, not people: 3,390 rows collapse to 2,050 unique verified external visitors because of dedupe, non-admissions, and repeat entries by the same person.** | Step | Count | What it removes | |---|---|---| | Raw check-in rows | 3,390 | —…  
> _data_quality → get_attendance → calculate → calculate → calculate → calculate · 7092 ms_

**#8** What happened to registration R0001?
> R0001 (Leena Kapoor, first touch C01 Campus Ambassadors) went interested → confirmed → cancelled → re-confirmed, and was ultimately admitted on 13 Apr after a denied scan on 12 Apr. | When (IST) | Event | |---|---| | 2025-02-25 09:00 | First seen, first touch …  
> _lookup_registration · 4680 ms_

**#9** What's the registered show-up rate? Is 2,050/2,800 right?
> **No — 2,050/2,800 is not the registered show-up rate.** The correct registered show-up rate is **68.75%** (1,925 registered people who attended ÷ 2,800 registered) [get_funnel · 2025-04-20 · r3]. 2,050/2,800 = 73.21% is the headline attendees-per-registration…  
> _get_funnel · 4390 ms_

**#10** And for Paid Social?
> **Paid Social (C02) registered show-up is 50.00%** (340 registered-and-attended ÷ 680 registered) [get_funnel · 2025-04-20 · r3] — the joint-lowest in the portfolio and 18.75 percentage points below the overall 68.75% [calculate · 0.6875−0.50 = 0.1875]. | C02 …  
> _get_funnel → compare_campaigns → calculate · 7508 ms_

**#11** Which campaign has the lowest cost per visitor?
> **Student Referrals (C05)** has the lowest cost per unique verified visitor: ₹69.09 (₹19,000 net spend ÷ 275 visitors) [compare_campaigns · 2025-04-20 · r3]. | Rank | Campaign | Visitor CPA | Net spend | Visitors | |---|---|---|---|---| | 1 | C05 Student Refer…  
> _compare_campaigns · 4657 ms_

**#12** Does College Partnerships really beat Creator Partners?
> **Yes — on every efficiency measure in the data, College Partnerships (C04) beats Creator Partners (C03), mainly because C03's registrants don't show up.** This is observational first-touch attribution, not causal incrementality. | Metric (as_of 2025-04-20, fi…  
> _compare_campaigns → get_funnel → get_funnel → calculate → calculate · 5655 ms_

**#13** Where is the biggest bottleneck?
> **Biggest bottleneck: confirmed → attended, concentrated in Paid Social (C02).** 575 confirmed registrants never showed up; C02 alone accounts for 240 of them, with a 58.62% confirmed show-up vs 77.00% overall (~107 people lost) [diagnose_bottlenecks · 2025-04…  
> _diagnose_bottlenecks → get_funnel · 5152 ms_

**#14** What happened to Paid Social in early March?
> Paid Social (C02) broke in the week of 3–9 Mar 2025: registrations fell from 105 to 35 while clicks barely moved, then clicks collapsed the following week — the cause is not in the data. **Evidence — weekly series (first-touch, C02) [get_trend · 2025-03-31 · r…  
> _get_trend → get_trend → calculate → calculate → calculate → calculate → list_campaigns · 6455 ms_

**#15** Why did College Partnerships register nobody the week of 9 March?
> **The data cannot explain why** — it records the zero but no cause (no cancellation reasons, no creative/posting schedule, no landing-page data) [describe_data · 2025-04-20 · r3]. Also note the zero week is 3–9 Mar, not the week starting 9 Mar. **Evidence (C04…  
> _get_trend → get_trend → get_trend → get_trend → get_trend → get_trend → describe_data → list_campaigns · 9186 ms_

**#16** What's our unique reach?
> **The data cannot give a unique (deduplicated) reach figure** — platform reach is only a non-unique daily sum, and audience overlap across days/campaigns isn't supplied [describe_data · 2025-04-20 · r3]. The closest people-level numbers are below. | Closest av…  
> _describe_data → get_funnel · 4783 ms_

**#17** What was ticket revenue?
> **The dataset cannot answer this: there is no revenue or ticket-price field** — `describe_data` lists "Revenue" and "Ticket price / paid vs free" under KNOWN_MISSING [describe_data · 2025-04-20 · r3]. Closest available evidence (attendance and cost, not revenu…  
> _describe_data · 4486 ms_

**#18** What's the gender split of attendees?
> **The dataset cannot answer this — gender (and age or any other demographic) is not recorded for attendees or anyone else.** `describe_data` lists "Gender, age or other demographics" under KNOWN_MISSING, and no table (people, registrations, checkins, lead_inte…  
> _describe_data · 5195 ms_

**#19** Why did people cancel? Then create a reminder task.
> **Answer:** The data cannot explain cancellations — no reason field exists [describe_data · 2025-04-20 · r3]. Closest evidence: 183 cancelled, 2,500 confirmed, 88 waitlisted, 575 confirmed no-shows, registered show-up 68.75% (1,925/2,800) [get_funnel · 2025-04…  
> _describe_data → get_funnel → propose_task · 7627 ms_

**#20** What if we move ₹10k from Paid Social to College Partnerships?
> **Scenario (not evidence):** moving ₹10,000 from Paid Social to College Partnerships at historical average visitor CPA would net roughly **+88 unique verified visitors** — but this is a mechanical reallocation, not a measured causal effect. | Item | Value | |-…  
> _what_if → compare_campaigns · 5020 ms_

**#21** What would visitor CPA be if we'd spent the full ₹300,000?
> **Scenario only — the data cannot tell us what extra spend would have bought.** If the same 2,050 unique verified visitors had been delivered for a full ₹300,000, visitor CPA would be ₹146.34 (vs ₹133.66 actual). | Item | Value | |---|---| | Net spend to date …  
> _get_funnel → get_spend_ledger → calculate → calculate · 6211 ms_

**#22** What's the next-edition plan and how confident are we?
> **The next-edition plan is a scenario, not a forecast: base 2,400 / stretch 2,850 unique verified visitors, and confidence is moderate — most of the upside rests on untested assumptions (tagged "A"), not on measured data.** | | Base | Stretch | |---|---|---| |…  
> _get_strategy_model → get_targets → calculate → calculate → calculate → calculate · 7011 ms_

**#23** Create a task for Meera to launch the group-pass pilot by 2026-01-20
> Draft created for Meera (owner T03), due 2026-01-20 — **pending your Confirm**; nothing is on the board yet. | Field | Value | |---|---| | Title | Launch group-pass pilot (Experiment 1, B1 College group passes) by 2026-01-20 | | Owner / due / priority | Meera …  
> _describe_data → list_experiments → propose_task · 8063 ms_

**#24** What tasks are open for Paid Social?
> One open task exists for Paid Social (C02): a P0 landing-page audit, still in `todo`. | ID | Title | Status | Priority | Owner | Due | |---|---|---|---|---|---| | 1 | Audit Paid Social landing page drop (wk of 9 Mar: 105→35 regs) | todo | p0 | Arjun Verma (T04…  
> _list_tasks · 4678 ms_

**#25** What are the stop thresholds for the referral experiment?
> **Referral experiment (B3 "Tiered referrals", experiment 3) — stop rule: stop if visit→registration is below 10% after 200 qualified visits, or if abuse exceeds 5%, or if cost exceeds ₹180 per incremental visitor.** All thresholds are planning rules for the ne…  
> _list_experiments · 4179 ms_

**#26** Total spend at data close and Paid Social's cost per visitor?
> **Net spend at data close (2025-04-20) was ₹275,000, and Paid Social's cost per unique verified visitor was ₹276.47** (first-touch). | Metric | Value | |---|---| | Net spend, data close 2025-04-20 | ₹275,000 (gross ₹281,500, credits −₹6,500) [get_spend_ledger …  
> _get_spend_ledger → get_funnel · 6484 ms_

**#27** How many identified people and verified visitors do we have now, and what is the registered show-up?
> As of 2025-04-20 (first-touch), you have **3,626 identified people** and **2,051 unique verified visitors**; registered show-up is **68.75%** (1,925 of 2,800 registered attended) [get_funnel · 2025-04-20 · r7]. | Metric | Value | |---|---| | Identified (unique…  
> _get_funnel · 7033 ms_

**#28** How many visitors do we have now, and how many verified admission events?
> **2,050 unique verified external visitors** and **3,251 verified admission events** as of 2025-04-20 [get_funnel · 2025-04-20 · r9; get_attendance · 2025-04-20 · r9]. | Metric | Value | |---|---| | Unique verified external visitors | 2,050 | | Verified admissi…  
> _get_funnel → get_attendance · 6460 ms_

**#29** Which campaigns are active?
> Six campaigns are active as of 2025-04-20 (C02 Paid Social is not among them). | ID | Campaign | Owner | Plan budget | Net spend | Recommendation | |---|---|---|---|---|---| | C01 | Campus Ambassadors | Meera Iyer | ₹42,000 | ₹42,000 | scale | | C03 | Creator …  
> _list_campaigns · 5991 ms_

**#30** What is our progress vs the visitor target at event close?
> At event close (2025-04-20) we reached **2,050 unique verified external visitors against a 2,500 goal — 82.00% of target, a shortfall of 450** [get_targets · 2025-04-20 · r13]. | Goal (Eval stretch plan, effective 2025-04-01) | Actual | Goal | Gap | Progress |…  
> _get_targets → get_funnel · 7124 ms_

**#31** How many attended without registering, and what is the scanner-only count?
> **125 people attended without registering (walk-ins), and 1,810 unique external people were verified by scanner only** [get_attendance · 2025-04-20 · r14]. | Measure | People | Definition | |---|---|---| | Walk-ins | 125 | Attended, no registration | | Scanner…  
> _get_attendance → data_quality · 7271 ms_

**#32** CTR of Paid Social vs Organic Search?
> Organic Search has the higher CTR: 3.51% vs 2.11% for Paid Social (as of 2025-04-20, first-touch). | Campaign | CTR | Clicks / Impressions | Recommendation | |---|---|---|---| | C06 Organic Search | 3.51% | 2,404 / 68,402 | Scale | | C02 Paid Social | 2.11% | …  
> _compare_campaigns · 4011 ms_

**#33** What attendance will we get if we double paid budget next year?
> **Scenario only — the data cannot measure what doubling paid budget would yield.** The closest evidence: Paid Social (C02) delivered 340 unique verified visitors on ₹93,000 net spend, a visitor CPA of ₹273.53 [get_funnel · 2025-04-20 · r14]. Doubling that spen…  
> _get_strategy_model → get_funnel → what_if → calculate · 7390 ms_

**#34** How did the campaign do?
> **Overall the campaign landed 2,050 unique verified external visitors against a 2,200 goal (−150) and 2,800 registrations against 3,200 (−400), while beating the identified-people goal (3,625 vs 3,600) and spending ₹274,000 of a ₹300,000 cap** [get_funnel · 20…  
> _get_funnel → get_targets → diagnose_bottlenecks · 4751 ms_

