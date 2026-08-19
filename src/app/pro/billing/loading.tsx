import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors pro/billing/page.tsx: the Billing heading with its long pricing
// paragraph, the two balance tiles (lead credit hero + bonus credit), the
// "Add credit" deposit form with its tier buttons, and the activity ledger.
export default function Loading() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-28" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-5/6" />
        <SkeletonLine width="w-2/3" />
      </div>

      {/* Balances: lead credit, bonus credit */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card-hero space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-28" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="card space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3 w-40" />
        </div>
      </div>

      {/* Add credit: the deposit amount tiles and the checkout button. */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <div className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>

      {/* Activity ledger */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="h-5 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
