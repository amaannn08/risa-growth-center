import { NextResponse } from 'next/server';
import { applyMutation, getDb, MutationError, withClient } from '@gc/db';
import { allow, clientId } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Body: { action, ...input }. Entities: daily_marketing, person, registration, registration_status, checkin, target_version, campaign, task, experiment, bet, assumption, decision_rule. */
export async function POST(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const { entity } = await params;
  const cid = clientId(req);
  if (!(await allow(`mut:${cid}`, Number(process.env.MUTATION_RATE_LIMIT ?? 30)))) {
    return NextResponse.json({ ok: false, error: { code: 'RATE_LIMITED', message: 'Too many edits, try again in a few minutes.' } }, { status: 429 });
  }
  try {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } }, { status: 400 }); }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body as any).action !== 'string') {
      return NextResponse.json({ ok: false, error: { code: 'BAD_REQUEST', message: 'Body must be an object with a string "action"' } }, { status: 400 });
    }
    const { action, ...input } = body as { action: string };
    const db = await getDb();
    const res = await withClient(cid, () => applyMutation(db, entity, action, input, 'user'));
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof MutationError) return NextResponse.json({ ok: false, error: { code: e.code, message: e.message } }, { status: e.code === 'NOT_FOUND' ? 404 : 400 });
    console.error('mutation failed', entity, e);
    return NextResponse.json({ ok: false, error: { code: 'INTERNAL', message: 'Unexpected error' } }, { status: 500 });
  }
}
