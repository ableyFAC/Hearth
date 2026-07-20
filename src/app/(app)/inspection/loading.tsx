import { Skeleton, SkeletonLine, SkeletonCard } from "@/components/Skeleton";

// Mirrors inspection/page.tsx: the max-w-2xl wrapper, header, and the two
// form cards (request an inspection, add an existing report).
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-3/4" />
      </div>
      <SkeletonCard lines={4} />
      <SkeletonCard lines={4} />
    </div>
  );
}
