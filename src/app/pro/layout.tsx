import { getCurrentContractor } from "@/lib/contractor";
import ProNav from "@/components/ProNav";

// Pro shell. Auth is enforced by middleware; company-setup is enforced per-page
// (so /pro/onboarding itself doesn't get caught in a redirect loop).
export default async function ProLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const contractor = await getCurrentContractor();

  return (
    <div className="min-h-screen">
      <ProNav company={contractor?.name ?? null} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
