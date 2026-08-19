import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors pro/playbook/page.tsx: the Playbook heading and one-line intro, then
// PlaybookGuides - a labelled search box over a stack of collapsed guide rows.
export default function Loading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <SkeletonLine width="w-3/4" />
      </div>

      <div className="space-y-4">
        {/* Search the playbook */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>

        {/* Collapsed guide rows */}
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card space-y-2">
              <Skeleton className="h-5 w-1/2" />
              <SkeletonLine width="w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
