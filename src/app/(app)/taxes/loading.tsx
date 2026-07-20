import { Skeleton, SkeletonLine, SkeletonCard } from "@/components/Skeleton";

// Mirrors taxes/page.tsx: the max-w-3xl wrapper, header, and the setup card
// (centered explainer text) plus the assessment form beneath it.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8" aria-hidden="true">
      <Skeleton className="mb-1 h-7 w-48" />
      <SkeletonLine width="w-full" className="mb-5" />
      <div className="card space-y-2 text-center">
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-3/4 mx-auto" />
      </div>
      <SkeletonCard lines={3} className="mt-4" />
    </div>
  );
}
