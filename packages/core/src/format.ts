/** International digit grouping everywhere (₹274,000, not ₹2,74,000). null → "—", never 0. */
const group = (n: number, dp: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

export const fmtInt = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : group(Math.round(v), 0));
export const fmtNum = (v: number | null | undefined, dp = 2) => (v === null || v === undefined || Number.isNaN(v) ? '—' : group(v, dp));
export const fmtInr = (v: number | null | undefined, dp = 0) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : `${v < 0 ? '−' : ''}₹${group(Math.abs(v), dp)}`;
/** Fraction (0..1) → percent string. 1 dp in tables, 2 dp in Copilot. */
export const fmtPct = (frac: number | null | undefined, dp = 1) =>
  frac === null || frac === undefined || Number.isNaN(frac) ? '—' : `${group(frac * 100, dp)}%`;
