import { Skeleton } from "@/components/Skeleton";

// Mirrors pro/chats/page.tsx: the Chats heading over the two-pane layout, a
// scrolling conversation list on the left and the open thread pane on the
// right (list only on phones, both from md up, same as the real page).
export default function Loading() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <Skeleton className="h-7 w-24" />

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        {/* Conversation list */}
        <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white dark:divide-white/10 dark:border-white/10 dark:bg-stone-800">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-10 shrink-0 rounded-full" />
              </div>
              <Skeleton className="h-3 w-3/4" />
            </div>
          ))}
        </div>

        {/* Thread pane: message bubbles above the composer. */}
        <div className="hidden h-[calc(100vh-13rem)] flex-col gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-white/10 dark:bg-stone-800 md:flex">
          <Skeleton className="h-5 w-40" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-12 w-2/3 rounded-xl" />
            <Skeleton className="ml-auto h-12 w-1/2 rounded-xl" />
            <Skeleton className="h-16 w-3/5 rounded-xl" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
