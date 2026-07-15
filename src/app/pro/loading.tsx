// Skeleton for contractor screens while server data loads. The pro shell's
// <main> already provides the max-w-5xl container, so this only paints quiet
// placeholder cards.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden="true">
      {/* Page heading */}
      <div className="h-7 w-56 rounded bg-stone-200 dark:bg-stone-800" />
      <div className="card space-y-3">
        <div className="h-5 w-1/3 rounded bg-stone-200 dark:bg-stone-800" />
        <div className="h-4 w-2/3 rounded bg-stone-200 dark:bg-stone-800" />
        <div className="h-4 w-1/2 rounded bg-stone-200 dark:bg-stone-800" />
      </div>
      <div className="card space-y-3">
        <div className="h-5 w-1/4 rounded bg-stone-200 dark:bg-stone-800" />
        <div className="h-4 w-3/4 rounded bg-stone-200 dark:bg-stone-800" />
      </div>
      <div className="card space-y-3">
        <div className="h-5 w-1/3 rounded bg-stone-200 dark:bg-stone-800" />
        <div className="h-4 w-1/2 rounded bg-stone-200 dark:bg-stone-800" />
      </div>
    </div>
  );
}
