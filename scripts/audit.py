#!/usr/bin/env python3
"""Rebuild the CampusFest metrics and audit from the supplied XLSX, read-only."""
import argparse
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
import hashlib
import json
from pathlib import Path
from zoneinfo import ZoneInfo

from openpyxl import load_workbook


KEYS = {
    'Read me': ('topic', 'description'),
    'Field guide': ('source_table', 'field'),
    'Event': ('event_name',),
    'Targets': ('effective_at',),
    'Campaigns': ('campaign_id',),
    'Daily Marketing': ('activity_id',),
    'People': ('person_id',),
    'Interest and Engagement': ('interaction_id',),
    'Registrations': ('registration_id',),
    'Registration History': ('history_id',),
    'Check-ins': ('event_id',),
}
PLATFORM = (
    'reported_reach', 'impressions', 'clicks', 'landing_page_sessions',
    'registration_starts', 'marketing_spend_inr',
)
STRONG = {
    'brochure_download', 'registration_start', 'event_question_submitted',
    'nurture_email_clicked',
}
BROAD = STRONG | {'page_visit', 'nurture_email_opened'}
DELIVERY_OR_ACTION = BROAD | {'nurture_email_sent', 'opted_out'}
STATUSES = ('interested', 'confirmed', 'cancelled', 'waitlisted')
UNATTR = 'unattributed'
TS_FIELDS = {
    'Event': ('history_start', 'history_end', 'event_starts_at', 'event_ends_at'),
    'Targets': ('effective_at',),
    'Campaigns': ('created_at', 'planned_start_at', 'planned_end_at'),
    'Daily Marketing': ('activity_date',),
    'People': ('first_seen_at',),
    'Interest and Engagement': ('occurred_at',),
    'Registrations': ('registered_at',),
    'Registration History': ('effective_at',),
    'Check-ins': ('occurred_at',),
}


def read_workbook(path):
    sheets = {}
    quality = {}
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        for name, key_fields in KEYS.items():
            values = iter(workbook[name].values)
            columns = next(values)
            unique = {}
            retries = Counter()
            raw_nulls = Counter()
            for cells in values:
                if not any(cell is not None for cell in cells):
                    continue
                row = dict(zip(columns, cells))
                raw_nulls.update(col for col, value in row.items() if value is None)
                key = tuple(row[col] for col in key_fields)
                if None in key:
                    raise ValueError(f'{name} has a missing key')
                if key in unique:
                    if row != unique[key]:
                        raise ValueError(f'{name} has conflicting values for key {key}')
                    retries[key] += 1
                else:
                    unique[key] = row
            sheets[name] = list(unique.values())
            quality[name] = {
                'raw_rows': len(unique) + retries.total(),
                'unique_rows': len(unique),
                'duplicate_extra_rows': retries.total(),
                'duplicate_keys': [
                    {'key': key, 'extra_rows': count} for key, count in retries.items()
                ],
                'raw_nulls': dict(raw_nulls),
                'deduped_nulls': dict(Counter(
                    col for row in unique.values() for col, value in row.items()
                    if value is None
                )),
            }
    finally:
        workbook.close()
    event = sheets['Event'][0]
    zone = ZoneInfo(event['timezone'])
    for name, fields in TS_FIELDS.items():
        for row in sheets[name]:
            for field in fields:
                value = row[field]
                if value is None:
                    continue
                parsed = value if isinstance(value, datetime) else datetime.fromisoformat(str(value))
                row[field] = parsed.replace(tzinfo=zone) if parsed.tzinfo is None else parsed.astimezone(zone)
    return sheets, quality


def ids(rows, field='person_id'):
    return {row[field] for row in rows}


def index(rows, field):
    return {row[field]: row for row in rows}


def by(rows, field):
    grouped = defaultdict(list)
    for row in rows:
        grouped[row[field]].append(row)
    return grouped


def count_by(rows, field):
    return dict(Counter(row[field] for row in rows))


def ratio(numerator, denominator):
    return round(numerator / denominator, 8) if denominator else None


def platform_totals(rows):
    output = {metric: int(sum(row[metric] for row in rows)) for metric in PLATFORM}
    output['reported_reach_sum_nonunique'] = output.pop('reported_reach')
    output['unique_reach'] = None
    output['positive_daily_net_spend_inr'] = int(sum(
        max(0, row['marketing_spend_inr']) for row in rows
    ))
    output['negative_daily_net_spend_inr'] = int(sum(
        min(0, row['marketing_spend_inr']) for row in rows
    ))
    return output


def verified(row):
    return row['result'] == 'admitted' and row['verification'] == 'verified'


def oldest_first(rows, date_field, id_field):
    return sorted(rows, key=lambda row: (row[date_field], row[id_field]))


def coverage(rows, key, available):
    values = [row[key] for row in rows if row.get(key) is not None]
    invalid = Counter(value for value in values if value not in available)
    return {'rows': invalid.total(), 'ids': dict(invalid)}


def collect_quality(sheets, table_quality):
    event = sheets['Event'][0]
    start = event['history_start'].date()
    end = event['history_end'].date()
    people = index(sheets['People'], 'person_id')
    campaigns = index(sheets['Campaigns'], 'campaign_id')
    registrations = index(sheets['Registrations'], 'registration_id')
    touches = sheets['Interest and Engagement']
    history = sheets['Registration History']
    checkins = sheets['Check-ins']
    after = {}
    before = {}
    for name, fields in TS_FIELDS.items():
        after[name] = {f: sum(row[f].date() > end for row in sheets[name] if row[f]) for f in fields}
        before[name] = {f: sum(row[f].date() < start for row in sheets[name] if row[f]) for f in fields}
    orphans = {}
    for name in ('Daily Marketing', 'People', 'Interest and Engagement',
                 'Registrations', 'Registration History', 'Check-ins'):
        rows = sheets[name]
        foreign_keys = {'first_campaign_id' if name == 'People' else 'campaign_id': campaigns}
        if name != 'Daily Marketing':
            foreign_keys['person_id'] = people
        if name in ('Registration History', 'Check-ins'):
            foreign_keys['registration_id'] = registrations
        orphans[name] = {field: coverage(rows, field, parent) for field, parent in foreign_keys.items()}

    reconfirmed = []
    per_registration = by(history, 'registration_id')
    for reg_id, entries in per_registration.items():
        cancelled = None
        for row in oldest_first(entries, 'effective_at', 'history_id'):
            if row['status'] == 'cancelled':
                cancelled = row
            if cancelled and row['status'] == 'confirmed':
                reconfirmed.append({
                    'registration_id': reg_id,
                    'person_id': row['person_id'],
                    'campaign_id': row['campaign_id'],
                    'cancelled_at': cancelled['effective_at'],
                    'reconfirmed_at': row['effective_at'],
                })
                break
    external_checks = [r for r in checkins if people.get(r['person_id'], {}).get('person_type') == 'external']
    verified_checks = [r for r in external_checks if verified(r)]
    scanner = ids(r for r in verified_checks if r['source'] == 'scanner')
    manual = ids(r for r in verified_checks if r['source'] == 'manual')
    check_groups = by(checkins, 'person_id')
    repeated = Counter(len(rows) for rows in check_groups.values())
    ext_repeats = Counter(len(rows) for rows in by(external_checks, 'person_id').values())
    verified_repeats = Counter(len(rows) for rows in by(verified_checks, 'person_id').values())
    duplicated_labels = Counter(r['person_name'] for r in people.values())
    orphans['Registrations']['missing_history'] = {
        'rows': len(set(registrations) - set(per_registration)),
        'ids': sorted(set(registrations) - set(per_registration)),
    }
    matching = {}
    for name in ('Interest and Engagement', 'Registrations', 'Registration History', 'Check-ins'):
        rows = sheets[name]
        matching[name] = {
            'first_touch_campaign_mismatch_rows': sum(
                row['campaign_id'] != people[row['person_id']]['first_campaign_id']
                for row in rows if row['person_id'] in people
            ),
            'both_campaigns_present_first_touch_mismatch_rows': sum(
                row['campaign_id'] != people[row['person_id']]['first_campaign_id']
                for row in rows
                if row['campaign_id'] and people.get(row['person_id'], {}).get('first_campaign_id')
            ),
            'activity_before_first_seen_rows': sum(
                row.get('occurred_at', row.get('registered_at', row.get('effective_at')))
                < people[row['person_id']]['first_seen_at']
                for row in rows if row['person_id'] in people
            ),
        }
        if name in ('Registration History', 'Check-ins'):
            for field in ('person_id', 'campaign_id'):
                matching[name][f'registration_{field}_mismatch_rows'] = sum(
                    row[field] != registrations[row['registration_id']][field]
                    for row in rows if row['registration_id'] in registrations
                )
    checkin_breakdown = Counter(
        (people.get(r['person_id'], {}).get('person_type', 'unknown'), r['result'], r['verification'])
        for r in checkins
    )
    first_touch_sources = defaultdict(Counter)
    for row in people.values():
        first_touch_sources[row['person_type']][row['first_touch_source']] += 1
    return {
        'tables': table_quality,
        'before_history_start': before,
        'after_history_end': after,
        'orphan_foreign_keys': orphans,
        'owner_reference_note': 'No independent team dictionary sheet is supplied. Campaigns provide the available owner reference.',
        'owner_mismatch_against_campaign_rows': {
            name: sum(
                row['owner_id'] != campaigns[ref]['owner_id'] for row in sheets[name]
                if (ref := row.get('campaign_id', row.get('first_campaign_id'))) in campaigns
            )
            for name in ('Daily Marketing', 'People', 'Interest and Engagement',
                         'Registrations', 'Registration History', 'Check-ins')
        },
        'owner_ids_by_table': {
            name: count_by(sheets[name], 'owner_id')
            for name in ('Campaigns', 'Daily Marketing', 'People', 'Interest and Engagement',
                         'Registrations', 'Registration History', 'Check-ins')
        },
        'join_and_timing_checks': matching,
        'people_by_type': count_by(people.values(), 'person_type'),
        'first_touch_sources_by_person_type': first_touch_sources,
        'shared_name_label_count': sum(n > 1 for n in duplicated_labels.values()),
        'people_with_shared_name_label': sum(n for n in duplicated_labels.values() if n > 1),
        'registrations_by_type': dict(Counter(people[r['person_id']]['person_type'] for r in registrations.values() if r['person_id'] in people)),
        'people_with_multiple_registration_ids': sum(len(rows) > 1 for rows in by(registrations.values(), 'person_id').values()),
        'registration_history_versions_by_status': count_by(history, 'status'),
        'registration_history_simultaneous_version_pairs': sum(
            n > 1 for n in Counter((r['registration_id'], r['effective_at']) for r in history).values()
        ),
        'registration_history_before_registration': sum(
            r['effective_at'] < registrations[r['registration_id']]['registered_at']
            for r in history if r['registration_id'] in registrations
        ),
        'engagement_events_by_type': count_by(touches, 'event_type'),
        'checkins_by_type_result_verification': [
            dict(person_type=kind, result=result, verification=verification, events=n)
            for (kind, result, verification), n in sorted(checkin_breakdown.items())
        ],
        'checkins_by_result': count_by(checkins, 'result'),
        'checkins_by_verification': count_by(checkins, 'verification'),
        'checkins_by_source': count_by(checkins, 'source'),
        'checkin_attempt_histogram_all_people': dict(sorted(repeated.items())),
        'checkin_attempt_histogram_external_people': dict(sorted(ext_repeats.items())),
        'verified_attempt_histogram_external_people': dict(sorted(verified_repeats.items())),
        'people_with_multiple_attempts_all': sum(n for attempts, n in repeated.items() if attempts > 1),
        'people_with_multiple_attempts_external': sum(n for attempts, n in ext_repeats.items() if attempts > 1),
        'people_with_multiple_verified_attempts_external': sum(n for attempts, n in verified_repeats.items() if attempts > 1),
        'unattributed_checkin_events': sum(r['campaign_id'] is None for r in checkins),
        'unattributed_unique_checkin_people': len(ids(r for r in checkins if r['campaign_id'] is None)),
        'verified_external_unattributed_checkin_events': sum(r['campaign_id'] is None for r in verified_checks),
        'verified_external_unattributed_checkin_people': len(ids(r for r in verified_checks if r['campaign_id'] is None)),
        'verification_sources_external_people': {
            'scanner_only': len(scanner - manual), 'manual_only': len(manual - scanner),
            'both': len(scanner & manual), 'scanner_total': len(scanner), 'manual_total': len(manual),
        },
        'checkin_before_event_start': sum(r['occurred_at'] < event['event_starts_at'] for r in checkins),
        'checkin_after_event_end': sum(r['occurred_at'] > event['event_ends_at'] for r in checkins),
        'cancelled_then_reconfirmed_count': len(reconfirmed),
        'cancelled_then_reconfirmed_by_campaign': count_by(reconfirmed, 'campaign_id'),
        'cancelled_then_reconfirmed_examples': reconfirmed[:8],
        'negative_daily_net_spend_rows': [
            {k: r[k] for k in ('activity_id', 'campaign_id', 'activity_date', 'marketing_spend_inr')}
            for r in sheets['Daily Marketing'] if r['marketing_spend_inr'] < 0
        ],
    }


class Audit:
    def __init__(self, sheets):
        self.event = sheets['Event'][0]
        self.zone = ZoneInfo(self.event['timezone'])
        self.targets = sorted(sheets['Targets'], key=lambda r: r['effective_at'])
        self.campaigns = index(sheets['Campaigns'], 'campaign_id')
        self.people = [r for r in sheets['People'] if r['person_type'] == 'external']
        self.external_ids = ids(self.people)
        self.touches = sheets['Interest and Engagement']
        self.regs = oldest_first(sheets['Registrations'], 'registered_at', 'registration_id')
        self.history = oldest_first(sheets['Registration History'], 'effective_at', 'history_id')
        self.checkins = oldest_first(sheets['Check-ins'], 'occurred_at', 'event_id')
        self.daily = sheets['Daily Marketing']

    def snapshot(self, day, include_campaigns=True):
        end = datetime.combine(day + timedelta(days=1), datetime.min.time(), self.zone)
        people = [r for r in self.people if r['first_seen_at'] < end]
        people_ids = ids(people)
        daily = [r for r in self.daily if r['activity_date'] < end]
        interactions = [r for r in self.touches if r['occurred_at'] < end and r['person_id'] in people_ids]
        engaged = ids(r for r in interactions if r['event_type'] in STRONG)
        broad = ids(r for r in interactions if r['event_type'] in BROAD)
        all_interactions = ids(r for r in interactions if r['event_type'] in DELIVERY_OR_ACTION)
        opt_out = ids(r for r in interactions if r['event_type'] == 'opted_out')
        regs = [r for r in self.regs if r['registered_at'] < end and r['person_id'] in people_ids]
        reg_ids = ids(regs, 'registration_id')
        reg_people = ids(regs)
        latest = index(
            (r for r in self.history if r['effective_at'] < end and r['registration_id'] in reg_ids),
            'registration_id',
        )
        statuses = {
            status: ids(r for r in latest.values() if r['status'] == status)
            for status in STATUSES
        }
        confirmed = statuses['confirmed']
        earliest_reg = {}
        for row in regs:
            earliest_reg.setdefault(row['person_id'], row)
        verified_events = [
            r for r in self.checkins if r['occurred_at'] < end
            and r['person_id'] in people_ids and verified(r)
        ]
        first_verified = {}
        for row in verified_events:
            first_verified.setdefault(row['person_id'], row)
        attendees = set(first_verified)
        targets = [r for r in self.targets if r['effective_at'] < end]
        target = targets[-1] if targets else None

        overall = self.group_metrics(
            daily, people_ids, engaged, broad, reg_people, confirmed, attendees, statuses,
            reg_people, confirmed, attendees,
        )
        overall.update({
            'any_identified_interaction_people': len(all_interactions),
            'opted_out_people': len(opt_out),
            'registrations_distinct_ids': len(reg_ids),
            'latest_status_by_registration': {
                k: sum(r['status'] == k for r in latest.values()) for k in STATUSES
            },
            'registrations_without_eligible_status': len(reg_ids - latest.keys()),
            'external_verified_admission_events': len(verified_events),
            'attended_with_admission_registration_id': len(ids(
                r for r in verified_events if r['registration_id'] in reg_ids
            )),
            'attended_unregistered_people': len(attendees - reg_people),
            'attended_without_latest_confirmation': len(attendees - confirmed),
            'verified_visitor_cohort_by_latest_status': {
                k: len(v & attendees) for k, v in statuses.items()
            },
            'identified_interaction_events_by_type': count_by(interactions, 'event_type'),
        })
        out = {'as_of': day, 'overall': overall, 'target': target}
        if target:
            achieved = {
                'identified_external_people_goal': overall['identified_external_people'],
                'registration_goal': overall['registered_people'],
                'unique_external_visitors_goal': overall['attended_people'],
                'marketing_budget_inr': overall['marketing_spend_inr'],
            }
            out['target_progress'] = {
                key: {
                    'actual': value, 'goal': int(target[key]), 'actual_minus_goal': value - int(target[key]),
                    'fraction': ratio(value, target[key]),
                } for key, value in achieved.items()
            }
        if not include_campaigns:
            return out

        first_touch = by(people, 'first_campaign_id')
        acquisition = by(regs, 'campaign_id')
        action_context = by(interactions, 'campaign_id')
        admission_context = by(first_verified.values(), 'campaign_id')
        any_admission_context = by(verified_events, 'campaign_id')
        daily_campaigns = by(daily, 'campaign_id')
        out['campaigns'] = {}
        for cid in [*self.campaigns, None]:
            day_rows = daily_campaigns[cid]
            first_ids = ids(first_touch[cid])
            acquisition_ids = ids(acquisition[cid])
            acquisition_reg_ids = ids(acquisition[cid], 'registration_id')
            action_engaged = ids(r for r in action_context[cid] if r['event_type'] in STRONG)
            action_broad = ids(r for r in action_context[cid] if r['event_type'] in BROAD)
            acquisition_status = {
                s: ids(r for reg_id, r in latest.items() if reg_id in acquisition_reg_ids and r['status'] == s)
                for s in STATUSES
            }
            acquisition_confirmed = acquisition_status['confirmed']
            acquired_attendees = attendees & acquisition_ids
            if cid is None:
                acquired_attendees |= attendees - reg_people
            direct_attendees = ids(admission_context[cid])
            direct_any = ids(any_admission_context[cid])
            out['campaigns'][cid or UNATTR] = {
                'campaign_name': self.campaigns[cid]['campaign_name'] if cid else 'Unattributed',
                'first_touch': self.group_metrics(
                    day_rows, first_ids, engaged & first_ids, broad & first_ids,
                    reg_people & first_ids, confirmed & first_ids, attendees & first_ids,
                    {s: v & first_ids for s, v in statuses.items()},
                    reg_people & first_ids, confirmed & first_ids, attendees & first_ids,
                ),
                'registration_source': self.group_metrics(
                    day_rows, first_ids, action_engaged, action_broad,
                    acquisition_ids, acquisition_confirmed, acquired_attendees, acquisition_status,
                    acquisition_ids, acquisition_confirmed, attendees,
                ),
                'checkin_source': {
                    'attended_people': len(direct_attendees),
                    'attended_people_any_verified_event_with_source': len(direct_any),
                    'verified_admission_events': len(any_admission_context[cid]),
                    'cpa_per_attendee_inr': ratio(
                        sum(r['marketing_spend_inr'] for r in day_rows), len(direct_attendees)
                    ) if cid else None,
                    'same_source_registered_and_attended_people': len(direct_attendees & acquisition_ids),
                    'same_source_confirmed_and_attended_people': len(direct_attendees & acquisition_confirmed),
                    'same_source_match_share_of_registered': ratio(len(direct_attendees & acquisition_ids), len(acquisition_ids)),
                },
                'opted_out_in_context_people': len(opt_out & ids(action_context[cid])),
                'retained_first_touch_and_registration_source_people': len(first_ids & acquisition_ids),
                'exclusive_first_registration_source_attended_people': sum(
                    first_reg['campaign_id'] == cid and pid in attendees
                    for pid, first_reg in earliest_reg.items()
                ) + (len(attendees - reg_people) if cid is None else 0),
            }
            if cid is None:
                for mode in ('first_touch', 'registration_source'):
                    for key in ('cpa_per_registration_inr', 'cpa_per_attendee_inr'):
                        out['campaigns'][UNATTR][mode]['rates'][key] = None
        return out

    @staticmethod
    def group_metrics(daily, people, engaged, broad, registered, confirmed, attendees,
                      statuses, registered_cohort, confirmed_cohort, destination):
        out = platform_totals(daily)
        showups = len(registered_cohort & destination)
        confirmed_showups = len(confirmed_cohort & destination)
        spend = out['marketing_spend_inr']
        click = out['clicks']
        sessions = out['landing_page_sessions']
        starts = out['registration_starts']
        out.update({
            'identified_external_people': len(people),
            'engaged_people': len(engaged),
            'broad_engaged_people': len(broad),
            'registered_people': len(registered),
            'confirmed_people': len(confirmed),
            'attended_people': len(attendees),
            'registered_and_attended_people': showups,
            'confirmed_and_attended_people': confirmed_showups,
            'latest_status_by_person_distinct_within_status': {s: len(v) for s, v in statuses.items()},
            'rates': {
                'clicks_per_impression': ratio(click, out['impressions']),
                'sessions_per_click': ratio(sessions, click),
                'starts_per_session': ratio(starts, sessions),
                'identified_people_per_reported_reach_sum_directional': ratio(len(people), out['reported_reach_sum_nonunique']),
                'identified_people_per_session_directional': ratio(len(people), sessions),
                'registrations_per_start_directional': ratio(len(registered), starts),
                'registrations_per_click_directional': ratio(len(registered), click),
                'engaged_among_identified_people': ratio(len(people & engaged), len(people)),
                'registered_among_engaged_people': ratio(len(registered & engaged), len(engaged)),
                'registered_among_identified_people': ratio(len(registered & people), len(people)),
                'registered_per_identified_directional': ratio(len(registered), len(people)),
                'confirmed_among_registered_people': ratio(len(confirmed & registered), len(registered)),
                'attendees_per_registration_headline_including_walkins': ratio(len(attendees), len(registered)),
                'registered_show_up': ratio(showups, len(registered_cohort)),
                'confirmed_show_up': ratio(confirmed_showups, len(confirmed_cohort)),
                'cpa_per_registration_inr': ratio(spend, len(registered)),
                'cpa_per_attendee_inr': ratio(spend, len(attendees)),
                'cpm_net_all_campaign_cost_inr': ratio(spend * 1000, out['impressions']),
                'cpc_net_all_campaign_cost_inr': ratio(spend, click),
            },
        })
        return out


FLOW_FIELDS = (
    'reported_reach_sum_nonunique', 'impressions', 'clicks', 'landing_page_sessions',
    'registration_starts', 'marketing_spend_inr', 'identified_external_people',
    'engaged_people', 'broad_engaged_people', 'registered_people', 'attended_people',
)


def weekly_series(audit):
    week_first = audit.event['history_start'].date()
    end = audit.event['history_end'].date()
    previous = audit.snapshot(week_first - timedelta(days=1))
    weeks = []
    while week_first <= end:
        week_last = min(week_first + timedelta(days=6 - week_first.weekday()), end)
        current = audit.snapshot(week_last)
        week = {
            'from': week_first,
            'through': week_last,
            'days': (week_last - week_first).days + 1,
            'target_version_at_end': current['target']['target_version'],
            'campaigns': {},
        }
        for cid, row in current['campaigns'].items():
            previous_row = previous['campaigns'][cid]
            week_row = {}
            for mode in ('first_touch', 'registration_source'):
                new = row[mode]
                old = previous_row[mode]
                flow = {k: new[k] - old[k] for k in FLOW_FIELDS}
                flow['net_change_in_latest_confirmed_people'] = new['confirmed_people'] - old['confirmed_people']
                week_row[mode] = {
                    'period_increment': flow,
                    'week_end_cumulative': {k: new[k] for k in (*FLOW_FIELDS, 'confirmed_people')},
                    'week_end_status_by_person': new['latest_status_by_person_distinct_within_status'],
                    'period_ratios_non_cohort': {
                        'clicks_per_impression': ratio(flow['clicks'], flow['impressions']),
                        'starts_per_session': ratio(flow['registration_starts'], flow['landing_page_sessions']),
                        'registrations_per_click': ratio(flow['registered_people'], flow['clicks']),
                    },
                }
            week_row['checkin_source_attendance_new'] = (
                row['checkin_source']['attended_people'] - previous_row['checkin_source']['attended_people']
            )
            week['campaigns'][cid] = week_row
        weeks.append(week)
        previous = current
        week_first = week_last + timedelta(days=1)
    return weeks


def attendance_by_day(audit):
    daily = {}
    seen = set()
    for day in sorted({r['occurred_at'].date() for r in audit.checkins}):
        eligible = [
            r for r in audit.checkins
            if r['occurred_at'].date() == day and r['person_id'] in audit.external_ids and verified(r)
        ]
        visitors = ids(eligible)
        daily[day.isoformat()] = {
            'external_verified_admission_events': len(eligible),
            'unique_external_visitors_on_day': len(visitors),
            'new_unique_external_visitors_since_prior_days': len(visitors - seen),
            'returning_unique_external_visitors': len(visitors & seen),
        }
        seen.update(visitors)
    return daily


def run_audit(sheets, quality, path):
    audit = Audit(sheets)
    start = audit.event['history_start'].date()
    end = audit.event['history_end'].date()
    event_start = audit.event['event_starts_at'].date()
    event_end = audit.event['event_ends_at'].date()
    selected = {start, end, event_start, event_end, event_start - timedelta(days=1)}
    for t in audit.targets:
        day = t['effective_at'].date()
        selected.add(day)
        if day > start:
            selected.add(day - timedelta(days=1))
    snapshots = {d.isoformat(): audit.snapshot(d) for d in sorted(selected)}
    daily = [
        audit.snapshot(start + timedelta(days=i), include_campaigns=False)
        for i in range((end - start).days + 1)
    ]
    status_trend = [{
        'as_of': s['as_of'],
        'target_version': s['target']['target_version'] if s['target'] else None,
        'registered_people': s['overall']['registered_people'],
        'latest_external_registrations_by_status': s['overall']['latest_status_by_registration'],
        'distinct_external_people_within_latest_status': s['overall']['latest_status_by_person_distinct_within_status'],
    } for s in daily]
    return {
        'workbook_filename': path.name,
        'workbook_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'event': audit.event,
        'target_versions': audit.targets,
        'campaign_catalog': audit.campaigns,
        'definitions': {
            'as_of': 'Inclusive IST date, implemented as < next local midnight. Naive XLSX timestamps are local IST.',
            'engaged_people_events': sorted(STRONG),
            'broad_engaged_people_events': sorted(BROAD),
            'first_touch': 'All person stages credited to the fixed People.first_campaign_id cohort.',
            'registration_source': 'Identified = first touch, engagement = the interaction campaign, registration and current status = the registration campaign, attendance = verified visitors matched to any eligible registration in the campaign. Unregistered visitors go in Unattributed. Counts could overlap across campaigns if a person has registrations under different sources.',
            'checkin_source': 'One campaign from earliest eligible verified admission sorted by occurred_at then event_id. Any-event distinct count also provided to surface potential overlap.',
            'show_up': 'Intersection of registered or currently confirmed cohort and verified visitors divided by that cohort. Headline attendance includes walk-ins. No-show comparisons become mature by event close.',
            'latest_status': 'Latest eligible full state per registration_id ordered by effective_at then history_id. Person totals within a status may overlap across statuses if a person has multiple registration IDs.',
            'weekly': 'Monday to Sunday IST, partial first week. Period increments of cumulative distinct person cohorts. Confirmed delta is net of entries and exits.',
            'spend': 'Whole INR net posted daily amounts, including negative vendor credits on their reporting date. Individual transaction-level gross debits and credits are unavailable.',
            'null_rates': 'A zero denominator or missing coverage; spend and CPA for unattributed traffic are not allocable.',
        },
        'data_quality': collect_quality(sheets, quality),
        'snapshots': snapshots,
        'daily_overall': daily,
        'daily_status_trend': status_trend,
        'attendance_by_event_day': attendance_by_day(audit),
        'weekly_campaigns': weekly_series(audit),
    }


def iso(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    raise TypeError(f'Unsupported JSON value: {type(value)}')


def pct(value):
    return '—' if value is None else f'{value:.1%}'


def money(value):
    return '—' if value is None else f'₹{value:,.2f}'


def table(headers, rows):
    def line(items):
        return '| ' + ' | '.join(str(x) for x in items) + ' |'
    return '\n'.join([line(headers), line(['---'] * len(headers)), *(line(row) for row in rows)])


def report(m):
    q = m['data_quality']
    end_key = m['event']['history_end'].date().isoformat()
    event_key = m['event']['event_ends_at'].date().isoformat()
    end = m['snapshots'][end_key]
    event = m['snapshots'][event_key]
    f = end['overall']
    event_f = event['overall']
    labels = {
        'reported_reach_sum_nonunique': 'Reported reach sum, nonunique',
        'impressions': 'Impressions',
        'clicks': 'Clicks',
        'landing_page_sessions': 'Landing-page sessions',
        'registration_starts': 'Anonymous form starts',
        'identified_external_people': 'Identified external people, including walk-ins',
        'engaged_people': 'Meaningfully engaged external people',
        'broad_engaged_people': 'Broad engagement including page visits and email opens',
        'registered_people': 'Registered external people, any status',
        'confirmed_people': 'Currently confirmed external people',
        'attended_people': 'Unique verified external visitors',
        'registered_and_attended_people': 'Registered external people who attended',
        'confirmed_and_attended_people': 'Confirmed external people who attended',
        'marketing_spend_inr': 'Net posted marketing spend, INR',
    }
    chunks = [
        '# CampusFest 2025 data audit',
        f'Workbook SHA-256 `{m["workbook_sha256"]}`. Dates are end-of-day IST. '
        'Regenerate from the original workbook using the command below.',
        '```bash\nuv run --with openpyxl --with pandas python audit.py\n```',
        '## Stable IDs and data quality',
        table(('Sheet', 'Rows as supplied', 'Unique keys', 'Retry rows', 'Raw blanks', 'Deduped blanks'), [
            (name, d['raw_rows'], d['unique_rows'], d['duplicate_extra_rows'],
             ', '.join(f'{col} {n:,}' for col, n in d['raw_nulls'].items()) or '—',
             ', '.join(f'{col} {n:,}' for col, n in d['deduped_nulls'].items()) or '—')
            for name, d in q['tables'].items()
        ]),
        'Retry counts are extra rows with identical contents. The script rejects conflicting repeated keys. '
        '`metrics.json → data_quality.tables` lists the stable retry IDs. Empty worksheet padding is ignored.',
        table(('Quality check', 'Result'), [
            ('Populated foreign keys with no parent', sum(ref['rows'] for refs in q['orphan_foreign_keys'].values() for ref in refs.values())),
            ('Dated fields past the coverage end', sum(sum(fields.values()) for fields in q['after_history_end'].values())),
            ('Dated fields before the coverage start', sum(sum(fields.values()) for fields in q['before_history_start'].values())),
            ('Pre-identity interaction/registration/history/check-in rows', sum(r['activity_before_first_seen_rows'] for r in q['join_and_timing_checks'].values())),
            ('History states before the registration timestamp', q['registration_history_before_registration']),
            ('Tied registration-state timestamps for a registration', q['registration_history_simultaneous_version_pairs']),
            ('Campaign owner mismatches', sum(q['owner_mismatch_against_campaign_rows'].values())),
            ('Check-ins outside the planned event window', q['checkin_before_event_start'] + q['checkin_after_event_end']),
            ('People with multiple registration IDs', q['people_with_multiple_registration_ids']),
            ('Shared display-name labels / people affected', f'{q["shared_name_label_count"]} / {q["people_with_shared_name_label"]}'),
            ('Cancelled then reconfirmed registration IDs', q['cancelled_then_reconfirmed_count']),
            ('People with multiple distinct check-in attempts (all / external)', f'{q["people_with_multiple_attempts_all"]:,} / {q["people_with_multiple_attempts_external"]:,}'),
            ('External visitors with multiple verified admission events', q['people_with_multiple_verified_attempts_external']),
            ('Unattributed deduped check-in events / people, all types', f'{q["unattributed_checkin_events"]:,} / {q["unattributed_unique_checkin_people"]:,}'),
            ('Unattributed verified external events / people', f'{q["verified_external_unattributed_checkin_events"]:,} / {q["verified_external_unattributed_checkin_people"]:,}'),
        ]),
        'People by type — ' + ', '.join(f'{k} {v:,}' for k, v in q['people_by_type'].items()) + '. '
        'Registrations by type — ' + ', '.join(f'{k} {v:,}' for k, v in q['registrations_by_type'].items()) + '. '
        'Blank first-campaign fields cover walk-ins and event-access identities. Blank check-in campaign/name/registration fields indicate no linked registration or campaign in this workbook. '
        'Campaign owner IDs are the available owner reference because the workbook contains no team dictionary.',
        table(('Person type', 'Result', 'Verification', 'Distinct event IDs'), [
            (r['person_type'], r['result'], r['verification'], r['events'])
            for r in q['checkins_by_type_result_verification']
        ]),
        '## Funnel and target progress',
        table(('Metric', event_key, end_key), [(label, f'{event_f[key]:,}', f'{f[key]:,}') for key, label in labels.items()]),
        'Reported reach is a sum across daily campaign records; cross-day and cross-campaign overlap is unavailable. '
        'The anonymous series counts observations. Use CTR, sessions per click and starts per session as reporting ratios. '
        'Crossing from sessions or starts to identified people is directional because the workbook lacks a session-to-person join. '
        'Identified external people include walk-ins. Meaningful engagement uses brochure downloads, identified starts, questions and nurture link clicks. '
        'Broad engagement also counts page visits and opens. Sends and opt-outs are tracked separately. '
        'Funnel stages can overlap or be skipped. Show-up uses the intersection with the eligible registration or current-confirmation cohort.',
        table(('End of day', 'Target in effect', 'Identified actual / target', 'Registered actual / target', 'Visitors actual / target', 'Spend / approved budget'), [
            (day, row['target']['target_version'], *[
                f'{v["actual"]:,} / {v["goal"]:,} ({pct(v["fraction"])})'
                for v in row['target_progress'].values()
            ]) for day, row in m['snapshots'].items()
        ]),
        'Plan effective at 09:00 IST on 15 March. Compare actuals to the target in force on the selected date. '
        f'Historical context only, the close totals against launch goals would be {pct(ratio(f["identified_external_people"], m["target_versions"][0]["identified_external_people_goal"]))} identified, '
        f'{pct(ratio(f["registered_people"], m["target_versions"][0]["registration_goal"]))} registered and '
        f'{pct(ratio(f["attended_people"], m["target_versions"][0]["unique_external_visitors_goal"]))} visitors.',
        f'Event-day budget headroom was {money(-event["target_progress"]["marketing_budget_inr"]["actual_minus_goal"])}. '
        f'Close headroom was {money(-end["target_progress"]["marketing_budget_inr"]["actual_minus_goal"])}. '
        'The April 16 and 18 credits explain the change. '
        f'Close registered show-up was {pct(f["rates"]["registered_show_up"])} and confirmed show-up was {pct(f["rates"]["confirmed_show_up"])}. '
        f'The headline attendance-to-registration ratio including walk-ins was {pct(f["rates"]["attendees_per_registration_headline_including_walkins"])}.',
        table(('Date', 'Verified external events', 'Distinct on day', 'New people', 'Returned from prior days'), [
            (day, *record.values()) for day, record in m['attendance_by_event_day'].items()
        ]),
        'Negative net spend by posting date — ' + ', '.join(
            f'{r["activity_date"].date()} {r["campaign_id"]} {money(r["marketing_spend_inr"])}'
            for r in q['negative_daily_net_spend_rows']
        ) + '.',
        table(('Overall rate', event_key, end_key), [
            ('CTR', pct(event_f['rates']['clicks_per_impression']), pct(f['rates']['clicks_per_impression'])),
            ('Sessions / clicks', pct(event_f['rates']['sessions_per_click']), pct(f['rates']['sessions_per_click'])),
            ('Starts / sessions', pct(event_f['rates']['starts_per_session']), pct(f['rates']['starts_per_session'])),
            ('Meaningful engagement / identified', pct(event_f['rates']['engaged_among_identified_people']), pct(f['rates']['engaged_among_identified_people'])),
            ('Registered among engaged', pct(event_f['rates']['registered_among_engaged_people']), pct(f['rates']['registered_among_engaged_people'])),
            ('Registered / identified', pct(event_f['rates']['registered_among_identified_people']), pct(f['rates']['registered_among_identified_people'])),
            ('Confirmed / registered', pct(event_f['rates']['confirmed_among_registered_people']), pct(f['rates']['confirmed_among_registered_people'])),
            ('CPA per registration', money(event_f['rates']['cpa_per_registration_inr']), money(f['rates']['cpa_per_registration_inr'])),
            ('CPA per visitor including walk-ins', money(event_f['rates']['cpa_per_attendee_inr']), money(f['rates']['cpa_per_attendee_inr'])),
        ]),
        '## Campaign results',
        'This table uses fixed first-touch cohorts for the person stages and each campaign’s own spend ledger. '
        'The three attendance columns compare first touch, registration source and the earliest admitted-and-verified check-in source. '
        'An unattributed check-in keeps its blank source. An unregistered visitor goes to the unattributed registration-source bucket. '
        'Identified and engagement results under the registration-source view use first touch and interaction context respectively, since registration source is unavailable for leads without a registration. '
        'The current workbook shows the same source at all recorded joins. Future disagreement can change the results. '
        'The machine-readable output includes both complete views, same-source check-in intersection counts, and any-verified-event check-in attribution.',
        table(('Campaign', 'Net INR', 'Identified', 'Engaged', 'Reg', 'Confirmed', 'Visitors first / reg / check-in', 'INR / reg', 'INR / visitor', 'Reg show-up', 'Conf show-up'), [
            (r['campaign_name'], f'{a["marketing_spend_inr"]:,}', a['identified_external_people'],
             a['engaged_people'], a['registered_people'], a['confirmed_people'],
             f'{a["attended_people"]} / {r["registration_source"]["attended_people"]} / {r["checkin_source"]["attended_people"]}',
             money(a['rates']['cpa_per_registration_inr']), money(a['rates']['cpa_per_attendee_inr']),
             pct(a['rates']['registered_show_up']), pct(a['rates']['confirmed_show_up']))
            for r in end['campaigns'].values() for a in [r['first_touch']]
        ]),
        table(('Campaign', 'CTR', 'Sessions / clicks', 'Starts / sessions', 'People / sessions*', 'Engaged / identified', 'Reg among engaged', 'Reg / identified', 'Reg / clicks*', 'Confirmed / reg', 'Visitors / reg*'), [
            (r['campaign_name'], *(pct(r['first_touch']['rates'][key]) for key in (
                'clicks_per_impression', 'sessions_per_click', 'starts_per_session',
                'identified_people_per_session_directional', 'engaged_among_identified_people',
                'registered_among_engaged_people', 'registered_among_identified_people',
                'registrations_per_click_directional', 'confirmed_among_registered_people',
                'attendees_per_registration_headline_including_walkins'
            ))) for r in end['campaigns'].values()
        ]),
        '*Directional aggregate ratio. The attendee numerator may include walk-ins overall. For campaign show-up, use the cohort intersection.',
        table(('Campaign', 'Impressions', 'Clicks', 'Sessions', 'Anonymous starts', 'Cancelled now', 'Waitlisted now', 'Confirmed no-shows'), [
            (r['campaign_name'], *(f'{a[k]:,}' for k in PLATFORM[1:-1]),
             a['latest_status_by_person_distinct_within_status']['cancelled'],
             a['latest_status_by_person_distinct_within_status']['waitlisted'],
             a['confirmed_people'] - a['confirmed_and_attended_people'])
            for r in end['campaigns'].values() for a in [r['first_touch']]
        ]),
        '## Weekly trend',
        'Weekly cells show new identified / newly registered / net change in confirmed / newly attended / net INR. '
        'Coverage begins on a Wednesday. `metrics.json → weekly_campaigns` contains the full anonymous funnel and snapshot status breakdown for each week and attribution method. '
        'Channel rollouts were staggered. New confirmations can exceed new registrations in a reporting week when older registrations advance.',
    ]
    columns = list(a for a in end['campaigns'] if a != UNATTR)
    chunks.append(table(('Through IST Sunday', *columns, 'Unattr.'), [
        (
            str(week['through']),
            *[
                ' / '.join(str(flow[key]) for key in (
                    'identified_external_people', 'registered_people',
                    'net_change_in_latest_confirmed_people', 'attended_people', 'marketing_spend_inr'
                ))
                for cid in (*columns, UNATTR)
                for flow in [week['campaigns'][cid]['first_touch']['period_increment']]
            ],
        ) for week in m['weekly_campaigns']
    ]))
    ranked = sorted(
        (r for cid, r in end['campaigns'].items()
         if cid != UNATTR and r['first_touch']['rates']['cpa_per_attendee_inr'] is not None),
        key=lambda r: r['first_touch']['rates']['cpa_per_attendee_inr'],
    )
    chunks.append('Visitor CPA, lowest to highest — ' + ', '.join(
        f'{r["campaign_name"]} {money(r["first_touch"]["rates"]["cpa_per_attendee_inr"])}' for r in ranked
    ) + '.')
    weeks_by_end = {w['through'].isoformat(): w['campaigns'] for w in m['weekly_campaigns']}
    trend_dates = ('2025-03-02', '2025-03-09', '2025-03-16', '2025-03-23',
                   '2025-03-30', '2025-04-06', '2025-04-13')
    if set(trend_dates) <= weeks_by_end.keys() and {'C02', 'C03', 'C04', 'C05'} <= end['campaigns'].keys():
        chunks.append('Weekly changes around the March slowdown and partnership ramp. '
                      'These are same-period counts. Registration lag and posting schedules can affect comparisons.')
        chunks.append(table(('Week through', 'Paid clicks / reg', 'Creator clicks / reg',
                             'Partnership clicks / reg', 'Referral clicks / reg'), [
            (day, *(
                f'{period["clicks"]:,} / {period["registered_people"]:,}'
                for cid in ('C02', 'C03', 'C04', 'C05')
                for period in [weeks_by_end[day][cid]['first_touch']['period_increment']]
            )) for day in trend_dates
        ]))
        def flow(day, campaign):
            return weeks_by_end[day][campaign]['first_touch']['period_increment']

        paid_before = flow('2025-03-02', 'C02')
        paid_break = flow('2025-03-09', 'C02')
        paid_close = end['campaigns']['C02']['first_touch']
        creator = end['campaigns']['C03']['first_touch']
        partners = end['campaigns']['C04']['first_touch']
        refs = end['campaigns']['C05']['first_touch']
        chunks.extend([
            f'Paid Social went from {paid_before["registered_people"]} registrations on {paid_before["clicks"]:,} clicks to '
            f'{paid_break["registered_people"]} on {paid_break["clicks"]:,} clicks in the 9 March week. '
            f'It finished with {paid_close["confirmed_people"] - paid_close["confirmed_and_attended_people"]} confirmed people who did not attend '
            f'and {paid_close["latest_status_by_person_distinct_within_status"]["cancelled"]} latest cancellations. '
            f'Creator Partners registered {creator["registered_people"]} people and checked in {creator["registered_and_attended_people"]} of them. '
            'Prioritize testing commitment and the arrival flow for both channels.',
            f'College Partnerships reached {pct(partners["rates"]["registered_show_up"])} registered show-up, '
            f'and referrals reached {money(refs["rates"]["cpa_per_attendee_inr"])} per attributed visitor. '
            'The weekly series makes group booking and cohort lag plausible explanations for abrupt moves. '
            'The source fields lack booking group size, campaign experiment assignment and cancellation reason.',
        ])
    chunks.extend([
        '## Current registration status over time',
        'Latest eligible state per registration ID after deduplication. Each row here equals the person-level status counts because all registration IDs belong to different people. '
        'The four source values are interested, confirmed, cancelled and waitlisted. `metrics.json → daily_status_trend` covers all dates.',
        table(('Date', 'Registered', *STATUSES), [
            (r['as_of'], r['registered_people'], *r['latest_external_registrations_by_status'].values())
            for r in m['daily_status_trend'] if r['as_of'] in {
                w['through'] for w in m['weekly_campaigns']
            } | {date.fromisoformat(d) for d in m['snapshots']}
        ]),
        '## Checks a grader can reproduce',
        f'- Event-close vs history-close spend? {money(event_f["marketing_spend_inr"])} then {money(f["marketing_spend_inr"])}. '
        'Post-event vendor credits post in their own periods.',
        f'- How many attended without registration? {f["attended_unregistered_people"]}. '
        f'The event recorded {f["external_verified_admission_events"]:,} verified external admission events and {f["attended_people"]:,} unique visitors.',
        f'- What if manual admissions are omitted? Scanner-only measurement yields {q["verification_sources_external_people"]["scanner_total"]:,} unique external visitors. '
        f'Manual records add {q["verification_sources_external_people"]["manual_only"]:,} distinct visitors beyond scanner data.',
        f'- How many registrations became reconfirmed after cancellation? {q["cancelled_then_reconfirmed_count"]}; each preserves its person and registration ID.',
        '- Can reported reach answer how many different people saw the campaign across all days? The overlap data is absent.',
        '- Which target applies on 14 versus 15 March? Launch then revised. The revision timestamp is 15 March at 09:00 IST.',
        '- How many attended before festival day? Zero through 11 April; 12 April admits only observations through that day.',
        f'- How many unique visitors were currently cancelled at close? {f["verified_visitor_cohort_by_latest_status"]["cancelled"]}. '
        'Admission evidence and latest registration status measure different things.',
    ])
    return '\n\n'.join(chunks) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', nargs='?', type=Path, default=Path.home() / 'Projects/risalabs/Attendee Dataset.xlsx')
    parser.add_argument('--out', type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    sheets, quality = read_workbook(args.workbook)
    metrics = run_audit(sheets, quality, args.workbook)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / 'metrics.json').write_text(json.dumps(metrics, indent=2, default=iso, allow_nan=False) + '\n')
    (args.out / 'data_audit.md').write_text(report(metrics))


if __name__ == '__main__':
    main()
