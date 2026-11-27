'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { BarChart3, Bot, Database, Gauge, KanbanSquare, Layers, Target } from 'lucide-react';

const ITEMS = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/campaigns', label: 'Campaigns', icon: Layers },
  { href: '/diagnose', label: 'Diagnose', icon: BarChart3 },
  { href: '/strategy', label: 'Strategy', icon: Target },
  { href: '/execution', label: 'Execution', icon: KanbanSquare },
  { href: '/data', label: 'Data', icon: Database },
  { href: '/copilot', label: 'Copilot', icon: Bot },
];

export function Nav() {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ['asOf', 'attr']) if (sp.get(k)) keep.set(k, sp.get(k)!);
  const suffix = keep.toString() ? `?${keep}` : '';
  return (
    <nav className="flex flex-col gap-0.5 p-2" aria-label="Main">
      {ITEMS.map(({ href, label, icon: I }) => {
        const active = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link key={href} href={`${href}${suffix}`} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
            <I className="size-4" />{label}
          </Link>
        );
      })}
    </nav>
  );
}
