'use client';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, X } from 'lucide-react';
import { ChatView } from './ChatView';

const KEY = 'gc.copilot.open', WKEY = 'gc.copilot.w';

/** Persistent right-side Copilot panel on desktop (resizable); a full-screen sheet below the md breakpoint. Open state persisted. Hidden on /copilot (full page) and /slides. */
export function CopilotDock({ children }: { children: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false), [w, setW] = useState(400);
  const drag = useRef(false);
  useEffect(() => { setOpen(localStorage.getItem(KEY) === '1'); const s = Number(localStorage.getItem(WKEY)); if (s >= 320 && s <= 800) setW(s); }, []);
  useEffect(() => {
    const mv = (e: MouseEvent) => { if (drag.current) setW(Math.min(800, Math.max(320, window.innerWidth - e.clientX))); };
    const up = () => { if (drag.current) { drag.current = false; localStorage.setItem(WKEY, String(w)); } };
    window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
  }, [w]);
  const toggle = (v: boolean) => { setOpen(v); localStorage.setItem(KEY, v ? '1' : '0'); };
  const full = path.startsWith('/copilot');
  return (
    <>
      <div className="min-w-0 flex-1">{children}</div>
      {!full && !open && <button data-testid="copilot-toggle" onClick={() => toggle(true)} className="fixed bottom-4 right-4 z-40 flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg"><Bot className="size-4" />Ask Copilot</button>}
      {!full && open && (
        <aside data-testid="copilot-panel" style={{ '--copilot-w': `${w}px` } as React.CSSProperties} className="fixed inset-0 z-50 flex h-dvh w-full flex-col border-l bg-white md:sticky md:inset-auto md:top-0 md:z-auto md:h-screen md:w-[var(--copilot-w)] md:shrink-0">
          <div onMouseDown={() => (drag.current = true)} className="absolute inset-y-0 -left-1 hidden w-2 cursor-col-resize md:block" aria-hidden />
          <div className="flex shrink-0 items-center gap-1.5 border-b px-3 py-2 text-sm font-semibold"><Bot className="size-4" />Copilot<button aria-label="Close Copilot" onClick={() => toggle(false)} className="ml-auto rounded p-1 hover:bg-slate-100"><X className="size-4" /></button></div>
          <div className="min-h-0 flex-1"><Suspense><ChatView compact /></Suspense></div>
        </aside>
      )}
    </>
  );
}
