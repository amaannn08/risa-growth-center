'use client';
export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto mt-10 max-w-md rounded-lg border border-red-200 bg-red-50 p-5 text-sm">
      <h1 className="font-semibold text-red-900">Something went wrong loading this page</h1>
      <p className="mt-1 text-red-800">The database may be waking up or temporarily unreachable. Your data is safe; try again.</p>
      {error.digest && <p className="mt-1 text-xs text-red-700">ref {error.digest}</p>}
      <button onClick={reset} className="mt-3 rounded bg-slate-900 px-3 py-1 text-white">Retry</button>
    </div>
  );
}
