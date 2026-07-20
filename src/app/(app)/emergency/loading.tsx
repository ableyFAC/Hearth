import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors emergency/page.tsx: heading, a stack of collapsed panic-flow bars,
// then the "Be ready before it happens" card with its 3-across prep grid.
export default function Loading() {
  return (
    <div className="space-y-8 pb-28" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <SkeletonLine width="w-full" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
      <div className="card space-y-4">
        <SkeletonLine width="w-56" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
