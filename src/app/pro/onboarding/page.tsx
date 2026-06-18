import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import CompanyForm from "../CompanyForm";

export default async function ProOnboardingPage() {
  // Already set up? Go straight to the leads inbox.
  const contractor = await getCurrentContractor();
  if (contractor) redirect("/pro");

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 text-center">
        <div className="text-3xl">🛠️</div>
        <h1 className="mt-2 text-2xl font-semibold text-stone-900">
          Set up your company
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Tell us what you do so we can match you with the right homeowner leads.
        </p>
      </div>
      <CompanyForm contractor={null} submitLabel="Start receiving leads" />
    </div>
  );
}
