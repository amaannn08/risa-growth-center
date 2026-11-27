import { fmtInt, fmtPct } from '@gc/core';
import { Tag } from './kit';

interface Step { label: string; value: number; note?: string }
function Bars({ steps, color, directional }: { steps: Step[]; color: string; directional?: boolean }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <ul className="space-y-1.5">
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        const conv = prev && prev.value > 0 ? s.value / prev.value : null;
        return (
          <li key={s.label} className="grid grid-cols-[130px_1fr_auto] items-center gap-2 text-xs" title={prev ? `${fmtInt(s.value)} / ${fmtInt(prev.value)} of previous step` : undefined}>
            <span className="text-slate-600">{s.label}</span>
            <div className="h-4 rounded bg-slate-100"><div className="h-4 rounded" style={{ width: `${Math.max(1, (s.value / max) * 100)}%`, background: color }} /></div>
            <span className="w-28 text-right tabular-nums"><b>{fmtInt(s.value)}</b>{conv !== null && <span className="ml-1 text-slate-500">{fmtPct(conv, 1)}{directional ? ' ᵈ' : ''}</span>}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Funnel({ platform, people }: { platform: Step[]; people: Step[] }) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">Observations, not people <Tag t="D" /></div>
        <Bars steps={platform} color="#94a3b8" directional />
        <p className="mt-2 text-[11px] text-slate-500">Reach is a non-unique daily sum. Step ratios (ᵈ) are directional: sessions cannot be joined to people.</p>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-600">People (unique external) <Tag t="D" /></div>
        <Bars steps={people} color="#2563eb" />
      </div>
    </div>
  );
}
