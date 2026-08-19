import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors (app)/quote-check/page.tsx in its max-w-2xl column: the "Quote
// analyzer" header with its long explainer paragraph, then the QuoteAnalyzer
// card - an upload dropzone, a paste-the-text box, and the analyze button.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <SkeletonLine width="w-full" />
        <SkeletonLine width="w-5/6" />
        <SkeletonLine width="w-2/3" />
      </div>

      <div className="card space-y-4">
        {/* Photo dropzone */}
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-px flex-1" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-px flex-1" />
        </div>
        {/* Paste the quote text */}
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-11 w-full rounded-lg" />
      </div>
    </div>
  );
}
