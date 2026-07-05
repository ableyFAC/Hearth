import Link from "next/link";
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

  // No company yet → the user is still onboarding. Show a bare, link-free top bar
  // so they can't navigate into pages that assume a set-up company exists.
  if (!contractor) {
    return (
      <div className="min-h-screen">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center px-6 py-3">
            <span className="text-lg font-semibold text-stone-900">
              🛠️ Hearth for Pros
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <ProNav company={contractor.name} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-6 pb-8 text-center text-xs text-stone-400">
        Need a hand?{" "}
        <Link href="/pro/help" className="underline hover:text-stone-600">
          Help
        </Link>
      </footer>
      <NewMessageNotifier role="contractor" />
    </div>
  );
}
