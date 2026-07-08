import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import { hasProPlan } from "@/lib/subscription";
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
        <h1 className="text-2xl font-semibold text-stone-900">Help</h1>
        <p className="mt-1 text-sm text-stone-500">
          Question about a lead, your wallet, or your account? Send us a
          message and we will get back to you.
        </p>
      </div>

      <ProSupportForm member={member} />

      {!member && (
        <p className="text-xs text-stone-500">
          Pro members get priority support.{" "}
          <Link href="/pro/plus" className="underline hover:text-stone-600">
            See Hearth Pro
          </Link>
        </p>
      )}
    </div>
  );
}
