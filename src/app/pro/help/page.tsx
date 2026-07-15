import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import { hasProPlan } from "@/lib/subscription";
import { FOUNDER } from "@/lib/constants";
import ProSupportForm from "./ProSupportForm";

// Support for pros. Every contractor can reach the team from here; messages
// from active Pro members are flagged priority so they get answered first.
// Support itself is never gated: only the place in line is a membership perk.
export default async function ProHelpPage() {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const member = await hasProPlan();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Help</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Question about a lead, your wallet, or your account? Send us a
          message and we will get back to you.
        </p>
      </div>

      <ProSupportForm member={member} />

      {/* Bug bounty, small and honest. Only renders while FOUNDER.email is a
          real, monitored inbox (see the note in constants.ts). */}
      {FOUNDER.email && (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-stone-800">
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            Found a bug?
          </h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
            Tell us about it and get up to $20 in Hearth credit.
          </p>
          <a
            href={`mailto:${FOUNDER.email}?subject=${encodeURIComponent("I found a bug")}`}
            className="mt-3 inline-block text-sm font-medium text-hearth-700 hover:underline dark:text-hearth-300"
          >
            Report a bug
          </a>
        </div>
      )}

      {!member && (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Pro members get priority support.{" "}
          <Link href="/pro/plus" className="underline hover:text-stone-600 dark:hover:text-stone-300">
            See Hearth Pro
          </Link>
        </p>
      )}
    </div>
  );
}
