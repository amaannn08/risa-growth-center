import { NextResponse } from 'next/server';
import { getDb, resetToSeed, withClient } from '@gc/db';
import { allow, clientId } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const cid = clientId(req);
  if (!(await allow(`reset:${cid}`, Number(process.env.MUTATION_RATE_LIMIT ?? 30)))) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, try again in a few minutes.' } }, { status: 429 });
  }
  const db = await getDb();
  const r = await withClient(cid, () => resetToSeed(db, 'user'));
  return NextResponse.json(r);
}
