import { Skeleton, SkeletonLine } from "@/components/Skeleton";

// Mirrors join/household/[token]/page.tsx: the centered max-w-sm card. Its
// most common state (a signed-out scanner reaching the sign-in-or-sign-up
// chooser) is a heading, three lines of body text, and two full-width
// buttons.
export default function Loading() {
  return (
    <main
      className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6"
      aria-hidden="true"
    >
      <div className="card text-center">
        <Skeleton className="mx-auto h-7 w-40" />
        <div className="mt-2 space-y-2">
          <SkeletonLine width="w-full" className="mx-auto" />
          <SkeletonLine width="w-full" className="mx-auto" />
          <SkeletonLine width="w-3/4 mx-auto" />
        </div>
        <Skeleton className="mx-auto mt-6 h-11 w-full rounded-lg" />
        <Skeleton className="mx-auto mt-3 h-11 w-full rounded-lg" />
      </div>
    </main>
  );
}
