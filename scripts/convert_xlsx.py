#!/usr/bin/env python3
"""Convert the supplied XLSX into raw JSON (one file per sheet). Read-only on the workbook.

Retry duplicates are KEPT so the TS engine's dedupe is exercised. Conflicting repeats abort.
Run: uv run --with openpyxl python scripts/convert_xlsx.py
"""
import hashlib, json
from collections import Counter
from datetime import datetime
from pathlib import Path
from openpyxl import load_workbook

CONVERTER_VERSION = '1.0.0'
ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data/source/Attendee Dataset.xlsx'
OUT = ROOT / 'data/source/raw'
SHEETS = {  # sheet -> (slug, key fields, timestamp fields, date-only fields)
    'Read me': ('read_me', ('topic', 'description'), (), ()),
    'Field guide': ('field_guide', ('source_table', 'field'), (), ()),
    'Event': ('event', ('event_name',), ('history_start', 'history_end', 'event_starts_at', 'event_ends_at'), ()),
    'Targets': ('targets', ('effective_at',), ('effective_at',), ()),
    'Campaigns': ('campaigns', ('campaign_id',), ('created_at', 'planned_start_at', 'planned_end_at'), ()),
    'Daily Marketing': ('daily_marketing', ('activity_id',), (), ('activity_date',)),
    'People': ('people', ('person_id',), ('first_seen_at',), ()),
    'Interest and Engagement': ('interactions', ('interaction_id',), ('occurred_at',), ()),
    'Registrations': ('registrations', ('registration_id',), ('registered_at',), ()),
    'Registration History': ('registration_history', ('history_id',), ('effective_at',), ()),
    'Check-ins': ('checkins', ('event_id',), ('occurred_at',), ()),
}
IST = '+05:30'


def conv(v, col, ts, dates):
    if v is None:
        return None
    if isinstance(v, datetime):
        if col in dates:
            return v.strftime('%Y-%m-%d')
        return v.strftime('%Y-%m-%dT%H:%M:%S') + IST  # naive xlsx datetimes are IST
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    wb = load_workbook(SRC, read_only=True, data_only=True)
    manifest = {
        'workbook': SRC.name,
        'sha256': hashlib.sha256(SRC.read_bytes()).hexdigest(),
        'converter_version': CONVERTER_VERSION,
        'sheets': {},
    }
    for name, (slug, key_fields, ts, dates) in SHEETS.items():
        it = iter(wb[name].values)
        cols = next(it)
        rows, seen, extra = [], {}, 0
        for cells in it:
            if not any(c is not None for c in cells):
                continue  # padding
            row = {c: conv(v, c, ts, dates) for c, v in zip(cols, cells)}
            key = tuple(row[k] for k in key_fields)
            if None in key:
                raise ValueError(f'{name}: missing key')
            if key in seen:
                if seen[key] != row:
                    raise ValueError(f'{name}: conflicting repeat for {key}')
                extra += 1
            else:
                seen[key] = row
            rows.append(row)
        (OUT / f'{slug}.json').write_text(json.dumps(rows, ensure_ascii=False, indent=0) + '\n')
        manifest['sheets'][slug] = {'sheet': name, 'raw_rows': len(rows), 'unique_rows': len(seen), 'duplicate_extra_rows': extra}
        print(slug, len(rows), len(seen))
    wb.close()
    (ROOT / 'data/source/manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')


if __name__ == '__main__':
    main()
