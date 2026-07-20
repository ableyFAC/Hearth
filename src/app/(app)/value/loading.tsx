import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors value/page.tsx: the max-w-3xl wrapper, header, the centered
// "estimated value today" hero (dominant block), the equity card, and the
// value-over-time bar chart card.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8" aria-hidden="true">
      <Skeleton className="mb-1 h-7 w-56" />
      <SkeletonLine width="w-full" className="mb-5" />

      <div className="card space-y-3 text-center">
        <Skeleton className="mx-auto h-4 w-40" />
        <Skeleton className="mx-auto h-10 w-48" />
        <Skeleton className="mx-auto h-3 w-56" />
      </div>

      <div className="card mt-6 space-y-2 text-center">
        <Skeleton className="mx-auto h-4 w-28" />
        <Skeleton className="mx-auto h-7 w-32" />
        <Skeleton className="mx-auto h-3 w-64" />
      </div>

      <div className="card mt-6 space-y-3">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-end gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`w-7 rounded-t-md ${i % 2 === 0 ? "h-16" : "h-10"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
