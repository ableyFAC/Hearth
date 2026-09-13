// The homeowner-preview switch, and the two copy strings every gated surface
// shows.
//
// WHAT PREVIEW MODE IS. Until the lawyer review lands, OakTend ships as a
// homeowner-only product: every homeowner feature is on and free, nothing
// anywhere can be paid for, and the contractor side is closed behind a
// "coming soon" page. When the review is done the whole thing flips back with
// one environment variable and a redeploy - there is no code change and no
// database change on the way back.
//
// NO "server-only" HERE, DELIBERATELY. Client components (the preview banner,
// the two native IAP screens) and vitest both import this, so it has to stay a
// plain module with no Node-only dependency. Everything that needs the admin
// client or a session lives in src/lib/previewModeServer.ts instead.
//
// NEXT_PUBLIC_, DELIBERATELY. A client component cannot read a private env
// var, and the banner and the native checkout screens are client components.
// The value is not a secret: it says "we are in preview", which every visitor
// can already see from the banner.
//
// READ AT CALL TIME, NOT AT MODULE LOAD. `const ON = process.env... === ...`
// at the top of this file would be evaluated once, when the module is first
// imported, which makes it impossible for a test to flip with vi.stubEnv and
// impossible for a dev server to pick up a changed .env.local without a
// restart. The function body re-reads the variable on every call; it is a
// string comparison, so the cost is nothing.
//
// EXACT-MATCH ON "homeowner", NOT A TRUTHINESS CHECK. `NEXT_PUBLIC_PREVIEW_MODE=false`
// or `=off` is a thing a person genuinely types when they mean "off", and a
// truthy check would read both as ON and close the contractor side of a live
// site. Only the one documented value turns this on; unset, empty, misspelled
// or anything else is normal behaviour.
export function isHomeownerPreview(): boolean {
  return process.env.NEXT_PUBLIC_PREVIEW_MODE === "homeowner";
}

// Shown wherever a membership, an upgrade, a trial or a checkout used to be.
// One constant rather than a literal per surface, so the answer a homeowner
// gets on /plus, in the profile menu, on the paywall banner and inside the
// native IAP screen is word-for-word the same.
export const PREVIEW_MEMBERSHIP_COPY =
  "Memberships are coming soon. Everything is free during our preview.";

// Shown wherever the contractor side used to be reachable.
export const PREVIEW_PROS_COPY = "Pros are coming soon.";

// The one message the pro waitlist form (src/app/pros/actions.ts) ever shows
// on its success path, whether the row was inserted, was already there, or was
// a bot's - it must never reveal whether an email was known. Lives here, not
// in the action file, because a "use server" module may export only async
// functions (the production build refuses a constant export).
export const PRO_WAITLIST_CONFIRMATION = "You're on the list.";
