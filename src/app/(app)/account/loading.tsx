import { Skeleton, SkeletonLine, SkeletonCard } from "@/components/Skeleton";

// Shared loading shape for /account and its subpages (help, household,
// notifications, privacy, security) - every one of them opens with the
// AccountTabs header (title + subtitle) and its segmented tab switcher, then
// one or two settings cards. This single loading.tsx (nested nearest-boundary
// rules mean it applies to any of them that don't define their own) covers
// all without a bespoke skeleton per subpage.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-hidden="true">
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-40" />
          <SkeletonLine width="w-3/4" />
        </div>
        {/* Segmented tab switcher (Profile / Account security) */}
        <div className="inline-flex gap-1 rounded-xl border border-stone-200 bg-stone-100 p-1 dark:border-white/10 dark:bg-stone-800">
          <Skeleton className="h-7 w-20 rounded-lg" />
          <Skeleton className="h-7 w-32 rounded-lg" />
        </div>
      </div>
      <SkeletonCard lines={4} />
      <SkeletonCard lines={3} />
    </div>
  );
}
