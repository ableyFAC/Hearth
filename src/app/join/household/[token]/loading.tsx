import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors join/household/[token]/page.tsx: the centered max-w-sm card both
// its signed-out chooser and its redeem-result states share (heading, two
// lines of body text, one full-width button).
export default function Loading() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6"
      aria-hidden="true"
    >
      <div className="card space-y-3 text-center">
        <Skeleton className="mx-auto h-7 w-40" />
        <SkeletonLine width="w-full" className="mx-auto" />
        <SkeletonLine width="w-3/4" className="mx-auto" />
        <Skeleton className="mx-auto mt-3 h-11 w-full rounded-lg" />
      </div>
    </main>
  );
}
