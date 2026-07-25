// Maps a raw Supabase auth error to warm, human copy we can show a real user.
//
// Every auth flow (sign in, sign up, resend, reset, email/password change,
// sign-out-everywhere, delete account) used to fall back to the raw
// `error.message` from Supabase when it hit a case it didn't explicitly map.
// Those strings are lowercase, terse, and jargon-y ("Email rate limit
// exceeded", "For security purposes, you can only request this after 47
// seconds", "Signups not allowed for this instance"), and they leaked straight
// into the UI. This is the one place that turns them into copy that matches
// the app's plain, warm voice and never blames the user.
//
// Dependency-free on purpose: it accepts either the Supabase auth error object
// ({ message, status }) or a plain string, so every call site can pass whatever
// it already has. Unknown text never reaches the user - it falls through to a
// safe generic that says what to do next without surfacing internals.

type AuthErrorLike =
  | { message?: string | null; status?: number | null }
  | string
  | null
  | undefined;

export function friendlyAuthError(error: AuthErrorLike): string {
  const raw = typeof error === "string" ? error : error?.message ?? "";
  const m = raw.toLowerCase();

  // Wrong email/password on sign in. Points a brand-new visitor at sign-up.
  if (/invalid login credentials/.test(m)) {
    return "Email or password is incorrect. New here? Get started below.";
  }

  // Too many attempts in a short window (sign-in throttle, email send caps).
  if (/rate limit|too many requests|too many/.test(m)) {
    return "Too many tries just now. Wait about a minute, then try again.";
  }

  // "For security purposes, you can only request this after N seconds" - the
  // resend / reset-link cooldown. Keep it about the wait, not the number.
  if (/for security purposes|only request this after|after \d+ seconds/.test(m)) {
    return "You just asked for a link. Give it a minute before requesting another.";
  }

  // New password rejected for being the same as the current one.
  if (/should be different|different from the old|same as the old/.test(m)) {
    return "Pick a password you haven't used here before.";
  }

  // Weak / too-short password coming back from the server (the 6-char client
  // check was bypassed, or the project requires more).
  if (/password/.test(m) && /(6|short|weak|length|at least|characters)/.test(m)) {
    return "Password needs at least 6 characters.";
  }

  // Signing up with an email that already has an account.
  if (/already registered|already exists|already been registered|user already/.test(m)) {
    return "An account with this email already exists. Try signing in instead.";
  }

  // Email confirmation still pending for this account.
  if (/email not confirmed|not confirmed|confirm your email|email.*confirm/.test(m)) {
    return "Confirm your email first. Check your inbox for the link we sent.";
  }

  // Malformed email address (rarely reaches here since the field is type=email,
  // but a crafted submit can). Give the exact shape to aim for.
  if (/unable to validate email|invalid email|invalid format/.test(m)) {
    return "That email address doesn't look right. Use a format like name@example.com.";
  }

  // New sign-ups turned off at the project level.
  if (/signups? not allowed|signups? disabled|signup is disabled|disabled/.test(m)) {
    return "New sign-ups are paused right now. Please try again later.";
  }

  // The request never reached the server (offline, dropped connection).
  if (/failed to fetch|network|load failed|fetch failed|networkerror/.test(m)) {
    return "Couldn't reach Hearth just now. Check your connection and try again.";
  }

  // Anything we don't recognize: a warm generic that never echoes raw text.
  return "That didn't go through. Please try again in a moment.";
}
