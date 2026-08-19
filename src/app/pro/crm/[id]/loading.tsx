import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors pro/crm/[id]/page.tsx (one tracked client): the back link plus the
// client name, the "Contact and details" form card, the notes timeline card,
// and the danger zone card.
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-7 w-56" />
      </div>

      {/* Contact and details: a two-up grid of labelled fields plus Save. */}
      <div className="card space-y-3">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>

      {/* Notes: the add-note box, then the existing note rows. */}
      <div className="card space-y-4">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/10 dark:bg-stone-700"
            >
              <SkeletonLine width="w-3/4" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      <div className="card space-y-3">
        <Skeleton className="h-6 w-32" />
        <SkeletonLine width="w-2/3" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
    </div>
  );
}
