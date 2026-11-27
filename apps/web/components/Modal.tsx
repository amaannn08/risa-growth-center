'use client';
import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div role="dialog" aria-label={title} className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`h-full overflow-y-auto bg-white p-5 shadow-xl ${wide ? 'w-[560px]' : 'w-[420px]'}`}>
        <div className="mb-3 flex items-center"><h2 className="font-semibold">{title}</h2><button aria-label="Close" onClick={onClose} className="ml-auto rounded p-1 hover:bg-slate-100"><X className="size-4" /></button></div>
        {children}
      </div>
    </div>
  );
}

export const inputCls = 'h-8 w-full rounded border px-2 text-sm';
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="mb-2 block text-xs text-slate-600">{label}<div className="mt-0.5">{children}</div>{hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}</label>;
}
