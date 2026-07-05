import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import { getUser } from "@/lib/auth";
import OnboardingCompanyForm from "./OnboardingCompanyForm";

export default async function ProOnboardingPage({
  searchParams,
}: {
  searchParams?: { ref?: string | string[] };
}) {
  // Already set up? Go straight to the leads inbox.
  const contractor = await getCurrentContractor();
  if (contractor) redirect("/pro");

  // Prefill the company email with the account email. They can change it.
  const user = await getUser();

  // Referral attribution: /pros?ref=CODE links land here with the code in the
  // query string. Prefill it; the pro can still edit or clear it.
  const ref = searchParams?.ref;
  const referralCode = typeof ref === "string" ? ref.slice(0, 100) : "";

  return (
    <div className="mx-auto max-w-3xl">
      <OnboardingCompanyForm
        defaultEmail={user?.email ?? ""}
        defaultReferralCode={referralCode}
      />
    </div>
  );
}
