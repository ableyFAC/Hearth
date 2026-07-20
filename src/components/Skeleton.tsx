// Shared loading-state primitives. Neutral stone tones with a plain
// animate-pulse only (no shimmer/gradient - the design bans both), matching
// the app's .card / stone token conventions so a skeleton reads as "this
// page, not yet loaded" rather than a foreign placeholder. Used by
// route-level loading.tsx files and by client components that fetch after
// mount.

// Base block. Compose with a className for size/shape (e.g. "h-4 w-1/3",
// "h-10 w-10 rounded-full").
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-stone-200 dark:bg-stone-700 ${className}`}
    />
  );
}

// A single text-line stub. width takes a Tailwind width class.
export function SkeletonLine({
  width = "w-full",
  className = "",
}: {
  width?: string;
  className?: string;
}) {
  return <Skeleton className={`h-4 ${width} ${className}`} />;
}

// A .card-shaped block with a heading line plus a few body lines, for
// standing in for a page's card sections while data loads.
export function SkeletonCard({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`card space-y-3 ${className}`} aria-hidden="true">
      <Skeleton className="h-5 w-1/3" />
      {Array.from({ length: Math.max(0, lines - 1) }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-4 ${i % 2 === 0 ? "w-2/3" : "w-1/2"}`}
        />
      ))}
    </div>
  );
}

// A list-row stub: avatar/icon chip, two text lines, and a trailing chip -
// the shape shared by contractor jobs, issues, chat threads, and similar
// lists.
export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-stone-800 ${className}`}
      aria-hidden="true"
    >
      <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
    </div>
  );
}
