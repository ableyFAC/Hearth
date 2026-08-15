import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// The authenticated user, cached for the duration of a single server request.
// Uses getSession() (reads the validated session from the cookie, no network
// round-trip) instead of getUser() (which calls Supabase's auth server every
// time). The middleware already validates the session with getUser() on each
// request, and the database enforces real auth via RLS, so this is safe and
// much faster. React's cache() also dedupes it to once per render.
export const getUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
});

export interface PasswordStatus {
  // False only when we're confident the account has no password at all: an
  // account created through Google (or any other OAuth provider) starts that
  // way, so the "change your password" form would be a dead end for them.
  hasPassword: boolean;
  // The OAuth provider they actually signed up with ("google"), so the copy
  // can name it instead of guessing. Null when there isn't one.
  provider: string | null;
}

// Turn a raw provider slug into something we can put in a sentence.
const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  azure: "Microsoft",
  facebook: "Facebook",
  github: "GitHub",
};

export function providerLabel(provider: string | null): string {
  if (!provider) return "another service";
  return PROVIDER_LABELS[provider] ?? provider;
}

// Whether the signed-in account can sign in with a password today.
//
// Supabase keeps one identity row per sign-in method, so an account created
// with Google has a "google" identity and no "email" one. That's the signal -
// never the email domain, which says nothing about how someone signed up
// (plenty of password accounts use gmail.com, and Google Workspace accounts
// sign in with custom domains).
//
// Callers pass a user from supabase.auth.getUser(), never from getUser() above:
// this has to be live. getUser() reads the user object that was baked into the
// session cookie at sign-in time, so someone who just set a password would
// keep seeing the "you have no password" block until their session refreshed.
//
// The user_metadata.password_set fallback covers a real Supabase quirk: when
// an OAuth-only user sets a password through the recovery flow, the password
// is stored but NO "email" identity is added (a "ghost password"). So the
// reset-password page stamps this flag in the same updateUser() call that sets
// the password, and it's the only thing that tells those accounts apart
// afterwards. Every check here errs toward "yes, they have one": a wrong yes
// just shows today's form, while a wrong no would hide the password form from
// someone who needs it.
// The same read against a user object you already have. Server actions fetch
// the user anyway, so they call this instead of paying for a second round trip
// to the auth server. getPasswordStatus() below is the version for pages.
export function passwordStatusFor(user: User | null): PasswordStatus {
  if (!user) return { hasPassword: true, provider: null };

  const identities = user.identities ?? [];
  const providers = Array.isArray(user.app_metadata?.providers)
    ? (user.app_metadata.providers as string[])
    : [];

  const hasPassword =
    identities.some((i) => i.provider === "email") ||
    providers.includes("email") ||
    user.app_metadata?.provider === "email" ||
    user.user_metadata?.password_set === true;

  const provider =
    identities.find((i) => i.provider !== "email")?.provider ??
    providers.find((p) => p !== "email") ??
    (user.app_metadata?.provider !== "email"
      ? (user.app_metadata?.provider as string | undefined) ?? null
      : null);

  return { hasPassword, provider };
}

export const getPasswordStatus = cache(async (): Promise<PasswordStatus> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return passwordStatusFor(user);
});
