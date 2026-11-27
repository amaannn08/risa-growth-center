import { Suspense } from 'react';
import { Nav } from '@/components/Nav';
import { CopilotDock } from '@/components/copilot/Dock';
import { TopBar } from '@/components/TopBar';
import { getShell } from '@/lib/data';
import { coverageEnd, coverageStart } from '@gc/core';

export const dynamic = 'force-dynamic';

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const { meta, ds } = await getShell();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-52 shrink-0 border-r bg-slate-50 md:block">
        <div className="px-4 py-3"><div className="text-sm font-semibold">RISA Growth Center</div><div className="text-xs text-slate-500">CampusFest · Challenge A</div></div>
        <Suspense><Nav /></Suspense>
      </aside>
      <CopilotDock>
          <div data-testid="shared-demo-banner" role="note" className="border-b border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">Shared demo — any visitor&apos;s edits are visible to others; use <b>Reset</b> to restore the original dataset.</div>
          <Suspense><TopBar rev={meta.data_revision} edits={meta.edits_since_reset} covStart={coverageStart(ds)} covEnd={coverageEnd(ds)} /></Suspense>
          <main className="min-w-0 p-4">{children}</main>
      </CopilotDock>
    </div>
  );
}
