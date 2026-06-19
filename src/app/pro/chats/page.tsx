import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { labelFor, iconFor, ISSUE_CATEGORIES } from "@/lib/constants";
import LeadChat from "@/components/LeadChat";

// Same cookie the leads page uses to track which leads have been unlocked.
const UNLOCKED_COOKIE = "hearth_unlocked_leads";

function readUnlockedSet(): Set<string> {
  const raw = cookies().get(UNLOCKED_COOKIE)?.value;
  return new Set(raw ? raw.split(",").filter(Boolean) : []);
}

export default async function ProChatsPage({
  searchParams,
}: {
  searchParams: { lead?: string };
}) {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const supabase = createClient();
  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("*")
    .eq("contractor_id", contractor.id)
    .order("created_at", { ascending: false });

  const unlockedSet = readUnlockedSet();
  const isUnlocked = (l: any) => Boolean(l.paid) || unlockedSet.has(l.id);

  // You can only message a homeowner once the lead is unlocked, so the inbox is
  // the set of unlocked leads.
  const convos = (leads ?? []).filter(isUnlocked);

  // Pull the latest message per conversation for the list preview.
  const ids = convos.map((l) => l.id);
  const lastByLead = new Map<string, any>();
  if (ids.length) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("lead_id, body, created_at, sender_role")
      .in("lead_id", ids)
      .order("created_at", { ascending: false });
    for (const m of msgs ?? []) {
      if (!lastByLead.has(m.lead_id)) lastByLead.set(m.lead_id, m);
    }
  }

  // Sort: conversations with the most recent message first, then newest leads.
  convos.sort((a, b) => {
    const ta = lastByLead.get(a.id)?.created_at ?? a.created_at;
    const tb = lastByLead.get(b.id)?.created_at ?? b.created_at;
    return tb < ta ? -1 : tb > ta ? 1 : 0;
  });

  // Which thread is open? The one in the URL, else the first conversation.
  const selected =
    convos.find((l) => l.id === searchParams.lead) ?? convos[0] ?? null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-stone-900">Chats</h1>

      {convos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
          No conversations yet. Unlock a lead on the{" "}
          <Link href="/pro" className="font-medium text-hearth-700 underline">
            Leads
          </Link>{" "}
          page to start messaging the homeowner.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          {/* ---- Conversation list ---- */}
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {convos.map((l) => {
              const last = lastByLead.get(l.id);
              const isActive = selected?.id === l.id;
              return (
                <li key={l.id}>
                  <Link
                    href={`/pro/chats?lead=${l.id}`}
                    className={`block px-4 py-3 transition ${
                      isActive ? "bg-hearth-50" : "hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-stone-900">
                        {l.homeowner_name || "Homeowner"}
                      </span>
                      <span className="shrink-0 text-xs text-stone-400">
                        {iconFor(ISSUE_CATEGORIES, l.category)}
                      </span>
                    </div>
                    <p className="truncate text-xs text-stone-500">
                      {last
                        ? `${last.sender_role === "contractor" ? "You: " : ""}${last.body}`
                        : labelFor(ISSUE_CATEGORIES, l.category)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* ---- Open thread ---- */}
          {selected ? (
            <div className="flex h-[60vh] flex-col rounded-xl border border-stone-200 bg-white">
              <div className="border-b border-stone-100 px-4 py-3">
                <p className="font-semibold text-stone-900">
                  {selected.homeowner_name || "Homeowner"}
                </p>
                <p className="text-xs text-stone-500">
                  {iconFor(ISSUE_CATEGORIES, selected.category)}{" "}
                  {labelFor(ISSUE_CATEGORIES, selected.category)}
                  {selected.property_address
                    ? ` · ${selected.property_address}`
                    : ""}
                </p>
              </div>
              <div className="flex-1 overflow-hidden p-3">
                {/* `key` forces a fresh thread when switching conversations. */}
                <LeadChat key={selected.id} leadId={selected.id} role="contractor" embedded />
              </div>
            </div>
          ) : (
            <div className="flex h-[60vh] items-center justify-center rounded-xl border border-dashed border-stone-300 text-sm text-stone-400">
              Select a conversation
            </div>
          )}
        </div>
      )}
    </div>
  );
}
