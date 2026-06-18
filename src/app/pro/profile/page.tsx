import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import CompanyForm from "../CompanyForm";

export default async function ProProfilePage({
  searchParams,
}: {
  searchParams: { saved?: string };
}) {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Company profile</h1>
        <p className="mt-1 text-sm text-stone-500">
          Keep this current — your categories decide which leads reach you.
        </p>
      </div>

      {searchParams.saved && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          ✅ Saved.
        </div>
      )}

      <CompanyForm contractor={contractor} submitLabel="Save changes" />
    </div>
  );
}
