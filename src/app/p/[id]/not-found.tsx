// Branded 404 for public pro pages: an unknown slug or contractor id lands
// here (see notFound() in ./page.tsx). Styled to match NotReadyCard so both
// soft states of this route feel like the same page.
export default function ProNotFound() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm dark:border-white/10 dark:bg-stone-800">
        <div className="h-20 bg-gradient-to-br from-hearth-100 via-hearth-50 to-stone-100 dark:from-hearth-900/40 dark:via-stone-800 dark:to-stone-800" />
        <div className="px-6 pb-8 pt-2">
          <p className="text-3xl" aria-hidden>
            🏡
          </p>
          <h1 className="mt-3 text-xl font-semibold text-stone-900 dark:text-stone-100">
            This pro page has moved or expired
          </h1>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            The link may be out of date, or the pro may no longer be on
            Hearth.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-sm font-medium">
            <a href="/pros" className="text-hearth-700 hover:underline dark:text-hearth-300">
              For pros
            </a>
            <a href="/" className="text-hearth-700 hover:underline dark:text-hearth-300">
              Hearth home
            </a>
          </div>
        </div>
      </div>
      <a
        href="/pros"
        className="mt-6 inline-block text-sm font-medium text-hearth-700 hover:underline dark:text-hearth-300"
      >
        Powered by Hearth
      </a>
    </main>
  );
}
