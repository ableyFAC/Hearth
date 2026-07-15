// Shared open-redirect guard for ?next=: only ever follow a RELATIVE path.
// An absolute URL (or a protocol-relative //host) in that param would be an
// open redirect an attacker could use to bounce a signed-in victim to a
// look-alike site. Used everywhere ?next= is read across the sign-in and
// sign-up funnel (src/app/signin, /get-started, /homeowner-signup,
// /contractor-signup, /onboarding, /auth/callback, /auth/confirm) so the
// rule can't drift between them.
export function safeNextPath(value: string | null | undefined): string | null {
  // No backslashes anywhere: browsers normalize "/\evil.com" to
  // "//evil.com", which would sneak an absolute URL past the "//" check.
  if (
    value &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  ) {
    return value;
  }
  return null;
}
