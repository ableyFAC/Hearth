import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors (app)/account/notifications/page.tsx: the Notifications heading and
// its one-line intro, then NotificationPrefsForm - a single card holding one
// toggle row per channel above the save button.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <SkeletonLine width="w-3/4" />
      </div>

      <div className="card space-y-4 p-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
    </div>
  );
}
