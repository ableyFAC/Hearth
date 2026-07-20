import { Skeleton, SkeletonLine, SkeletonCard, SkeletonRow } from "@/components/Skeleton";

// Mirrors issues/page.tsx: heading, the report-an-issue form card, then the
// "Open" list rows (the "Resolved" section is conditional and skipped here).
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <SkeletonLine width="w-64" />
      </div>
      <SkeletonCard lines={4} />
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
