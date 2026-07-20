import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safeNext";
import { requestOrigin } from "@/lib/requestOrigin";
import { recordTermsAcceptance } from "@/app/(auth)/recordTermsAcceptance";

// Handles the PKCE/OAuth code exchange: ?code=...
// (Magic-link flows use /auth/confirm instead.)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // requestOrigin, not new URL(request.url).origin: the latter carries the
  // dev server's bind address (`-H 0.0.0.0`) and strands the browser there.
  const origin = requestOrigin(request);
  const code = searchParams.get("code");
  // ?next= is attacker-influenceable (e.g. via resetPasswordForEmail's
  // redirectTo), so only follow it when it's a same-origin relative path.
  const next = safeNextPath(searchParams.get("next")) ?? "/dashboard";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // The other half of the email-confirmation terms gap: when Supabase
      // email confirmation is ON, signUp() (homeowner-signup/contractor-signup
      // page.tsx) returns no session, so their own recordTermsAcceptance()
      // call never fires - the confirmation link lands HERE instead, and this
      // is the first point a userId is available for that flow. Awaited
      // (not fire-and-forget) since this is a route handler: nothing is
      // guaranteed to keep running after the redirect response below is
      // returned.
      //
      // Gated to the confirmation flow specifically, not every code exchange
      // this route handles: password reset (resetPasswordForEmail's
      // redirectTo) also lands here, and that user did NOT just agree to
      // anything - terms_acceptances is a legal audit trail, so a row there
      // has to mean what it says. The two signup pages always build their
      // confirmation link's ?next= as /onboarding or /pro/onboarding (see
      // confirmRedirectUrl() in each), so that prefix is the signal this is
      // the signup-confirmation flow and not some other use of this route.
      // recordTermsAcceptance is idempotent (checks for an existing row
      // first), so a user already recorded via the signup page's own call -
      // or a confirmation link visited twice - does not get a duplicate row.
      const isSignupConfirmation =
        next === "/onboarding" ||
        next.startsWith("/onboarding?") ||
        next === "/pro/onboarding" ||
        next.startsWith("/pro/onboarding?");
      if (data.user && isSignupConfirmation) {
        const role = (data.user.user_metadata?.role ??
          data.user.app_metadata?.role) as string | undefined;
        await recordTermsAcceptance(
          data.user.id,
          role === "contractor" ? "pro_terms" : "terms"
        );
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(`${origin}/signin?error=auth_failed`);
}
