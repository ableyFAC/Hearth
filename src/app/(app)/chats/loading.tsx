import { Skeleton } from "@/components/Skeleton";

// Mirrors chats/page.tsx: heading, then the two-pane grid - the conversation
// list (bordered, divided rows) on the left, the open-thread pane on the
// right (desktop only, matching the page's md:block).
export default function Loading() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-7 w-32" />
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-stone-800">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
        <div className="hidden rounded-xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-stone-800 md:block">
          <Skeleton className="h-[60vh] w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
