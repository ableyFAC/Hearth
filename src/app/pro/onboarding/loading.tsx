import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors pro/onboarding/page.tsx, which renders the company-setup form in a
// max-w-3xl column: a heading and intro, the contact fields, the trade
// category picker, the service-area checkboxes, and the submit button.
export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl" aria-hidden="true">
      <div className="card space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-64" />
          <SkeletonLine width="w-3/4" />
        </div>

        {/* Company name, email, phone, license */}
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>

        {/* Trade category cards */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-40" />
          <div className="grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>

        {/* Service-area checkboxes */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>

        <Skeleton className="h-11 w-40 rounded-lg" />
      </div>
    </div>
  );
}
