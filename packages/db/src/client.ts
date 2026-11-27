import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Minimal driver-neutral executor: raw parameterised SQL on postgres-js (Neon) or PGlite (tests / local fallback). */
export interface Q {
  query<T = Record<string, any>>(text: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Q {
  tx<R>(fn: (q: Q) => Promise<R>): Promise<R>;
  kind: 'postgres' | 'pglite';
  close(): Promise<void>;
}

/** Monorepo root, found by walking up from cwd (robust under Next/webpack bundling, where import.meta.url is unusable). */
function findRoot(): string {
  let d = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(d, 'pnpm-workspace.yaml'))) return d;
    d = dirname(d);
  }
  return process.cwd();
}
export const REPO_ROOT = findRoot();
export const DB_ROOT = join(REPO_ROOT, 'packages/db');

/** Load apps/web/.env.local into process.env (scripts only; Next loads it itself). Never prints values. */
export function loadEnv() {
  const f = join(REPO_ROOT, 'apps/web/.env.local');
  if (existsSync(f) && typeof (process as any).loadEnvFile === 'function') {
    try { (process as any).loadEnvFile(f); } catch { /* ignore */ }
  }
}

export async function createDb(url?: string): Promise<Db> {
  const u = url ?? process.env.DATABASE_URL;
  if (u && /^postgres(ql)?:/.test(u)) {
    const postgres = (await import('postgres')).default;
    const sql = postgres(u, { prepare: false, max: 5, idle_timeout: 20, onnotice: () => {} });
    const wrap = (s: any): Q => ({ query: async (t, p) => (await s.unsafe(t, (p ?? []) as any[])) as any });
    return {
      kind: 'postgres', ...wrap(sql),
      tx: (fn) => sql.begin((t: any) => fn(wrap(t))) as any,
      close: () => sql.end({ timeout: 2 }),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const spec = (u ?? 'pglite:memory').replace(/^pglite:/, '');
  const pg = spec === 'memory' || spec === '' ? new PGlite() : new PGlite(resolve(REPO_ROOT, spec)) // relative paths resolve against the monorepo root, so CLI (packages/db) and Next (apps/web) share one file;
  await pg.waitReady;
  const wrap = (s: any): Q => ({ query: async (t, p) => (await s.query(t, p ?? [])).rows as any });
  let chain: Promise<unknown> = Promise.resolve();
  return {
    kind: 'pglite',
    query: (t, p) => (wrap(pg).query as any)(t, p),
    // PGlite is single-connection: serialise transactions.
    tx: (fn) => {
      const run = chain.then(() => pg.transaction((t) => fn(wrap(t))));
      chain = run.catch(() => {});
      return run as any;
    },
    close: () => pg.close(),
  };
}

const g = globalThis as any;
/** Process-wide singleton (survives Next dev HMR). */
export function getDb(): Promise<Db> {
  if (!g.__gcDb) g.__gcDb = createDb();
  return g.__gcDb;
}

/** Apply drizzle-generated SQL (+ seed schema) once. Tracked in _gc_migrations. */
export async function migrate(db: Db) {
  await db.query('CREATE TABLE IF NOT EXISTS _gc_migrations (name text PRIMARY KEY, at timestamptz DEFAULT now())');
  const files = [
    ...readdirSync(join(DB_ROOT, 'drizzle')).filter((f) => f.endsWith('.sql')).sort().map((f) => join(DB_ROOT, 'drizzle', f)),
    join(DB_ROOT, 'sql/seed_schema.sql'),
  ];
  for (const f of files) {
    const name = f.split('/').pop()!;
    const done = await db.query('SELECT 1 FROM _gc_migrations WHERE name=$1', [name]);
    if (done.length) continue;
    const text = readFileSync(f, 'utf8');
    const stmts = (text.includes('statement-breakpoint') ? text.split('--> statement-breakpoint') : text.split(/;\s*\n/)).map((s) => s.trim()).filter(Boolean);
    await db.tx(async (q) => {
      for (const s of stmts) await q.query(s);
      await q.query('INSERT INTO _gc_migrations(name) VALUES ($1)', [name]);
    });
  }
}
