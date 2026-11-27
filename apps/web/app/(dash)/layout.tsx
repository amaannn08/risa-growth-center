import { Suspense } from 'react';
import { Nav } from '@/components/Nav';
import { TopBar } from '@/components/TopBar';
import { getShellMeta } from '@/lib/data';
import { getDb, loadDataset } from '@gc/db';
import { coverageEnd, coverageStart } from '@gc/core';

export const dynamic = 'force-dynamic';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const [meta, { ds }] = await Promise.all([getShellMeta(), getDb().then((db) => loadDataset(db))]);
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-52 shrink-0 border-r bg-slate-50 md:block">
        <div className="px-4 py-3"><div className="text-sm font-semibold">RISA Growth Center</div><div className="text-xs text-slate-500">CampusFest · Challenge A</div></div>
        <Suspense><Nav /></Suspense>
      </aside>
      <div className="min-w-0 flex-1">
        <Suspense><TopBar rev={meta.data_revision} edits={meta.edits_since_reset} covStart={coverageStart(ds)} covEnd={coverageEnd(ds)} /></Suspense>
        <main className="p-4">{children}</main>
      </div>
    </div>
  );
}
