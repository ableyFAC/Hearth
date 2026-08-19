import { Skeleton, SkeletonLine, SkeletonCard } from "@/components/Skeleton";

// Mirrors pro/business/page.tsx ("My Business"): the heading block, the three
// headline tiles (win rate, spend, cost per job won), the wallet hero, the
// collapsed account panel, the Insights section, and the pending-applications
// and jobs-won lists.
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <SkeletonLine width="w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>

      {/* Win rate, spent on applications, cost per job won */}
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Wallet snapshot with its Add funds button */}
      <div className="card-hero flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-10 w-32" />
          <Skeleton className="h-3 w-44" />
        </div>
        <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
      </div>

      {/* Collapsed account panel */}
      <Skeleton className="h-14 w-full rounded-xl" />

      {/* Insights: heading plus three tiles */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <div className="grid gap-4 sm:grid-cols-3">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>

      {/* Pending applications, then jobs won */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-52" />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <SkeletonCard lines={2} />
      </div>
    </div>
  );
}
