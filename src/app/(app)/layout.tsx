import { redirect } from "next/navigation";
import { getActiveProperty, getProperties } from "@/lib/property";
import { isContractor } from "@/lib/contractor";
import Nav from "@/components/Nav";

// Shell for all signed-in homeowner screens. Pros are bounced to their own area;
// then we guarantee a claimed home exists.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (await isContractor()) redirect("/pro");

  const [active, homes] = await Promise.all([
    getActiveProperty(),
    getProperties(),
  ]);
  if (!active) redirect("/onboarding");

  return (
    <div className="min-h-screen">
      <Nav homes={homes} activeId={active.id} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
