import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getActiveProperty, getProperties } from "@/lib/property";
import { getRole } from "@/lib/contractor";
import { createClient } from "@/lib/supabase/server";
import Nav from "@/components/Nav";

const SEEN_COOKIE = "hearth_ho_chat_seen";

// Count conversations with an unread contractor message (for the nav badge).
async function unreadCount(propertyId: string): Promise<number> {
  let seen: Record<string, string> = {};
  try {
    seen = JSON.parse(cookies().get(SEEN_COOKIE)?.value || "{}");
  } catch {
    seen = {};
  }

  const supabase = createClient();
  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("id")
    .eq("property_id", propertyId);

  const ids = (leads ?? []).map((l: any) => l.id);
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
      m.sender_role === "contractor" &&
      (!seen[lid] || seen[lid] < m.created_at)
    ) {
      count++;
    }
  }
  return count;
}

// Shell for all signed-in homeowner screens. Pros are bounced to their own area;
// then we guarantee a claimed home exists.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if ((await getRole()) === "contractor") redirect("/pro");

  const [active, homes] = await Promise.all([
    getActiveProperty(),
    getProperties(),
  ]);
  if (!active) redirect("/onboarding");

  const unread = await unreadCount(active.id);

  return (
    <div className="min-h-screen">
      <Nav homes={homes} activeId={active.id} unread={unread} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
