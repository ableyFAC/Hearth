import { Skeleton } from "@/components/Skeleton";

// Mirrors forecast/page.tsx: the max-w-3xl wrapper, header, the centered
// "set aside per month" hero (dominant block), the "Start here" card, and
// the expected-spend-by-year bar chart card.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8" aria-hidden="true">
      <Skeleton className="mb-1 h-7 w-40" />
      <Skeleton className="mb-5 h-4 w-full" />

      <div className="card space-y-3 text-center">
        <Skeleton className="mx-auto h-4 w-56" />
        <Skeleton className="mx-auto h-9 w-64" />
        <Skeleton className="mx-auto h-3 w-40" />
      </div>

      <div className="card mt-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>

      <div className="card mt-6 space-y-3">
        <Skeleton className="h-4 w-48" />
        <div className="flex items-end gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`w-7 rounded-t-md ${
                i % 3 === 0 ? "h-20" : i % 3 === 1 ? "h-12" : "h-8"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
