import { getDb, getMeta, loadRawDataset } from '@gc/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await getDb();
  const [meta, raw] = await Promise.all([getMeta(db), loadRawDataset(db)]);
  return new Response(JSON.stringify({ exported_at: new Date().toISOString(), data_revision: meta.data_revision, edits_since_reset: meta.edits_since_reset, tables: raw }), {
    headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="growth-center-rev${meta.data_revision}.json"` },
  });
}
