import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors contractors/page.tsx: heading, then the dominant "Post a job" form
// card (category/timing row, name/email/phone row, details textarea,
// photo+budget row, submit), then a couple of "Your jobs" list rows.
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-2/3" />
      </div>

      <div className="card space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>

      <div className="space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="card space-y-3">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-2/3" />
        </div>
        <div className="card space-y-3">
          <SkeletonLine width="w-1/3" />
          <SkeletonLine width="w-2/3" />
        </div>
      </div>
    </div>
  );
}
