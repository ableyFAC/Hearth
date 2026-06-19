import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentContractor, getRole } from "@/lib/contractor";
import { createClient } from "@/lib/supabase/server";
import ProNav from "@/components/ProNav";

// Seen-state cookie shared with the chats page.
const SEEN_COOKIE = "hearth_chat_seen";

// Count conversations with an unread homeowner message (for the nav badge).
async function unreadCount(contractorId: string): Promise<number> {
  const jar = cookies();
  let seen: Record<string, string> = {};
  try {
    seen = JSON.parse(jar.get(SEEN_COOKIE)?.value || "{}");
  } catch {
    seen = {};
  }

  const supabase = createClient();
  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("id, paid")
    .eq("contractor_id", contractorId);

  const ids = (leads ?? [])
    .filter((l: any) => l.paid)
    .map((l: any) => l.id);
  if (!ids.length) return 0;

  const { data: msgs } = await supabase
    .from("messages")
    .select("lead_id, sender_role, created_at")
    .in("lead_id", ids)
    .order("created_at", { ascending: false });

  const lastByLead = new Map<string, any>();
  for (const m of msgs ?? []) {
    if (!lastByLead.has(m.lead_id)) lastByLead.set(m.lead_id, m);
  }

  let count = 0;
  for (const [lid, m] of lastByLead) {
    if (
      m.sender_role === "homeowner" &&
      (!seen[lid] || seen[lid] < m.created_at)
    ) {
      count++;
    }
  }
  return count;
}

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
  const unread = contractor ? await unreadCount(contractor.id) : 0;

  return (
    <div className="min-h-screen">
      <ProNav company={contractor?.name ?? null} unread={unread} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
