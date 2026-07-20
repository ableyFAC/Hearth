import { createClient } from "@/lib/supabase/server";

// Shared closing CTA for the public /guides pages. Every guide page ends with
// the same pitch: the ranges above are national/typical, Hearth's answer is
// specific to the visitor's own home, and it's free to get. Keep this in
// lockstep across all guide pages rather than letting each page drift.
//
// Session-aware: a signed-in visitor with an account has already gotten
// past this pitch, so repeating "get started free" reads as a bug, not a
// nudge. These pages are already dynamically rendered (the root layout reads
// cookies for auth), so checking auth.getUser() here adds no new rendering
// cost. signedInHref/signedInLabel let a page point a signed-in reader at
// the in-app screen that answers the same question for their own home;
// callers that don't pass them get a sensible dashboard default.
export default async function GuideCta({
  signedInHref = "/dashboard",
  signedInLabel = "See this for your home",
}: {
  signedInHref?: string;
  signedInLabel?: string;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return (
      <section className="mt-12 rounded-2xl border border-bark-100 bg-bark-50 p-6 text-center shadow-sm dark:border-bark-700 dark:bg-bark-700/20">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          See this for YOUR home
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-300">
          Everything above is a general, national range. Hearth already
          knows your home&apos;s actual age, size, and systems.
        </p>
        <a
          href={signedInHref}
          className="btn-primary mt-5 inline-block px-6 py-2.5"
        >
          {signedInLabel}
        </a>
      </section>
    );
  }

  return (
    <section className="mt-12 rounded-2xl border border-bark-100 bg-bark-50 p-6 text-center shadow-sm dark:border-bark-700 dark:bg-bark-700/20">
      <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
        Get the answer for YOUR home
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-300">
        Everything above is a general, national range. Hearth knows your
        home&apos;s actual age, size, and systems, and turns that into a
        house-specific answer, free.
      </p>
      <a
        href="/homeowner-signup"
        className="btn-primary mt-5 inline-block px-6 py-2.5"
      >
        Get started free
      </a>
    </section>
  );
}
