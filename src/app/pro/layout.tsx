import { redirect } from "next/navigation";
import { getCurrentContractor, getRole } from "@/lib/contractor";
import ProNav from "@/components/ProNav";
import NewMessageNotifier from "@/components/NewMessageNotifier";

// Pro shell. Auth is enforced by middleware; company-setup is enforced per-page
// (so /pro/onboarding itself doesn't get caught in a redirect loop).
export default async function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Keep homeowners off the contractor side (and prevent them from accidentally
  // creating a company at /pro/onboarding). Contractors without a company yet
  // still pass, so they can finish onboarding.
  if ((await getRole()) === "homeowner") redirect("/dashboard");

  const contractor = await getCurrentContractor();

  return (
    <div className="min-h-screen">
      <ProNav company={contractor?.name ?? null} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      <NewMessageNotifier role="contractor" />
    </div>
  );
}
