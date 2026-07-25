import { Skeleton, SkeletonCard } from "@/components/Skeleton";

// Generic fallback for signed-in homeowner screens that don't ship their own
// loading.tsx. The app shell's <main> already provides the max-w-5xl
// container and padding, so this only paints a heading plus a couple of quiet
// placeholder cards - deliberately page-agnostic, since it stands in for many
// different routes rather than mirroring any single one.
export default function Loading() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Skeleton className="h-7 w-56" />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={2} />
    </div>
  );
}
