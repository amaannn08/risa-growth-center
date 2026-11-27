import { NextResponse } from 'next/server';
import { getDb, resetToSeed } from '@gc/db';
import { allow, clientKey } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!allow(`reset:${clientKey(req)}`, Number(process.env.MUTATION_RATE_LIMIT ?? 30))) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, try again in a few minutes.' } }, { status: 429 });
  }
  const r = await resetToSeed(await getDb(), 'user');
  return NextResponse.json(r);
}
