import { NextResponse } from 'next/server';
import { applyMutation, getDb, MutationError } from '@gc/db';
import { allow, clientKey } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Body: { action, ...input }. Entities: daily_marketing, person, registration, registration_status, checkin, target_version, campaign, task, experiment, bet, assumption, decision_rule. */
export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  if (!allow(`mut:${clientKey(req)}`, Number(process.env.MUTATION_RATE_LIMIT ?? 30))) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many edits, try again in a few minutes.' } }, { status: 429 });
  }
  try {
    const { action, ...input } = (await req.json()) as { action: string };
    const db = await getDb();
    const res = await applyMutation(db, entity, action, input, 'user');
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof MutationError) return NextResponse.json({ ok: false, error: { code: e.code, message: e.message } }, { status: e.code === 'NOT_FOUND' ? 404 : 400 });
    console.error('mutation failed', entity, e);
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL', message: 'Unexpected error' } }, { status: 500 });
  }
}
