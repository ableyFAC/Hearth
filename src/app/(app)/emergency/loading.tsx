import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors emergency/page.tsx: heading with its two-line intro, the stack of
// six collapsed panic-flow bars (one per FLOWS entry), then the "Be ready
// before it happens" card with its 3-across prep grid.
export default function Loading() {
  return (
    <div className="space-y-8 pb-28" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-2/3" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
      <div className="card space-y-4">
        <div className="space-y-2">
          <SkeletonLine width="w-56" />
          <SkeletonLine width="w-full" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
