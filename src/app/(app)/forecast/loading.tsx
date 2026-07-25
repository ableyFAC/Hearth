import { Skeleton } from "@/components/Skeleton";

// Mirrors forecast/page.tsx once a forecast exists: the max-w-3xl wrapper,
// header, the centered card-hero "set aside per month" block (the dominant
// element), the Ask Hearth plan button, the "Start here" card, and the
// expected-spend-by-year bar chart card.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8" aria-hidden="true">
      <Skeleton className="mb-1 h-7 w-40" />
      <Skeleton className="mb-5 h-4 w-full" />

      <div className="card-hero space-y-2 text-center">
        <Skeleton className="mx-auto h-4 w-56" />
        <Skeleton className="mx-auto h-9 w-64" />
        <Skeleton className="mx-auto h-3 w-40" />
        <Skeleton className="mx-auto h-3 w-52" />
      </div>

      <div className="mt-4 flex justify-center">
        <Skeleton className="h-10 w-48 rounded-lg" />
      </div>

      <div className="card mt-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 p-3 dark:border-white/10">
            <div className="flex items-start gap-2">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-7 w-20 shrink-0 rounded-lg" />
          </div>
          <div className="flex items-start justify-between gap-3 rounded-lg border border-stone-200 p-3 dark:border-white/10">
            <div className="flex items-start gap-2">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-7 w-20 shrink-0 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="card mt-6 space-y-3">
        <Skeleton className="h-4 w-48" />
        <div className="overflow-x-auto pb-1">
          <div className="flex items-end gap-2 border-b border-stone-200 dark:border-stone-700">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="flex min-w-[2.5rem] flex-col items-center justify-end gap-1"
              >
                <Skeleton className="h-2 w-8" />
                <Skeleton
                  className={`w-7 rounded-t-md ${
                    i % 3 === 0 ? "h-20" : i % 3 === 1 ? "h-12" : "h-8"
                  }`}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-3 min-w-[2.5rem]" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
