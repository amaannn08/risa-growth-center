import type { Db } from './client';
import { SEED_TABLES, syncSequences } from './seed';

/** Restore every dataset + management table from the pristine `seed` schema in one transaction. audit_log is appended, never truncated. */
export async function resetToSeed(db: Db, actor: 'user' | 'system' = 'user') {
  return db.tx(async (q) => {
    await q.query(`TRUNCATE ${SEED_TABLES.map((t) => `public.${t}`).join(', ')}, public.action_drafts RESTART IDENTITY CASCADE`);
    for (const t of SEED_TABLES) await q.query(`INSERT INTO public.${t} SELECT * FROM seed.${t}`);
    await syncSequences(q);
    const [m] = await q.query<{ data_revision: number }>(
      'UPDATE app_meta SET data_revision=data_revision+1, dataset_revision=dataset_revision+1, edits_since_reset=0 WHERE id=1 RETURNING data_revision');
    await q.query(`INSERT INTO audit_log(actor, entity, entity_id, action, before, after, data_revision) VALUES ($1::actor,'dataset','all','reset',null,'{"restored":"seed"}'::text::jsonb,$2)`, [actor, m!.data_revision]);
    return { ok: true as const, data_revision: m!.data_revision };
  });
}
