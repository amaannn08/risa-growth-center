import { createDb, loadEnv, migrate, resetToSeed, seedDb, verifyAgainstReference } from '../src';

loadEnv();
// A fresh checkout has no env file: default to the same local PGlite file `pnpm dev` uses, so `pnpm db:migrate && pnpm db:seed && pnpm db:verify` works as written.
if (!process.env.DATABASE_URL && !process.argv.includes('--dry-run')) { process.env.DATABASE_URL = 'pglite:.pglite'; console.log('DATABASE_URL is not set: using the local PGlite file ./.pglite'); }
const cmd = process.argv[2];
const db = await createDb(cmd === 'migrate' && process.argv.includes('--dry-run') ? 'pglite:memory' : undefined);
try {
  if (cmd === 'migrate' && process.argv.includes('--dry-run')) {
    // Never touches DATABASE_URL: applies every migration file to a throwaway in-memory PGlite to prove the SQL is valid, then lists them.
    await migrate(db);
    const names = (await db.query<{ name: string }>('SELECT name FROM _gc_migrations ORDER BY name')).map((r) => r.name);
    console.log(`dry-run OK: ${names.length} migration files apply cleanly on a fresh in-memory database:\n${names.map((n) => '  ' + n).join('\n')}`);
  } else if (cmd === 'migrate') { await migrate(db); console.log(`migrated (${db.kind})`); }
  else if (cmd === 'seed') { const r = await seedDb(db, { force: process.argv.includes('--force') }); console.log(r.skipped ? 'already seeded (use --force to reseed)' : 'seeded'); }
  else if (cmd === 'reset') { console.log(await resetToSeed(db, 'system')); }
  else if (cmd === 'verify') {
    const t0 = Date.now();
    const diffs = await verifyAgainstReference(db, { full: process.argv.includes('--full') });
    if (diffs.length) { console.error(`db:verify FAILED (${diffs.length}+ diffs)\n` + diffs.slice(0, 10).join('\n')); process.exitCode = 1; }
    else console.log(`db:verify OK on ${db.kind} — 5 snapshots + data_quality match metrics.json (${Date.now() - t0} ms)`);
  } else { console.error('usage: cli.ts migrate|seed|reset|verify'); process.exitCode = 2; }
} finally { await db.close(); }
