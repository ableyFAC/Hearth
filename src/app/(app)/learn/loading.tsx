import { Skeleton, SkeletonLine, SkeletonCard, SkeletonRow } from "@/components/Skeleton";

// Mirrors learn/page.tsx: heading, the Ask Hearth block, and a few guide
// rows (each guide row has an icon, label, and a status chip - SkeletonRow's
// shape).
export default function Loading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-2/3" />
      </div>
      <SkeletonCard lines={3} />
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    </div>
  );
}
