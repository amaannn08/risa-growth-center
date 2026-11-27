'use client';
import { toast } from 'sonner';

export interface MutResult { ok: boolean; row?: unknown; data_revision?: number; id?: string | null; error?: { code: string; message: string }; result_ref?: string }
/** POST /api/mutations/:entity — toasts the outcome. Caller should router.refresh() on ok. */
export async function mutate(entity: string, action: string, body: Record<string, unknown>, opts: { quiet?: boolean } = {}): Promise<MutResult> {
  try {
    const res = await fetch(`/api/mutations/${entity}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    const j = (await res.json()) as MutResult;
    if (!j.ok) toast.error(j.error?.message ?? `Request failed (${res.status})`);
    else if (!opts.quiet) toast.success(`Saved · rev ${j.data_revision}`);
    return j;
  } catch (e) {
    toast.error('Network error');
    return { ok: false, error: { code: 'NETWORK', message: String(e) } };
  }
}
