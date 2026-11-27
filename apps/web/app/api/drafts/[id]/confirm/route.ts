import { NextResponse } from 'next/server';
import { MutationError, confirmDraft, getDb } from '@gc/db';
import { allow, clientKey } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Body (optional): { payload: {...edited fields} }. Exactly-once: repeats return the existing result_ref with already=true. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!allow(`mut:${clientKey(req)}`, Number(process.env.MUTATION_RATE_LIMIT ?? 30))) return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { status: 429 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: { code: 'BAD_ID', message: 'Invalid draft id' } }, { status: 400 });
  try {
    const body = await req.json().catch(() => ({}));
    const res = await confirmDraft(await getDb(), id, body?.payload);
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof MutationError) return NextResponse.json({ ok: false, error: { code: e.code, message: e.message } }, { status: e.code === 'NOT_FOUND' ? 404 : 400 });
    console.error('confirm draft failed', e);
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL', message: 'Unexpected error' } }, { status: 500 });
  }
}
