import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors taxes/page.tsx in its most common (not-yet-set-up) state: the
// max-w-3xl wrapper, header, the multi-line intro, the centered explainer
// card, then the open assessment form (heading, blurb, two-up input grid,
// submit).
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8" aria-hidden="true">
      <Skeleton className="mb-1 h-7 w-48" />
      <div className="mb-5 space-y-2">
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-2/3" />
      </div>
      <div className="space-y-4">
        <div className="card space-y-2 text-center">
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-3/4 mx-auto" />
        </div>
        <div className="card space-y-4">
          <Skeleton className="h-5 w-48" />
          <div className="space-y-2">
            <SkeletonLine width="w-full" />
            <SkeletonLine width="w-2/3" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
          </div>
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
