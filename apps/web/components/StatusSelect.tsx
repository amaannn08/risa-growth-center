'use client';
import { useRouter } from 'next/navigation';
import { mutate } from '@/lib/mutate';
import { STATUS_STYLE } from '@/lib/ui';

export function StatusSelect({ campaignId, value }: { campaignId: string; value: string }) {
  const router = useRouter();
  return (
    <select aria-label={`Status of ${campaignId}`} data-testid={`status-${campaignId}`} value={value} className={`h-6 rounded-full border-0 px-2 text-xs font-medium ${STATUS_STYLE[value] ?? ''}`}
      onChange={async (e) => { const r = await mutate('campaign', 'update', { id: campaignId, patch: { status: e.target.value } }); if (r.ok) router.refresh(); }}>
      <option value="active">active</option><option value="paused">paused</option><option value="stopped">stopped</option>
    </select>
  );
}
