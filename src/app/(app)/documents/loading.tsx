import { Skeleton, SkeletonLine, SkeletonCard, SkeletonRow } from "@/components/Skeleton";

// Mirrors documents/page.tsx: the max-w-3xl wrapper, header, the upload card
// (a bordered box holding the dashed dropzone plus the take-photo button), a
// few document rows, then the insurance checkup card.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8 space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-3/4" />
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-800">
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="mt-2 h-10 w-full rounded-lg" />
      </div>
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
