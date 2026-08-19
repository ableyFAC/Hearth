import { Skeleton, SkeletonLine, SkeletonCard } from "@/components/Skeleton";

// Mirrors pro/profile/page.tsx, which renders ProfileTabs inside a max-w-4xl
// column: the tab title and subtitle, the four-tab switcher (Public Profile /
// Your Public Page / Projects / Account Security), then the cards of whichever
// tab is open, which always start with a long form card.
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <SkeletonLine width="w-3/4" />
      </div>

      {/* Tab switcher */}
      <div className="flex flex-wrap gap-2">
        {["w-28", "w-32", "w-20", "w-36"].map((w) => (
          <Skeleton key={w} className={`h-9 ${w} rounded-lg`} />
        ))}
      </div>

      {/* Public Profile form card: the tab that opens by default. */}
      <div className="card space-y-3">
        <Skeleton className="h-6 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      <SkeletonCard lines={3} />
    </div>
  );
}
