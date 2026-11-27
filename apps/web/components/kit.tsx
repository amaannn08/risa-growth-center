import type { ReactNode } from 'react';
import { TAG_STYLE } from '@/lib/ui';

export function Tag({ t, title }: { t: 'S' | 'D' | 'A' | string; title?: string }) {
  const label = { S: 'Sourced benchmark', D: 'From the 2025 dataset', A: 'Assumption' }[t] ?? t;
  return <span title={title ?? label} className={`inline-flex size-4 items-center justify-center rounded text-[10px] font-semibold ${TAG_STYLE[t] ?? 'bg-slate-100 text-slate-600'}`}>{t}</span>;
}

export function Panel({ title, tag, right, children, className = '', id }: { title?: ReactNode; tag?: string; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-lg border bg-white ${className}`}>
      {(title || right) && (
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <h2 className="text-sm font-semibold">{title}</h2>{tag && <Tag t={tag} />}
          <div className="ml-auto text-xs text-slate-500">{right}</div>
        </div>
      )}
      <div className="p-3">{children}</div>
    </section>
  );
}

export function Kpi({ label, value, sub, tag, title, testId, tone }: { label: string; value: ReactNode; sub?: ReactNode; tag?: string; title?: string; testId?: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border bg-white p-3" title={title} data-testid={testId}>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">{label}{tag && <Tag t={tag} />}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === 'bad' ? 'text-red-700' : ''}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500 tabular-nums">{sub}</div>}
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-3">
      <h1 className="text-lg font-semibold">{title}</h1>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export const th = 'px-2 py-1.5 text-left text-xs font-medium text-slate-500 whitespace-nowrap';
export const td = 'px-2 py-1.5 text-sm tabular-nums';
export const tdr = `${td} text-right`;
export const thr = `${th} text-right`;

export function Pill({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>;
}

export const Caveat = ({ children }: { children: ReactNode }) => <p className="mt-2 text-xs text-slate-500">{children}</p>;
