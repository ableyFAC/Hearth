import { Skeleton, SkeletonLine, SkeletonRow } from "@/components/Skeleton";

// Mirrors home-report/page.tsx: the max-w-3xl wrapper, the bordered header
// block, then the systems / documents / maintenance-history sections, each
// a heading followed by a couple of rows.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-8" aria-hidden="true">
      <div className="space-y-2 border-b border-stone-200 pb-6 dark:border-stone-700">
        <Skeleton className="h-8 w-48" />
        <SkeletonLine width="w-64" />
        <SkeletonLine width="w-56" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-32" />
        <SkeletonRow />
        <SkeletonRow />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <SkeletonRow />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
