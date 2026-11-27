import './globals.css';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/sonner';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata = { title: 'RISA Growth Center' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn('font-sans', geist.variable)}>
      <body className="bg-white text-slate-900 antialiased">{children}<Toaster richColors position="bottom-right" /></body>
    </html>
  );
}
