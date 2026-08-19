import { Skeleton, SkeletonLine, SkeletonCard } from "@/components/Skeleton";

// Mirrors (app)/account/privacy/page.tsx, which renders PrivacyRightsPanel on
// its own (no AccountTabs header): a title over a stack of mostly-text cards,
// one per privacy right, ending with the contact card.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <SkeletonLine width="w-3/4" />
      </div>

      {Array.from({ length: 5 }).map((_, i) => (
        <SkeletonCard key={i} lines={4} className="p-6" />
      ))}
    </div>
  );
}
