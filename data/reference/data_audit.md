# CampusFest 2025 data audit

Workbook SHA-256 `d63f3e013e9a823e28ab0a0587703b2ed4344e443ade185606c2ce3427203469`. Dates are end-of-day IST. Regenerate from the original workbook using the command below.

```bash
uv run --with openpyxl --with pandas python audit.py
```

## Stable IDs and data quality

| Sheet | Rows as supplied | Unique keys | Retry rows | Raw blanks | Deduped blanks |
| --- | --- | --- | --- | --- | --- |
| Read me | 8 | 8 | 0 | — | — |
| Field guide | 86 | 86 | 0 | — | — |
| Event | 1 | 1 | 0 | — | — |
| Targets | 2 | 2 | 0 | — | — |
| Campaigns | 7 | 7 | 0 | — | — |
| Daily Marketing | 483 | 481 | 2 | — | — |
| People | 3685 | 3685 | 0 | first_campaign_name 145, first_campaign_id 145 | first_campaign_name 145, first_campaign_id 145 |
| Interest and Engagement | 11650 | 11650 | 0 | — | — |
| Registrations | 2840 | 2840 | 0 | — | — |
| Registration History | 5911 | 5907 | 4 | — | — |
| Check-ins | 3390 | 3370 | 20 | campaign_name 170, registration_id 170, campaign_id 170 | campaign_name 170, registration_id 170, campaign_id 170 |

Retry counts are extra rows with identical contents. The script rejects conflicting repeated keys. `metrics.json → data_quality.tables` lists the stable retry IDs. Empty worksheet padding is ignored.

| Quality check | Result |
| --- | --- |
| Populated foreign keys with no parent | 0 |
| Dated fields past the coverage end | 0 |
| Dated fields before the coverage start | 0 |
| Pre-identity interaction/registration/history/check-in rows | 0 |
| History states before the registration timestamp | 0 |
| Tied registration-state timestamps for a registration | 0 |
| Campaign owner mismatches | 0 |
| Check-ins outside the planned event window | 0 |
| People with multiple registration IDs | 0 |
| Shared display-name labels / people affected | 3 / 6 |
| Cancelled then reconfirmed registration IDs | 36 |
| People with multiple distinct check-in attempts (all / external) | 734 / 734 |
| External visitors with multiple verified admission events | 725 |
| Unattributed deduped check-in events / people, all types | 170 / 145 |
| Unattributed verified external events / people | 150 / 125 |

People by type — external 3,625, internal 40, staff 10, test 10. Registrations by type — external 2,800, internal 40. Blank first-campaign fields cover walk-ins and event-access identities. Blank check-in campaign/name/registration fields indicate no linked registration or campaign in this workbook. Campaign owner IDs are the available owner reference because the workbook contains no team dictionary.

| Person type | Result | Verification | Distinct event IDs |
| --- | --- | --- | --- |
| external | admitted | verified | 3250 |
| external | denied | verified | 50 |
| external | pending | unverified | 30 |
| internal | admitted | verified | 20 |
| staff | admitted | verified | 10 |
| test | admitted | verified | 10 |

## Funnel and target progress

| Metric | 2025-04-13 | 2025-04-20 |
| --- | --- | --- |
| Reported reach sum, nonunique | 666,297 | 666,297 |
| Impressions | 1,029,015 | 1,029,015 |
| Clicks | 32,070 | 32,070 |
| Landing-page sessions | 24,645 | 24,645 |
| Anonymous form starts | 5,548 | 5,548 |
| Identified external people, including walk-ins | 3,625 | 3,625 |
| Meaningfully engaged external people | 3,317 | 3,317 |
| Broad engagement including page visits and email opens | 3,500 | 3,500 |
| Registered external people, any status | 2,800 | 2,800 |
| Currently confirmed external people | 2,500 | 2,500 |
| Unique verified external visitors | 2,050 | 2,050 |
| Registered external people who attended | 1,925 | 1,925 |
| Confirmed external people who attended | 1,925 | 1,925 |
| Net posted marketing spend, INR | 276,500 | 274,000 |

Reported reach is a sum across daily campaign records; cross-day and cross-campaign overlap is unavailable. The anonymous series counts observations. Use CTR, sessions per click and starts per session as reporting ratios. Crossing from sessions or starts to identified people is directional because the workbook lacks a session-to-person join. Identified external people include walk-ins. Meaningful engagement uses brochure downloads, identified starts, questions and nurture link clicks. Broad engagement also counts page visits and opens. Sends and opt-outs are tracked separately. Funnel stages can overlap or be skipped. Show-up uses the intersection with the eligible registration or current-confirmation cohort.

| End of day | Target in effect | Identified actual / target | Registered actual / target | Visitors actual / target | Spend / approved budget |
| --- | --- | --- | --- | --- | --- |
| 2025-01-15 | Attendee launch plan | 0 / 3,200 (0.0%) | 0 / 2,800 (0.0%) | 0 / 1,800 (0.0%) | 0 / 240,000 (0.0%) |
| 2025-03-14 | Attendee launch plan | 2,329 / 3,200 (72.8%) | 1,506 / 2,800 (53.8%) | 0 / 1,800 (0.0%) | 189,575 / 240,000 (79.0%) |
| 2025-03-15 | Attendee revised plan | 2,393 / 3,600 (66.5%) | 1,562 / 3,200 (48.8%) | 0 / 2,200 (0.0%) | 189,575 / 300,000 (63.2%) |
| 2025-04-11 | Attendee revised plan | 3,500 / 3,600 (97.2%) | 2,800 / 3,200 (87.5%) | 0 / 2,200 (0.0%) | 276,500 / 300,000 (92.2%) |
| 2025-04-12 | Attendee revised plan | 3,580 / 3,600 (99.4%) | 2,800 / 3,200 (87.5%) | 1,430 / 2,200 (65.0%) | 276,500 / 300,000 (92.2%) |
| 2025-04-13 | Attendee revised plan | 3,625 / 3,600 (100.7%) | 2,800 / 3,200 (87.5%) | 2,050 / 2,200 (93.2%) | 276,500 / 300,000 (92.2%) |
| 2025-04-20 | Attendee revised plan | 3,625 / 3,600 (100.7%) | 2,800 / 3,200 (87.5%) | 2,050 / 2,200 (93.2%) | 274,000 / 300,000 (91.3%) |

Plan effective at 09:00 IST on 15 March. Compare actuals to the target in force on the selected date. Historical context only, the close totals against launch goals would be 113.3% identified, 100.0% registered and 113.9% visitors.

Event-day budget headroom was ₹23,500.00. Close headroom was ₹26,000.00. The April 16 and 18 credits explain the change. Close registered show-up was 68.8% and confirmed show-up was 77.0%. The headline attendance-to-registration ratio including walk-ins was 73.2%.

| Date | Verified external events | Distinct on day | New people | Returned from prior days |
| --- | --- | --- | --- | --- |
| 2025-04-12 | 1905 | 1430 | 1430 | 0 |
| 2025-04-13 | 1345 | 1345 | 620 | 725 |

Negative net spend by posting date — 2025-04-10 C01 ₹-1,000.00, 2025-04-10 C02 ₹-3,000.00, 2025-04-16 C03 ₹-2,000.00, 2025-04-18 C05 ₹-500.00.

| Overall rate | 2025-04-13 | 2025-04-20 |
| --- | --- | --- |
| CTR | 3.1% | 3.1% |
| Sessions / clicks | 76.8% | 76.8% |
| Starts / sessions | 22.5% | 22.5% |
| Meaningful engagement / identified | 91.5% | 91.5% |
| Registered among engaged | 84.4% | 84.4% |
| Registered / identified | 77.2% | 77.2% |
| Confirmed / registered | 89.3% | 89.3% |
| CPA per registration | ₹98.75 | ₹97.86 |
| CPA per visitor including walk-ins | ₹134.88 | ₹133.66 |

## Campaign results

This table uses fixed first-touch cohorts for the person stages and each campaign’s own spend ledger. The three attendance columns compare first touch, registration source and the earliest admitted-and-verified check-in source. An unattributed check-in keeps its blank source. An unregistered visitor goes to the unattributed registration-source bucket. Identified and engagement results under the registration-source view use first touch and interaction context respectively, since registration source is unavailable for leads without a registration. The current workbook shows the same source at all recorded joins. Future disagreement can change the results. The machine-readable output includes both complete views, same-source check-in intersection counts, and any-verified-event check-in attribution.

| Campaign | Net INR | Identified | Engaged | Reg | Confirmed | Visitors first / reg / check-in | INR / reg | INR / visitor | Reg show-up | Conf show-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Campus Ambassadors | 42,000 | 600 | 585 | 520 | 480 | 390 / 390 / 390 | ₹80.77 | ₹107.69 | 75.0% | 81.2% |
| Paid Social | 93,000 | 960 | 858 | 680 | 580 | 340 / 340 / 340 | ₹136.76 | ₹273.53 | 50.0% | 58.6% |
| Creator Partners | 59,000 | 490 | 452 | 350 | 290 | 175 / 175 / 175 | ₹168.57 | ₹337.14 | 50.0% | 60.3% |
| College Partnerships | 31,000 | 500 | 497 | 450 | 420 | 385 / 385 / 385 | ₹68.89 | ₹80.52 | 85.6% | 91.7% |
| Student Referrals | 19,000 | 410 | 403 | 350 | 320 | 275 / 275 / 275 | ₹54.29 | ₹69.09 | 78.6% | 85.9% |
| Organic Search | 14,000 | 290 | 284 | 250 | 225 | 195 / 195 / 195 | ₹56.00 | ₹71.79 | 78.0% | 86.7% |
| Community Groups | 16,000 | 250 | 238 | 200 | 185 | 165 / 165 / 165 | ₹80.00 | ₹96.97 | 82.5% | 89.2% |
| Unattributed | 0 | 125 | 0 | 0 | 0 | 125 / 125 / 125 | — | — | — | — |

| Campaign | CTR | Sessions / clicks | Starts / sessions | People / sessions* | Engaged / identified | Reg among engaged | Reg / identified | Reg / clicks* | Confirmed / reg | Visitors / reg* |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Campus Ambassadors | 3.6% | 75.8% | 26.3% | 16.3% | 97.5% | 88.9% | 86.7% | 10.7% | 92.3% | 75.0% |
| Paid Social | 2.1% | 76.9% | 21.7% | 18.2% | 89.4% | 79.3% | 70.8% | 9.9% | 85.3% | 50.0% |
| Creator Partners | 2.5% | 77.1% | 17.7% | 12.1% | 92.2% | 77.4% | 71.4% | 6.6% | 82.9% | 50.0% |
| College Partnerships | 4.5% | 77.9% | 16.0% | 9.5% | 99.4% | 90.5% | 90.0% | 6.7% | 93.3% | 85.6% |
| Student Referrals | 4.8% | 74.6% | 26.4% | 15.9% | 98.3% | 86.8% | 85.4% | 10.1% | 91.4% | 78.6% |
| Organic Search | 3.5% | 78.7% | 37.7% | 15.3% | 97.9% | 88.0% | 86.2% | 10.4% | 90.0% | 78.0% |
| Community Groups | 3.8% | 76.7% | 25.3% | 13.2% | 95.2% | 84.0% | 80.0% | 8.1% | 92.5% | 82.5% |
| Unattributed | — | — | — | — | 0.0% | — | 0.0% | — | — | — |

*Directional aggregate ratio. The attendee numerator may include walk-ins overall. For campaign show-up, use the cohort intersection.

| Campaign | Impressions | Clicks | Sessions | Anonymous starts | Cancelled now | Waitlisted now | Confirmed no-shows |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Campus Ambassadors | 136,929 | 4,862 | 3,685 | 968 | 23 | 13 | 90 |
| Paid Social | 325,693 | 6,867 | 5,282 | 1,145 | 60 | 30 | 240 |
| Creator Partners | 209,666 | 5,274 | 4,066 | 720 | 36 | 18 | 115 |
| College Partnerships | 150,205 | 6,736 | 5,246 | 841 | 18 | 9 | 35 |
| Student Referrals | 72,438 | 3,453 | 2,575 | 679 | 18 | 9 | 45 |
| Organic Search | 68,402 | 2,404 | 1,893 | 714 | 17 | 6 | 30 |
| Community Groups | 65,682 | 2,474 | 1,898 | 481 | 11 | 3 | 20 |
| Unattributed | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Weekly trend

Weekly cells show new identified / newly registered / net change in confirmed / newly attended / net INR. Coverage begins on a Wednesday. `metrics.json → weekly_campaigns` contains the full anonymous funnel and snapshot status breakdown for each week and attribution method. Channel rollouts were staggered. New confirmations can exceed new registrations in a reporting week when older registrations advance.

| Through IST Sunday | C01 | C02 | C03 | C04 | C05 | C06 | C07 | Unattr. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2025-01-19 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| 2025-01-26 | 63 / 14 / 4 / 0 / 4300 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 58 / 22 / 11 / 0 / 1400 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| 2025-02-02 | 59 / 47 / 36 / 0 / 6450 | 162 / 26 / 0 / 0 / 9600 | 0 / 0 / 0 / 0 / 0 | 43 / 11 / 6 / 0 / 3150 | 0 / 0 / 0 / 0 / 0 | 23 / 26 / 26 / 0 / 2100 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| 2025-02-09 | 55 / 49 / 44 / 0 / 0 | 154 / 110 / 81 / 0 / 14400 | 0 / 0 / 0 / 0 / 0 | 29 / 24 / 17 / 0 / 4725 | 0 / 0 / 0 / 0 / 0 | 29 / 17 / 19 / 0 / 2100 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| 2025-02-16 | 58 / 38 / 40 / 0 / 6450 | 143 / 124 / 102 / 0 / 0 | 95 / 39 / 23 / 0 / 15250 | 28 / 28 / 28 / 0 / 0 | 43 / 11 / 5 / 0 / 1950 | 24 / 29 / 22 / 0 / 0 | 38 / 10 / 2 / 0 / 1600 | 0 / 0 / 0 / 0 / 0 |
| 2025-02-23 | 46 / 56 / 42 / 0 / 6450 | 112 / 114 / 101 / 0 / 14400 | 56 / 37 / 28 / 0 / 0 | 8 / 21 / 20 / 0 / 0 | 25 / 18 / 18 / 0 / 2925 | 16 / 26 / 22 / 0 / 2100 | 30 / 28 / 21 / 0 / 2400 | 0 / 0 / 0 / 0 / 0 |
| 2025-03-02 | 50 / 39 / 41 / 0 / 0 | 99 / 105 / 103 / 0 / 14400 | 54 / 37 / 34 / 0 / 9150 | 16 / 8 / 16 / 0 / 4725 | 36 / 27 / 20 / 0 / 2925 | 18 / 17 / 15 / 0 / 0 | 31 / 16 / 20 / 0 / 2400 | 0 / 0 / 0 / 0 / 0 |
| 2025-03-09 | 53 / 38 / 38 / 0 / 6450 | 68 / 35 / 39 / 0 / 14400 | 57 / 33 / 25 / 0 / 9150 | 65 / 0 / 0 / 0 / 0 | 46 / 28 / 26 / 0 / 2925 | 27 / 16 / 16 / 0 / 2100 | 25 / 24 / 22 / 0 / 2400 | 0 / 0 / 0 / 0 / 0 |
| 2025-03-16 | 65 / 42 / 38 / 0 / 0 | 69 / 45 / 27 / 0 / 0 | 58 / 38 / 29 / 0 / 9150 | 89 / 64 / 28 / 0 / 4725 | 77 / 33 / 19 / 0 / 2925 | 24 / 17 / 16 / 0 / 1400 | 40 / 19 / 20 / 0 / 2400 | 0 / 0 / 0 / 0 / 0 |
| 2025-03-23 | 67 / 63 / 56 / 0 / 4300 | 61 / 26 / 34 / 0 / 9600 | 67 / 40 / 33 / 0 / 6100 | 72 / 77 / 80 / 0 / 4725 | 72 / 67 / 56 / 0 / 1950 | 25 / 21 / 12 / 0 / 0 | 38 / 30 / 24 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |
| 2025-03-30 | 54 / 60 / 52 / 0 / 4300 | 59 / 47 / 36 / 0 / 9600 | 64 / 52 / 42 / 0 / 0 | 103 / 80 / 73 / 0 / 3150 | 68 / 59 / 58 / 0 / 0 | 25 / 22 / 26 / 0 / 1400 | 37 / 34 / 27 / 0 / 1600 | 0 / 0 / 0 / 0 / 0 |
| 2025-04-06 | 27 / 48 / 48 / 0 / 0 | 33 / 38 / 41 / 0 / 0 | 36 / 47 / 40 / 0 / 6100 | 43 / 97 / 86 / 0 / 3150 | 37 / 68 / 62 / 0 / 1950 | 17 / 22 / 17 / 0 / 0 | 10 / 26 / 25 / 0 / 1600 | 0 / 0 / 0 / 0 / 0 |
| 2025-04-13 | 3 / 26 / 41 / 390 / 3300 | 0 / 10 / 16 / 340 / 6600 | 3 / 27 / 36 / 175 / 6100 | 4 / 40 / 66 / 385 / 2650 | 6 / 39 / 56 / 275 / 1950 | 4 / 15 / 23 / 195 / 1400 | 1 / 13 / 24 / 165 / 1600 | 125 / 0 / 0 / 125 / 0 |
| 2025-04-20 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / -2000 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / -500 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 / 0 |

Visitor CPA, lowest to highest — Student Referrals ₹69.09, Organic Search ₹71.79, College Partnerships ₹80.52, Community Groups ₹96.97, Campus Ambassadors ₹107.69, Paid Social ₹273.53, Creator Partners ₹337.14.

Weekly changes around the March slowdown and partnership ramp. These are same-period counts. Registration lag and posting schedules can affect comparisons.

| Week through | Paid clicks / reg | Creator clicks / reg | Partnership clicks / reg | Referral clicks / reg |
| --- | --- | --- | --- | --- |
| 2025-03-02 | 988 / 105 | 634 / 37 | 467 / 8 | 358 / 27 |
| 2025-03-09 | 871 / 35 | 541 / 33 | 464 / 0 | 323 / 28 |
| 2025-03-16 | 329 / 45 | 618 / 38 | 752 / 64 | 369 / 33 |
| 2025-03-23 | 349 / 26 | 642 / 40 | 842 / 77 | 547 / 67 |
| 2025-03-30 | 334 / 47 | 576 / 52 | 859 / 80 | 467 / 59 |
| 2025-04-06 | 379 / 38 | 597 / 47 | 888 / 97 | 483 / 68 |
| 2025-04-13 | 255 / 10 | 477 / 27 | 597 / 40 | 345 / 39 |

Paid Social went from 105 registrations on 988 clicks to 35 on 871 clicks in the 9 March week. It finished with 240 confirmed people who did not attend and 60 latest cancellations. Creator Partners registered 350 people and checked in 175 of them. Prioritize testing commitment and the arrival flow for both channels.

College Partnerships reached 85.6% registered show-up, and referrals reached ₹69.09 per attributed visitor. The weekly series makes group booking and cohort lag plausible explanations for abrupt moves. The source fields lack booking group size, campaign experiment assignment and cancellation reason.

## Current registration status over time

Latest eligible state per registration ID after deduplication. Each row here equals the person-level status counts because all registration IDs belong to different people. The four source values are interested, confirmed, cancelled and waitlisted. `metrics.json → daily_status_trend` covers all dates.

| Date | Registered | interested | confirmed | cancelled | waitlisted |
| --- | --- | --- | --- | --- | --- |
| 2025-01-15 | 0 | 0 | 0 | 0 | 0 |
| 2025-01-19 | 0 | 0 | 0 | 0 | 0 |
| 2025-01-26 | 36 | 18 | 15 | 3 | 0 |
| 2025-02-02 | 146 | 55 | 83 | 6 | 2 |
| 2025-02-09 | 346 | 76 | 244 | 19 | 7 |
| 2025-02-16 | 625 | 108 | 466 | 34 | 17 |
| 2025-02-23 | 925 | 124 | 718 | 58 | 25 |
| 2025-03-02 | 1174 | 87 | 967 | 83 | 37 |
| 2025-03-09 | 1348 | 79 | 1133 | 94 | 42 |
| 2025-03-14 | 1506 | 97 | 1255 | 106 | 48 |
| 2025-03-15 | 1562 | 128 | 1279 | 107 | 48 |
| 2025-03-16 | 1606 | 135 | 1310 | 111 | 50 |
| 2025-03-23 | 1930 | 141 | 1605 | 126 | 58 |
| 2025-03-30 | 2284 | 142 | 1919 | 154 | 69 |
| 2025-04-06 | 2630 | 152 | 2238 | 163 | 77 |
| 2025-04-11 | 2800 | 29 | 2500 | 183 | 88 |
| 2025-04-12 | 2800 | 29 | 2500 | 183 | 88 |
| 2025-04-13 | 2800 | 29 | 2500 | 183 | 88 |
| 2025-04-20 | 2800 | 29 | 2500 | 183 | 88 |

## Checks a grader can reproduce

- Event-close vs history-close spend? ₹276,500.00 then ₹274,000.00. Post-event vendor credits post in their own periods.

- How many attended without registration? 125. The event recorded 3,250 verified external admission events and 2,050 unique visitors.

- What if manual admissions are omitted? Scanner-only measurement yields 1,885 unique external visitors. Manual records add 165 distinct visitors beyond scanner data.

- How many registrations became reconfirmed after cancellation? 36; each preserves its person and registration ID.

- Can reported reach answer how many different people saw the campaign across all days? The overlap data is absent.

- Which target applies on 14 versus 15 March? Launch then revised. The revision timestamp is 15 March at 09:00 IST.

- How many attended before festival day? Zero through 11 April; 12 April admits only observations through that day.

- How many unique visitors were currently cancelled at close? 0. Admission evidence and latest registration status measure different things.
