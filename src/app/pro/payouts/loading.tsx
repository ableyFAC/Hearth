import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors pro/payouts/page.tsx: the heading block, one status card (heading,
// a line or two, a button), and the "Back to My Business" link. Deliberately
// the same height whichever status renders - every branch of that card is a
// heading plus a line plus one control.
export default function Loading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <SkeletonLine width="w-1/2" />
      </div>

      {/* The status card */}
      <div className="card space-y-3">
        <Skeleton className="h-5 w-56" />
        <SkeletonLine width="w-3/4" />
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-3 w-2/3" />
      </div>

      <Skeleton className="h-4 w-40" />
    </div>
  );
}
