import { Skeleton, SkeletonLine, SkeletonCard } from "@/components/Skeleton";

// Mirrors (app)/account/security/page.tsx: the AccountTabs header (title,
// subtitle, and the Profile / Account security switcher) over
// AccountSecurityPanel's cards - email, password, sessions, data export, and
// account deletion.
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

      {/* Email and password cards both carry a form. */}
      <div className="card space-y-3 p-6">
        <Skeleton className="h-5 w-32" />
        <SkeletonLine width="w-2/3" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="card space-y-3 p-6">
        <Skeleton className="h-5 w-28" />
        <SkeletonLine width="w-2/3" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      <SkeletonCard lines={3} className="p-6" />
      <SkeletonCard lines={3} className="p-6" />
      <SkeletonCard lines={4} className="p-6" />
    </div>
  );
}
