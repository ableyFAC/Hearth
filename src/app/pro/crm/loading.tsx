import { Skeleton, SkeletonLine, SkeletonCard, SkeletonRow } from "@/components/Skeleton";

// Mirrors pro/crm/page.tsx (the client pipeline). The pro shell's <main>
// already supplies the container, so this paints the page body: the Clients
// heading, the four stage tiles, the search form, the "Add a client" card, the
// grouped client list, and the "More with Pro" upgrade grid.
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <SkeletonLine width="w-3/4" />
      </div>

      {/* Stage tiles: Lead / Quoted / Won / Lost */}
      <div className="grid gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-10" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Search by client name */}
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-24 shrink-0 rounded-lg" />
      </div>

      {/* Add a client form */}
      <div className="card space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Your clients, grouped by stage */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>

      {/* More with Pro */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-44" />
        <div className="grid gap-4 sm:grid-cols-2">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    </div>
  );
}
