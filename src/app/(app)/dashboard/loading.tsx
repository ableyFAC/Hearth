import { Skeleton, SkeletonLine, SkeletonCard, SkeletonRow } from "@/components/Skeleton";

// Mirrors dashboard/page.tsx: address header, the 4-tile stats grid (health
// score tile first, given an extra line since its card-hero has a "why this
// score" disclosure the other three don't), the "This month" card, the Plus
// CTA + 3-tile tools grid, a few system rows, and the project-chip row.
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden="true">
      {/* Property header: address, the built/sqft/beds line, and the quiet
          "something broken right now?" link. */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <SkeletonLine width="w-56" />
        <SkeletonLine width="w-40" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card space-y-2">
          <SkeletonLine width="w-28" />
          <Skeleton className="h-9 w-16" />
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-2/3" />
        </div>
        <div className="card space-y-2">
          <SkeletonLine width="w-20" />
          <Skeleton className="h-6 w-24" />
          <SkeletonLine width="w-3/4" />
        </div>
        <div className="card space-y-2">
          <SkeletonLine width="w-20" />
          <Skeleton className="h-6 w-24" />
          <SkeletonLine width="w-3/4" />
        </div>
        <div className="card space-y-2">
          <SkeletonLine width="w-28" />
          <Skeleton className="h-6 w-24" />
          <SkeletonLine width="w-3/4" />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <SkeletonCard lines={5} />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-52" />
        <SkeletonCard lines={2} />
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>

      {/* Thinking about a project? heading, one-line intro, then the
          remodel-project chip row. */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-56" />
        <SkeletonLine width="w-2/3" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
