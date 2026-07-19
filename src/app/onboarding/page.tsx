import Link from "next/link";
import { redirect } from "next/navigation";
import { getProperties } from "@/lib/property";
import { isContractor } from "@/lib/contractor";
import { hasPlus } from "@/lib/subscription";
import { safeNextPath } from "@/lib/safeNext";
import OnboardingForm from "./OnboardingForm";

// ?next=: the tail end of the sign-up funnel's redirect chain (see
// homeowner-signup/page.tsx). Handed to OnboardingForm as a hidden field so
// claimPropertyAction (./actions.ts) can honor it once the home is claimed -
// the claimed-home gate in (app)/layout.tsx sends every new homeowner through
// here regardless of ?next=, which is expected; this just keeps their
// original destination alive across that detour instead of dropping it.
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  // Contractors belong in /pro - don't let them create a homeowner property.
  if (await isContractor()) redirect("/pro");

  const next = safeNextPath(
    typeof searchParams?.next === "string" ? searchParams.next : null
  );

  // First home vs. adding another - onboarding stays reachable either way.
  const homes = await getProperties();
  const isFirst = homes.length === 0;

  // Free plan covers 1 owned home (shared homes don't count - same tally as
  // claimPropertyAction in ./actions.ts). Surface the cap HERE, before the
  // form, instead of letting someone fill it all in only to be bounced to
  // /plus at the very end.
  if (!isFirst) {
    const plus = await hasPlus();
    const ownedHomes = homes.filter((h) => !h.isShared);
    if (!plus && ownedHomes.length >= 1) {
      return (
        <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
              Add another home
            </h1>
          </div>
          <div className="card text-center">
            <p className="text-sm text-stone-600 dark:text-stone-300">
              Your first home is free. Adding another home is part of Hearth
              Plus.
            </p>
            <Link
              href="/plus?reason=home_limit"
              className="btn-primary mt-4 inline-block"
            >
              See Hearth Plus
            </Link>
          </div>
          <Link
            href="/dashboard"
            className="mt-4 text-center text-sm text-stone-500 hover:underline dark:text-stone-400"
          >
            Back to dashboard
          </Link>
        </main>
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
          {isFirst ? "Let's set up your home" : "Add another home"}
        </h1>
        {!isFirst && (
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Switch between your homes anytime from the top bar.
          </p>
        )}
      </div>

      <OnboardingForm next={next} />

      {!isFirst && (
        <Link
          href="/dashboard"
          className="mt-4 text-center text-sm text-stone-500 hover:underline dark:text-stone-400"
        >
          Cancel
        </Link>
      )}
    </main>
  );
}
