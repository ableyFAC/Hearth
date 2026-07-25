import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors walkthrough/page.tsx: heading, the card-hero health-score chip, the
// "To confirm" capture cards (data-plate drop zone + camera button), and the
// "Confirmed" single-line card rows.
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-2/3" />
      </div>

      <div className="card-hero inline-flex items-center gap-4">
        <div className="space-y-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-12" />
        </div>
        <Skeleton className="h-4 w-24" />
      </div>

      <section className="space-y-3">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="card space-y-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-3 w-48" />
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="card flex flex-wrap items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        ))}
      </section>
    </div>
  );
}
