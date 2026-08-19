import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors pro/tools/page.tsx (AI back office) in its max-w-2xl column: the
// centered heading and subtitle, one wide panel (the member tool workbench, or
// the membership notice for everyone else), the stacked tool cards, and the
// small footnote that closes the page.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-hidden="true">
      <div className="flex flex-col items-center space-y-2">
        <Skeleton className="h-7 w-52" />
        <SkeletonLine width="w-3/4" />
      </div>

      {/* Tool workbench / membership panel */}
      <div className="card space-y-3">
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-10 w-40 rounded-lg" />
      </div>

      {/* Estimate builder, invoice writer, follow-up writer */}
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card flex items-start gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-40" />
              <SkeletonLine width="w-full" />
              <SkeletonLine width="w-2/3" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center">
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}
