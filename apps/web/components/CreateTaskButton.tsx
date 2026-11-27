'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { mutate } from '@/lib/mutate';

export interface FindingLite {
  id: string; title: string; severity: string; campaign_id?: string; suggested_action: string; caveat?: string; as_of: string; data_revision: number;
  evidence: { metric: string; value: number | null; numerator?: number; denominator?: number };
  owner_id?: string | null;
}

/** Insight → task: prefilled from a Diagnose finding (insight_id + evidence snapshot). */
export function CreateTaskButton({ finding, existing }: { finding: FindingLite; existing?: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (existing) return <a href="/execution" className="text-xs text-emerald-700 underline">Task #{existing} exists</a>;
  const go = async () => {
    setBusy(true);
    const e = finding.evidence;
    const r = await mutate('task', 'create', {
      title: finding.title.slice(0, 190), description: `${finding.suggested_action}${finding.caveat ? ` ${finding.caveat}` : ''}`,
      campaign_id: finding.campaign_id ?? null, owner_id: finding.owner_id ?? null,
      priority: finding.severity === 'high' ? 'p0' : finding.severity === 'medium' ? 'p1' : 'p2', status: 'todo', created_via: 'insight', insight_id: finding.id,
      evidence: [{ tool: 'diagnose_bottlenecks', metric: e.metric, value: e.numerator !== undefined ? `${e.numerator}/${e.denominator} (as of ${finding.as_of}, rev ${finding.data_revision})` : String(e.value) }],
    });
    setBusy(false);
    if (r.ok) router.refresh();
  };
  return <button onClick={go} disabled={busy} className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-50">{busy ? 'Creating…' : 'Create task'}</button>;
}
