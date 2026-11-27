import Link from 'next/link';
export default function NotFound() {
  return <div className="p-8 text-sm"><h1 className="text-lg font-semibold">Not found</h1><p className="mt-1 text-slate-600">That campaign or page does not exist.</p><Link className="mt-3 inline-block underline" href="/campaigns">Back to campaigns</Link></div>;
}
