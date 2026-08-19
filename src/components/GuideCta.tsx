import Link from "next/link";
import { getVerifiedUser } from "@/lib/auth";

// Shared closing CTA for the public /guides pages. Every guide page ends with
// the same pitch: the ranges above are national/typical, Hearth's answer is
// specific to the visitor's own home, and it's free to get. Keep this in
// lockstep across all guide pages rather than letting each page drift.
//
// Session-aware: a signed-in visitor with an account has already gotten
// past this pitch, so repeating "get started free" reads as a bug, not a
// nudge.
//
// This component used to answer that question with its own
// supabase.auth.getUser() call, under a comment claiming it "adds no new
// rendering cost". That was wrong twice over: an auth round trip is a real
// network hop, and it was the SECOND one in the same render, because
// src/app/guides/layout.tsx had already asked the identical question before
// rendering these children (the middleware made three). The answer now comes
// from a caller that already has it, or failing that from getVerifiedUser(),
// which is request-cached, so the guides layout's lookup and this one are the
// same single round trip rather than two sequential ones.
//
// signedIn: pass it when the calling tree already knows (a page that fetched
// the visitor for its own reasons). Left undefined, the request-cached lookup
// resolves it, which is what the /guides pages rely on: a layout cannot hand
// props to a page's descendants in the App Router, so the layout and this
// component share the cache instead of a prop.
//
// signedInHref/signedInLabel let a page point a signed-in reader at the
// in-app screen that answers the same question for their own home; callers
// that don't pass them get a sensible dashboard default.
export default async function GuideCta({
  signedIn,
  signedInHref = "/dashboard",
  signedInLabel = "See this for your home",
}: {
  signedIn?: boolean;
  signedInHref?: string;
  signedInLabel?: string;
}) {
  const isSignedIn = signedIn ?? (await getVerifiedUser()) !== null;

  if (isSignedIn) {
    return (
      <section className="mt-12 rounded-2xl border border-bark-100 bg-bark-50 p-6 text-center shadow-sm dark:border-bark-700 dark:bg-bark-700/20">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          See this for YOUR home
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-stone-600 dark:text-stone-300">
          Everything above is a general, national range. Hearth already
          knows your home&apos;s actual age, size, and systems.
        </p>
        <Link
          href={signedInHref}
          className="btn-primary mt-5 inline-block px-6 py-2.5"
        >
          {signedInLabel}
        </Link>
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
      <Link
        href="/homeowner-signup"
        className="btn-primary mt-5 inline-block px-6 py-2.5"
      >
        Get started free
      </Link>
    </section>
  );
}
