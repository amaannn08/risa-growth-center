/** IST is a fixed +05:30 offset (no DST). */
const IST_MS = 19_800_000;
const DAY_MS = 86_400_000;

export function istDate(ms: number): string {
  return new Date(ms + IST_MS).toISOString().slice(0, 10);
}
export function addDays(date: string, n: number): string {
  return new Date(Date.parse(date + 'T00:00:00Z') + n * DAY_MS).toISOString().slice(0, 10);
}
export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY_MS);
}
/** First instant of the day after `asOf`, in IST. Every "as of" filter is ts < eodExclusive(asOf). */
export function eodExclusive(asOf: string): number {
  return Date.parse(addDays(asOf, 1) + 'T00:00:00+05:30');
}
export function toMs(v: string | number): number {
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error(`Bad timestamp: ${v}`);
  return t;
}
/** YYYY-MM-DDTHH:MM:SS+05:30 (Python isoformat, no microseconds). */
export function isoIST(ms: number): string {
  return new Date(ms + IST_MS).toISOString().slice(0, 19) + '+05:30';
}
export function normTs(v: string | number | null | undefined): string | null {
  return v === null || v === undefined ? null : isoIST(toMs(v));
}
/** Python weekday: Monday = 0. */
export function weekdayMon0(date: string): number {
  return (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7;
}
export function istWeekdayName(date: string): string {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekdayMon0(date)]!;
}
/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  return addDays(date, -weekdayMon0(date));
}
