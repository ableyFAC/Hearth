import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors (app)/account/household/page.tsx: the Household heading, the
// explainer card about what a member can do, then one card per home with its
// address, its member rows, and the invite-by-email form.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-36" />
        <SkeletonLine width="w-3/4" />
      </div>

      {/* What a household member can see and manage. */}
      <div className="card space-y-2 p-6">
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-5/6" />
        <SkeletonLine width="w-2/3" />
      </div>

      {/* A home you own: address, member rows, invite form. */}
      <div className="card space-y-4 p-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="divide-y divide-stone-100 dark:divide-white/10">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-16 shrink-0" />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 w-24 shrink-0 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
