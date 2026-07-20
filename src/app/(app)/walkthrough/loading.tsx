import { Skeleton, SkeletonLine, SkeletonCard, SkeletonRow } from "@/components/Skeleton";

// Mirrors walkthrough/page.tsx: heading, the inline health-score chip, the
// "To confirm" capture cards, and the "Confirmed" list rows.
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-2/3" />
      </div>
      <div className="card inline-flex items-center gap-4">
        <Skeleton className="h-9 w-14" />
        <SkeletonLine width="w-32" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <SkeletonCard lines={3} />
        <SkeletonCard lines={3} />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-5 w-40" />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
