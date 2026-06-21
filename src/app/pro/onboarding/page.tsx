import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import { getUser } from "@/lib/auth";
import OnboardingCompanyForm from "./OnboardingCompanyForm";

export default async function ProOnboardingPage() {
  // Already set up? Go straight to the leads inbox.
  const contractor = await getCurrentContractor();
  if (contractor) redirect("/pro");

  // Prefill the company email with the account email — they can change it.
  const user = await getUser();

  return (
    <div className="mx-auto max-w-3xl">
      <OnboardingCompanyForm defaultEmail={user?.email ?? ""} />
    </div>
  );
}
