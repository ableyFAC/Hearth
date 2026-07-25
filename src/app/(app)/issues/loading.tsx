import { Skeleton, SkeletonLine, SkeletonRow } from "@/components/Skeleton";

// Mirrors issues/page.tsx: heading, then the collapsed "+ Report an issue"
// button (IssueForm only expands into a card once tapped, so the initial
// above-the-fold state is just that button), then the "Open" list rows (the
// "Resolved" section is conditional and skipped here).
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <SkeletonLine width="w-64" />
      </div>
      <Skeleton className="h-11 w-40 rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
