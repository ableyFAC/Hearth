import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { labelFor, iconFor, JOB_CATEGORIES } from "@/lib/constants";
import { extractQuote, formatUSDCents } from "@/lib/quotes";
import LeadChat from "@/components/LeadChat";
import MarkChatSeen from "@/components/MarkChatSeen";
import MarkChatsSeen from "@/components/MarkChatsSeen";
import AskHearth from "@/components/AskHearth";
import { getProactiveGreeting } from "@/lib/greeting";
import ReviewButton from "@/app/(app)/contractors/ReviewButton";
import { saveReviewAction } from "@/app/(app)/contractors/actions";
import { acceptQuoteAction, declineQuoteAction } from "./actions";

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

// Mark every conversation seen at once. Fires when the inbox is opened, so the
// nav badge clears even on the default Ask Hearth pane where no single thread
// is selected.
async function markAllChatsSeenAction(leadIds: string[]) {
  "use server";
  const jar = cookies();
  let map: Record<string, string> = {};
  try {
    map = JSON.parse(jar.get(SEEN_COOKIE)?.value || "{}");
  } catch {
    map = {};
  }
  const now = new Date().toISOString();
  for (const id of leadIds) map[id] = now;
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
  const greeting = await getProactiveGreeting();

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
  // The latest price each pro has quoted, in cents, so the homeowner can
  // compare. A structured quote (lead_quotes) is preferred when one exists;
  // the regex guess off plain chat text is only a fallback for threads that
  // never got one.
  const quoteByLead = new Map<string, number>();
  if (ids.length) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("lead_id, body, created_at, sender_role")
      .in("lead_id", ids)
      .order("created_at", { ascending: false });
    for (const m of msgs ?? []) {
      if (!lastByLead.has(m.lead_id)) lastByLead.set(m.lead_id, m);
      // Messages are newest first, so the first contractor price we see per lead
      // is that pro's most recent quote.
      if (m.sender_role === "contractor" && !quoteByLead.has(m.lead_id)) {
        const q = extractQuote(m.body);
        if (q != null) quoteByLead.set(m.lead_id, q * 100);
      }
    }

    // Structured quotes take priority: fetch the latest per lead and
    // overwrite any regex-based guess for that lead.
    // Withdrawn quotes are excluded: the pro retracted that price, so it is
    // not their standing offer. Declined ones still count as the last price
    // the pro actually stated.
    const { data: structuredQuotes } = await supabase
      .from("lead_quotes")
      .select("lead_id, total_cents, created_at")
      .in("lead_id", ids)
      .neq("status", "withdrawn")
      .order("created_at", { ascending: false });
    const latestStructured = new Set<string>();
    for (const q of structuredQuotes ?? []) {
      if (latestStructured.has(q.lead_id)) continue;
      latestStructured.add(q.lead_id);
      quoteByLead.set(q.lead_id, q.total_cents);
    }
  }

  // Pros who have sent a price, cheapest first, for the compare panel.
  const quoted = convos
    .filter((l) => quoteByLead.has(l.id))
    .map((l) => ({ id: l.id, name: nameOf(l), amount: quoteByLead.get(l.id)! }))
    .sort((a, b) => a.amount - b.amount);

  // Unread if the latest message is from the contractor and newer than last seen.
  const isUnread = (leadId: string) => {
    const last = lastByLead.get(leadId);
    if (!last || last.sender_role !== "contractor") return false;
    const seenAt = seen[leadId];
    // Compare as epoch millis so timestamp formats cannot skew the result.
    return (
      !seenAt ||
      new Date(seenAt).getTime() < new Date(last.created_at).getTime()
    );
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

  // The selected thread already has a pro assigned (accepted or closed; the
  // convos query above only includes leads with contractor_id set), so a
  // review is allowed here per leave_review() (0017) regardless of whether the
  // conversation itself has been closed yet. Look up any existing review so the
  // thread shows "Leave a review" or a quiet "You reviewed this pro" state.
  const { data: existingReview } = selected
    ? await supabase
        .from("reviews")
        .select("rating, comment")
        .eq("lead_id", selected.id)
        .maybeSingle()
    : { data: null };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold text-stone-900">Messages</h1>

      {/* Opening the inbox clears the nav badge, even on the Ask Hearth pane. */}
      <MarkChatsSeen
        leadIds={convos.map((l) => l.id)}
        action={markAllChatsSeenAction}
      />

      {selected && (
        <MarkChatSeen leadId={selected.id} action={markChatSeenAction} />
      )}

      {/* Compare the prices pros have sent in chat, cheapest first. */}
      {quoted.length > 0 && (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm font-semibold text-stone-900">
            Quotes from your pros
          </p>
          <p className="text-xs text-stone-500">
            Prices your pros have sent in chat, lowest first.
          </p>
          <ul className="mt-2 space-y-1">
            {quoted.map((q) => (
              <li
                key={q.id}
                className="flex items-center justify-between gap-3"
              >
                <Link
                  href={`/chats?lead=${q.id}`}
                  className="truncate text-sm text-stone-700 hover:text-hearth-700 hover:underline"
                >
                  {q.name}
                </Link>
                <span className="flex shrink-0 items-center gap-2">
                  {quoted.length > 1 && q.amount === quoted[0].amount && (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                      Lowest
                    </span>
                  )}
                  <span className="font-semibold text-stone-900">
                    {formatUSDCents(q.amount)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
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
                        ? `${last.sender_role === "homeowner" ? "You: " : ""}${
                            last.body.startsWith("[img]")
                              ? "📷 Photo"
                              : last.body
                          }`
                        : labelFor(JOB_CATEGORIES, l.category)}
                    </p>
                    {quoteByLead.has(l.id) && (
                      <span className="mt-1 inline-block rounded-full bg-hearth-50 px-2 py-0.5 text-[10px] font-semibold text-hearth-700">
                        Quote {formatUSDCents(quoteByLead.get(l.id)!)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* ---- Open thread ---- */}
          {askSelected ? (
            <div className="h-[60vh] rounded-xl border border-stone-200 bg-white p-3 md:h-[calc(100vh-13rem)]">
              <AskHearth fill greeting={greeting} />
            </div>
          ) : selected ? (
            <div className="flex h-[60vh] flex-col rounded-xl border border-stone-200 bg-white p-3 md:h-[calc(100vh-13rem)]">
              {/* A pro is assigned on every thread here, so a review is always
                  allowed (leave_review only requires an assigned pro, not a
                  closed conversation): "Leave a review" while working
                  together, or a quiet "You reviewed this pro" once done. */}
              <div className="mb-2 flex flex-wrap shrink-0 items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm">
                {existingReview ? (
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500">
                      {"★".repeat(existingReview.rating)}
                      <span className="text-stone-300">
                        {"★".repeat(5 - existingReview.rating)}
                      </span>
                    </span>
                    <span className="text-xs text-stone-400">
                      You reviewed this pro
                    </span>
                  </div>
                ) : (
                  <span className="text-stone-500">
                    Worked with {nameOf(selected)}?
                  </span>
                )}
                <ReviewButton
                  leadId={selected.id}
                  contractorName={nameOf(selected)}
                  action={saveReviewAction}
                  existing={existingReview ?? undefined}
                  proProfilePath={`/p/${selected.contractor_id}`}
                  categoryLabel={labelFor(JOB_CATEGORIES, selected.category)}
                />
              </div>
              <div className="min-h-0 flex-1">
                <LeadChat
                  key={selected.id}
                  leadId={selected.id}
                  role="homeowner"
                  embedded
                  title={nameOf(selected)}
                  subtitle={labelFor(JOB_CATEGORIES, selected.category)}
                  contractorName={nameOf(selected)}
                  acceptQuoteAction={acceptQuoteAction}
                  declineQuoteAction={declineQuoteAction}
                />
              </div>
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
