import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Loading shape for /onboarding. Mirrors the real first render (page.tsx +
// OnboardingForm's "address" step): the centered title block, then the single
// .card holding a heading + subtitle, the bark value-bullets box, the street /
// ZIP field row, a helper line, and the submit button. Same container classes
// as the page so nothing jumps when the form takes over.
export default function Loading() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12"
      aria-hidden="true"
    >
      {/* Title block ("Let's set up your home") */}
      <div className="mb-6 flex flex-col items-center">
        <Skeleton className="h-7 w-56" />
      </div>

      <div className="card space-y-4">
        {/* Card heading + subtitle */}
        <div className="space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <SkeletonLine width="w-full" />
          <SkeletonLine width="w-4/5" />
        </div>

        {/* Value-bullets box (three benefit lines) */}
        <div className="space-y-2 rounded-lg bg-bark-50 p-3 dark:bg-bark-700/40">
          <SkeletonLine width="w-5/6" />
          <SkeletonLine width="w-3/4" />
          <SkeletonLine width="w-4/6" />
        </div>

        {/* Street (2/3) + ZIP (1/3) field row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </div>

        {/* Helper line */}
        <SkeletonLine width="w-3/4" />

        {/* Submit button */}
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </main>
  );
}
