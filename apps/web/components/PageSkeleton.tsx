export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Loading">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-20 rounded-lg bg-slate-100" />)}</div>
      <div className="h-64 rounded-lg bg-slate-100" />
    </div>
  );
}
