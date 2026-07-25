import { Skeleton } from "@/components/Skeleton";

// Mirrors search/page.tsx: heading + search input, then a couple of bordered,
// divided result groups (a small uppercase group label above each, with an
// icon + two lines per row and no trailing chip - the real rows have none
// either).
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6" aria-hidden="true">
      <div className="space-y-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
      {Array.from({ length: 2 }).map((_, g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-3 w-16" />
          <div className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-stone-800">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-5 w-5 rounded" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
