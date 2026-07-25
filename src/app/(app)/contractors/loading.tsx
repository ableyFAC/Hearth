import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors contractors/page.tsx: heading, then the dominant "Post a job" form
// card (category/timing row, name/email/phone row, details textarea,
// photo+budget row, submit, privacy note), then a couple of "Your jobs" list
// rows. Each field shows a short label stub above its input, matching the
// real labelled controls.
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
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-24 w-full rounded-lg" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
        </div>
        <Skeleton className="h-11 w-32 rounded-lg" />
        <SkeletonLine width="w-2/3" />
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
