import Link from "next/link";

// Notice at collection (Cal. Civ. Code 1798.100(a), 11 CCR 7012): at or before
// the point where personal information is collected, say what is being
// collected, what it will be used for, how long it's kept, and whether it's
// sold or shared - with a link to the full policy for the detail.
//
// Deliberately small and factual. This is not marketing copy and it is not the
// Terms line that already sits under the sign-up button (that one is about
// agreement; this one is about disclosure - they are different obligations and
// both render).
//
// Callers pass the two lines that actually differ by surface. Everything else
// - the no-sale statement, the retention line, the policy link - is identical
// everywhere by design, because it's identical in fact.
export default function NoticeAtCollection({
  collects,
  purpose,
  // Set when this surface gathers something in the CPRA's "sensitive personal
  // information" category, so the heightened use limit gets stated where the
  // data is actually handed over rather than only in the policy.
  sensitive,
}: {
  collects: string;
  purpose: string;
  sensitive?: string;
}) {
  // Collapsed by default so it doesn't clutter the sign-up form: the summary is
  // a single clickable line, and the full disclosure (categories, purpose,
  // no-sale, retention, policy link) sits one click away on the same page. A
  // link/disclosure to the notice satisfies 11 CCR 7012; keeping the detail
  // in-page rather than only on /privacy keeps it "at or before" collection.
  return (
    <details className="group text-xs leading-relaxed text-stone-600 dark:text-stone-400">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-hearth-700 hover:underline dark:text-hearth-300 [&::-webkit-details-marker]:hidden">
        What we collect here and why
        <span aria-hidden className="text-stone-400 transition-transform group-open:rotate-180 dark:text-stone-500">
          &#9662;
        </span>
      </summary>
      <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/10 dark:bg-stone-800/60">
        <p>
          {collects} We use it to {purpose}
        </p>
        {sensitive && <p className="mt-1">{sensitive}</p>}
        <p className="mt-1">
          We do not sell your personal information or share it for advertising.
          We keep it while your account is open and delete it when you close
          your account.{" "}
          <Link
            href="/privacy"
            className="font-medium text-hearth-700 hover:underline dark:text-hearth-300"
          >
            Privacy Policy
          </Link>
        </p>
      </div>
    </details>
  );
}
