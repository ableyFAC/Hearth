import { Skeleton, SkeletonLine, SkeletonCard } from "@/components/Skeleton";

// Mirrors (app)/account/help/page.tsx, which has its own heading rather than
// the AccountTabs header the parent account skeleton assumes: the Help title,
// the FAQ card of collapsed question rows, the support form, and the small
// "Found a bug?" card.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-24" />
        <SkeletonLine width="w-2/3" />
      </div>

      {/* Frequently asked questions: one collapsed summary line each. */}
      <div className="card space-y-3">
        <Skeleton className="h-5 w-56" />
        <div className="divide-y divide-stone-100 dark:divide-white/10">
          {["w-3/4", "w-2/3", "w-1/2", "w-5/6", "w-3/5", "w-2/3", "w-3/4"].map(
            (w, i) => (
              <div key={i} className="py-3">
                <Skeleton className={`h-4 ${w}`} />
              </div>
            )
          )}
        </div>
      </div>

      {/* Support form: a few fields and a message box. */}
      <div className="card space-y-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      <SkeletonCard lines={3} />
    </div>
  );
}
