import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { labelFor, iconFor, ISSUE_CATEGORIES } from "@/lib/constants";
import LeadChat from "@/components/LeadChat";
import MarkChatSeen from "@/components/MarkChatSeen";

// Homeowner-side "seen" cookie (kept separate from the contractor's).
const SEEN_COOKIE = "hearth_ho_chat_seen";

function readSeenMap(): Record<string, string> {
  try {
    return JSON.parse(cookies().get(SEEN_COOKIE)?.value || "{}");
  } catch {
    return {};
  }
}

async function markChatSeenAction(leadId: string) {
  "use server";
  const jar = cookies();
  let map: Record<string, string> = {};
  try {
    map = JSON.parse(jar.get(SEEN_COOKIE)?.value || "{}");
  } catch {
    map = {};
  }
  map[leadId] = new Date().toISOString();
  jar.set(SEEN_COOKIE, JSON.stringify(map), { path: "/" });
  revalidatePath("/chats");
}

export default async function HomeownerChatsPage({
  searchParams,
}: {
  searchParams: { lead?: string };
}) {
  const property = await getActiveProperty();
  if (!property) redirect("/onboarding");
  const supabase = createClient();

  // The homeowner's conversations are their requests for the active home.
  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("*, contractors(name)")
    .eq("property_id", property.id)
    .order("created_at", { ascending: false });

  const convos = leads ?? [];
  const seen = readSeenMap();
  const nameOf = (l: any) => l.contractors?.name ?? "Sourcing a pro";

  // Latest message per conversation, for preview + unread.
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

  // Unread if the latest message is from the contractor and newer than last seen.
  const isUnread = (leadId: string) => {
    const last = lastByLead.get(leadId);
    if (!last || last.sender_role !== "contractor") return false;
    const seenAt = seen[leadId];
    return !seenAt || seenAt < last.created_at;
  };

  convos.sort((a, b) => {
    const ta = lastByLead.get(a.id)?.created_at ?? a.created_at;
    const tb = lastByLead.get(b.id)?.created_at ?? b.created_at;
    return tb < ta ? -1 : tb > ta ? 1 : 0;
  });

  const selected =
    convos.find((l) => l.id === searchParams.lead) ?? convos[0] ?? null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-stone-900">Messages</h1>

      {selected && (
        <MarkChatSeen leadId={selected.id} action={markChatSeenAction} />
      )}

      {convos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-500">
          No conversations yet. Request a pro on{" "}
          <Link href="/contractors" className="font-medium text-hearth-700 underline">
            Find a Pro
          </Link>{" "}
          and you can message them here.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          {/* ---- Conversation list ---- */}
          <ul className="divide-y divide-stone-100 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {convos.map((l) => {
              const last = lastByLead.get(l.id);
              const isActive = selected?.id === l.id;
              const unread = isUnread(l.id);
              return (
                <li key={l.id}>
                  <Link
                    href={`/chats?lead=${l.id}`}
                    className={`block px-4 py-3 transition ${
                      isActive ? "bg-hearth-50" : "hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate ${
                          unread
                            ? "font-semibold text-stone-900"
                            : "font-medium text-stone-900"
                        }`}
                      >
                        {nameOf(l)}
                      </span>
                      {unread ? (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-hearth-600" />
                      ) : (
                        <span className="shrink-0 text-xs text-stone-400">
                          {iconFor(ISSUE_CATEGORIES, l.category)}
                        </span>
                      )}
                    </div>
                    <p
                      className={`truncate text-xs ${
                        unread ? "text-stone-700" : "text-stone-500"
                      }`}
                    >
                      {last
                        ? `${last.sender_role === "homeowner" ? "You: " : ""}${last.body}`
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
                <p className="font-semibold text-stone-900">{nameOf(selected)}</p>
                <p className="text-xs text-stone-500">
                  {iconFor(ISSUE_CATEGORIES, selected.category)}{" "}
                  {labelFor(ISSUE_CATEGORIES, selected.category)}
                </p>
              </div>
              <div className="flex-1 overflow-hidden p-3">
                <LeadChat
                  key={selected.id}
                  leadId={selected.id}
                  role="homeowner"
                  embedded
                />
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
