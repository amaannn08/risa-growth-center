'use client';
import { useRouter } from 'next/navigation';
import { mutate } from '@/lib/mutate';

export function DeleteButton({ entity, body, label = 'Delete', confirmText }: { entity: string; body: Record<string, unknown>; label?: string; confirmText?: string }) {
  const router = useRouter();
  return (
    <button className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-700 hover:bg-red-50" onClick={async () => {
      if (confirmText && !window.confirm(confirmText)) return;
      const r = await mutate(entity, 'delete', body);
      if (r.ok) router.refresh();
    }}>{label}</button>
  );
}
