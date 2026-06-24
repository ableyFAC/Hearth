import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { labelFor, iconFor, JOB_CATEGORIES } from "@/lib/constants";
import LeadChat from "@/components/LeadChat";
import MarkChatSeen from "@/components/MarkChatSeen";
import AskHearth from "@/components/AskHearth";

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

  // The homeowner's conversations are jobs where they've PICKED a pro. Open
  // postings with no chosen pro yet aren't chats - there's no one to message.
  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("*, contractors(name)")
    .eq("property_id", property.id)
    .not("contractor_id", "is", null)
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

  // "Ask Hearth" is a pinned assistant conversation, always available. It's the
  // default when there are no real (chosen-pro) conversations yet.
  const askSelected =
    !searchParams.lead || searchParams.lead === "ask-hearth";
  const selected = askSelected
    ? null
    : (convos.find((l) => l.id === searchParams.lead) ?? null);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-stone-900">Messages</h1>

      {selected && (
        <MarkChatSeen leadId={selected.id} action={markChatSeenAction} />
      )}

      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        {/* ---- Conversation list ---- */}
        <ul className="max-h-[40vh] divide-y divide-stone-100 overflow-y-auto rounded-xl border border-stone-200 bg-white md:h-[calc(100vh-13rem)] md:max-h-none">
          {/* Pinned assistant */}
          <li>
            <Link
              href="/chats?lead=ask-hearth"
              className={`block border-l-4 px-4 py-3 transition ${
                askSelected
                  ? "border-hearth-500 bg-hearth-50"
                  : "border-transparent hover:bg-stone-50"
              }`}
            >
              <span className="truncate font-medium text-stone-900">
                ✨ Ask Hearth
              </span>
              <p className="truncate text-xs text-stone-500">
                Your home assistant
              </p>
            </Link>
          </li>

          {convos.map((l) => {
              const last = lastByLead.get(l.id);
              const isActive = selected?.id === l.id;
              const unread = isUnread(l.id);
              return (
                <li key={l.id}>
                  <Link
                    href={`/chats?lead=${l.id}`}
                    className={`block border-l-4 px-4 py-3 transition ${
                      isActive
                        ? "border-hearth-500 bg-hearth-50"
                        : unread
                          ? "border-hearth-400 bg-hearth-50/60 hover:bg-hearth-50"
                          : "border-transparent hover:bg-stone-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`truncate ${
                          unread
                            ? "font-bold text-stone-900"
                            : "font-medium text-stone-900"
                        }`}
                      >
                        {nameOf(l)}
                      </span>
                      {unread ? (
                        <span className="shrink-0 rounded-full bg-hearth-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          New
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs text-stone-400">
                          {iconFor(JOB_CATEGORIES, l.category)}
                        </span>
                      )}
                    </div>
                    <p
                      className={`truncate text-xs ${
                        unread ? "font-medium text-stone-800" : "text-stone-500"
                      }`}
                    >
                      {last
                        ? `${last.sender_role === "homeowner" ? "You: " : ""}${last.body}`
                        : labelFor(JOB_CATEGORIES, l.category)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* ---- Open thread ---- */}
          {askSelected ? (
            <div className="h-[60vh] rounded-xl border border-stone-200 bg-white p-3 md:h-[calc(100vh-13rem)]">
              <AskHearth fill />
            </div>
          ) : selected ? (
            <div className="h-[60vh] rounded-xl border border-stone-200 bg-white p-3 md:h-[calc(100vh-13rem)]">
              <LeadChat
                key={selected.id}
                leadId={selected.id}
                role="homeowner"
                embedded
                title={nameOf(selected)}
                subtitle={labelFor(JOB_CATEGORIES, selected.category)}
              />
            </div>
          ) : (
            <div className="flex h-[60vh] items-center justify-center rounded-xl border border-dashed border-stone-300 text-sm text-stone-400 md:h-[calc(100vh-13rem)]">
              Select a conversation
            </div>
          )}
        </div>
    </div>
  );
}
