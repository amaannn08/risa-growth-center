import { createDb, loadEnv, migrate, resetToSeed, seedDb, verifyAgainstReference } from '../src';

loadEnv();
const cmd = process.argv[2];
const db = await createDb();
try {
  if (cmd === 'migrate') { await migrate(db); console.log(`migrated (${db.kind})`); }
  else if (cmd === 'seed') { const r = await seedDb(db, { force: process.argv.includes('--force') }); console.log(r.skipped ? 'already seeded (use --force to reseed)' : 'seeded'); }
  else if (cmd === 'reset') { console.log(await resetToSeed(db, 'system')); }
  else if (cmd === 'verify') {
    const t0 = Date.now();
    const diffs = await verifyAgainstReference(db, { full: process.argv.includes('--full') });
    if (diffs.length) { console.error(`db:verify FAILED (${diffs.length}+ diffs)\n` + diffs.slice(0, 10).join('\n')); process.exitCode = 1; }
    else console.log(`db:verify OK on ${db.kind} — 5 snapshots + data_quality match metrics.json (${Date.now() - t0} ms)`);
  } else { console.error('usage: cli.ts migrate|seed|reset|verify'); process.exitCode = 2; }
} finally { await db.close(); }
