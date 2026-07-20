import { Skeleton, SkeletonLine, SkeletonCard } from "@/components/Skeleton";

// Shared loading shape for /account and its subpages (help, household,
// notifications, privacy, security) - every one of them is a max-w-2xl
// header plus one or two settings cards, so this single loading.tsx (nested
// nearest-boundary rules mean it applies to any of them that don't define
// their own) covers all without a bespoke skeleton per subpage.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <SkeletonLine width="w-full" />
      </div>
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} />
    </div>
  );
}
