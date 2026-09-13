// Server half of the homeowner-preview switch (src/lib/previewMode.ts holds
// the flag and the copy, and stays client-safe).
//
// WHY IT IS A SEPARATE FILE. Everything here needs a session or the admin
// client, so it carries "server-only" and can never be pulled into a client
// bundle. previewMode.ts must NOT carry that marker - PreviewNotice.tsx and
// the two native checkout screens are client components that import the copy
// constants from it.
import "server-only";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth";
import { isInternalUser } from "@/lib/internalAccounts";
import { setFlash } from "@/lib/flash";
import {
  isHomeownerPreview,
  PREVIEW_MEMBERSHIP_COPY,
  PREVIEW_PROS_COPY,
} from "@/lib/previewMode";

// May the CURRENT viewer use the contractor side at all?
//
// Outside preview this is always true and costs nothing - the flag is checked
// first, so no session read and no database round trip happens on a normal
// deploy. That is what keeps C4 ("flag off = byte-identical behaviour") true
// for every pro action this guards.
//
// Inside preview it is true only for an OakTend team / test account
// (users.is_internal, migration 0165, read through src/lib/internalAccounts.ts).
// The team has to be able to walk the whole contractor flow end to end while
// the public side is shut.
//
// FAILS CLOSED, and that is the opposite posture from isInternalUser()'s own
// callers. isInternalUser() answers `false` on a missing column, a read error
// or a thrown client, because ITS other callers are best-effort display
// filters where "nobody is internal" is today's behaviour. Here, `false` means
// "not internal" means "blocked", so the same failure keeps a real pro out
// rather than letting one in. That is the direction this gate must fail: the
// cost of a false block is an OakTend employee waiting for a database blip to
// pass; the cost of a false pass is a real contractor signing up into a
// product we have told the lawyer is closed.
//
// getVerifiedUser(), not getUser(): getUser() reads the id straight off the
// session cookie, and this decides whether the pro side opens. Both are
// React-cached per request, so a pro action that already awaited one pays
// nothing extra here.
export async function isProSideOpenForViewer(): Promise<boolean> {
  if (!isHomeownerPreview()) return true;
  const user = await getVerifiedUser();
  if (!user) return false;
  return isInternalUser(user.id);
}

// Server-action guard. Call it as the FIRST statement of any pro-side action
// that mutates data (applying to a lead, unlocking a direct request, taking a
// deposit, starting a checkout, saving a company): the pro shell already
// renders ProsComingSoon instead of the app for a blocked pro, but a "use
// server" action is a public POST endpoint and is reachable without ever
// rendering that shell.
//
// Redirects rather than throwing. Next masks a thrown Error in production as
// the generic "Something went sideways" boundary, which would tell a blocked
// pro nothing; a flash plus a bounce to /pro lands them on the shell, which
// renders the coming-soon page with the real message. redirect() throws to
// unwind the action, so nothing after this call runs on the blocked path -
// same contract every other redirect() guard in the repo has.
export async function assertProSideOpen(): Promise<void> {
  if (await isProSideOpenForViewer()) return;
  await setFlash(PREVIEW_PROS_COPY, "info");
  redirect("/pro");
}

// Money guard. "Is this deploy refusing to move money right now?" - and if it
// is, queue the coming-soon toast so the caller only has to redirect.
//
// APPLIES TO EVERYONE, INTERNAL ACCOUNTS INCLUDED, which is the one place this
// file deliberately does NOT carve out the team. A4 is not about who is
// trusted, it is about the product not charging anybody a cent while the
// lawyer review is open, and an OakTend card is still a real charge on a real
// Stripe account. The team tests the money paths in Stripe test mode with the
// flag off, not in preview.
//
// USE IT AS THE FIRST STATEMENT of an action that would otherwise reach
// Stripe, before any import or property access on the stripe client - the
// structural backstop in src/lib/stripe.ts throws in preview, and a throw
// reaches the person as Next's generic error boundary, which tells them
// nothing. This is the branch that produces a sentence they can read.
//
// Returns a boolean rather than redirecting itself, because the right landing
// page differs per action (/plus, /pro/plus, /pro/billing, /pro/payouts) and a
// couple of the callers return a value instead of redirecting at all.
export async function previewBlocksMoney(): Promise<boolean> {
  if (!isHomeownerPreview()) return false;
  await setFlash(PREVIEW_MEMBERSHIP_COPY, "info");
  return true;
}
