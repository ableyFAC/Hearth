import { Skeleton, SkeletonLine, SkeletonCard, SkeletonRow } from "@/components/Skeleton";

// Mirrors documents/page.tsx: the max-w-3xl wrapper, header, the upload
// dropzone, a few document rows, then the insurance checkup card.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-3/4" />
      </div>
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="space-y-3">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );
}
