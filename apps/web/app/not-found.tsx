import Link from 'next/link';
export default function NotFound() {
  return <div className="p-10 text-sm"><h1 className="text-lg font-semibold">Page not found</h1><Link className="mt-3 inline-block underline" href="/">Back to Overview</Link></div>;
}
