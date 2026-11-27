import { NextResponse } from 'next/server';
import { discardDraft, getDb } from '@gc/db';
import { allow, clientKey } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!allow(`mut:${clientKey(req)}`, Number(process.env.MUTATION_RATE_LIMIT ?? 30))) return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }, { status: 429 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: { code: 'BAD_ID', message: 'Invalid draft id' } }, { status: 400 });
  return NextResponse.json(await discardDraft(await getDb(), id));
}
