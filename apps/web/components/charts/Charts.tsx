'use client';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Cell } from 'recharts';

const nf = new Intl.NumberFormat('en-US');

export interface LineSpec { key: string; label: string; color: string; step?: boolean; dashed?: boolean }
export function CumulativeChart({ data, lines, height = 220, money = false, xKey = 'date' }: { data: Record<string, any>[]; lines: LineSpec[]; height?: number; money?: boolean; xKey?: string }) {
  const f = (v: number) => (money ? `₹${nf.format(v)}` : nf.format(v));
  return (
    <div style={{ height }} data-testid="chart-cumulative">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => (money ? `${Math.round(v / 1000)}k` : nf.format(v))} width={44} />
          <Tooltip formatter={(v: any) => f(Number(v))} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {lines.map((l) => (
            <Line key={l.key} type={l.step ? 'stepAfter' : 'monotone'} dataKey={l.key} name={l.label} stroke={l.color} dot={false} strokeWidth={2} strokeDasharray={l.dashed ? '5 4' : undefined} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface QPoint { id: string; name: string; x: number; y: number; size: number; color: string; decision?: string }
export function QuadrantChart({ points, xLines, yLines, xLabel, yLabel, yPct = true }: { points: QPoint[]; xLines: number[]; yLines: number[]; xLabel: string; yLabel: string; yPct?: boolean }) {
  return (
    <div style={{ height: 300 }} data-testid="chart-quadrant">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ScatterChart margin={{ top: 10, right: 20, left: 6, bottom: 22 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis type="number" dataKey="x" name={xLabel} tick={{ fontSize: 10 }} label={{ value: xLabel, position: 'insideBottom', offset: -12, fontSize: 11 }} domain={['dataMin - 10', 'dataMax + 10']} tickFormatter={(v: number) => String(Math.round(v))} />
          <YAxis type="number" dataKey="y" name={yLabel} tick={{ fontSize: 10 }} tickFormatter={(v: number) => (yPct ? `${Math.round(v * 100)}%` : String(v))} domain={[0.3, 1]} width={44} label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 11 }} />
          <ZAxis type="number" dataKey="size" range={[80, 700]} />
          {xLines.map((x, i) => <ReferenceLine key={`x${i}`} x={x} stroke="#94a3b8" strokeDasharray="4 4" />)}
          {yLines.map((y, i) => <ReferenceLine key={`y${i}`} y={y} stroke="#94a3b8" strokeDasharray="4 4" />)}
          <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
            const p = payload?.[0]?.payload as QPoint | undefined;
            if (!p) return null;
            return <div className="rounded border bg-white p-2 text-xs shadow"><b>{p.name}</b><div>{xLabel}: {p.x.toFixed(2)}</div><div>{yLabel}: {(p.y * 100).toFixed(1)}%</div><div>Visitors: {p.size}</div>{p.decision && <div>Decision: {p.decision}</div>}</div>;
          }} />
          <Scatter data={points} isAnimationActive={false}>
            {points.map((p) => <Cell key={p.id} fill={p.color} fillOpacity={0.75} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyBars({ data, bars, height = 200, xKey = 'week' }: { data: Record<string, any>[]; bars: { key: string; label: string; color: string }[]; height?: number; xKey?: string }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} width={40} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {bars.map((b) => <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} isAnimationActive={false} />)}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Simple horizontal contribution bars (bet scores). */
export function ContribBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded bg-slate-100" title={parts.map((p) => `${p.label} ${p.value.toFixed(2)}`).join(' · ')}>
      {parts.map((p) => <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
    </div>
  );
}
