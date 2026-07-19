"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Loads the unread-message count on the client (after render) so it never
// blocks page navigation. A realtime subscription bumps the badge the instant a
// message arrives from the other side; that's the primary path. The poll below
// is just a safety net for missed/dropped realtime events (e.g. a channel that
// silently disconnects), so it runs on a slow 2-minute cadence rather than
// duplicating what realtime already does every 30s. A focus refresh and the
// "hearth:chat-seen" event both re-poll immediately for the cases that matter
// most (tab regains focus, user just opened a conversation).
const SEEN_COOKIE: Record<string, string> = {
  homeowner: "hearth_ho_chat_seen",
  contractor: "hearth_chat_seen",
};
const OTHER: Record<string, string> = {
  homeowner: "contractor",
  contractor: "homeowner",
};

function readSeen(name: string): Record<string, string> {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  if (!m) return {};
  try {
    return JSON.parse(decodeURIComponent(m[1]));
  } catch {
    return {};
  }
}

// The latest time a lead was seen, in epoch millis, taking the max of the seen
// cookie and any localStorage override written the instant a chat was opened.
// The localStorage override removes any dependence on cookie write propagation,
// and epoch millis avoid string-comparison bugs between ISO "Z" timestamps and
// Postgres "+00:00" timestamps.
function seenMillis(name: string, leadId: string): number {
  const cookieVal = readSeen(name)[leadId];
  let ms = cookieVal ? new Date(cookieVal).getTime() : 0;
  try {
    const local = localStorage.getItem(`hearth:seen:${leadId}`);
    if (local) ms = Math.max(ms, Number(local) || 0);
  } catch {
    /* localStorage unavailable */
  }
  return ms;
}

export default function LiveUnreadBadge({
  role,
}: {
  role: "homeowner" | "contractor";
}) {
  const supabase = createClient();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    async function poll() {
      if (typeof document !== "undefined" && document.hidden) return;
      const cookieName = SEEN_COOKIE[role];
      // Only the most recent messages, since unread ones are always recent. This
      // keeps the query bounded and from hogging a DB connection.
      const { data } = await supabase
        .from("messages")
        .select("lead_id, sender_role, created_at")
        .eq("sender_role", OTHER[role])
        .order("created_at", { ascending: false })
        .limit(50);
      // Count one per person (conversation), not one per message. A lead is
      // unread when its newest incoming message is later than the last time it
      // was seen, compared as epoch millis so timestamp formats cannot skew it.
      const unread = new Set<string>();
      for (const m of data ?? []) {
        if (new Date(m.created_at).getTime() > seenMillis(cookieName, m.lead_id)) {
          unread.add(m.lead_id);
        }
      }
      if (active) setCount(unread.size);
    }
    poll();

    // Realtime: a new message from the other role updates the badge instantly.
    // The topic is unique per mount, not just per role: supabase-js returns the
    // SAME already-subscribed channel instance for a repeated topic, and a
    // second .on() on an already-subscribed channel throws. That collision is
    // reachable two ways - React dev StrictMode's mount-cleanup-remount (the
    // cleanup's removeChannel is async, so the remount can win the race) and
    // any layout that renders this badge twice (desktop nav + mobile nav) - so
    // a random suffix isolates every instance instead of sharing one topic.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const topic = "unread-" + role + "-" + Math.random().toString(36).slice(2);
      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `sender_role=eq.${OTHER[role]}`,
          },
          () => poll()
        )
        .subscribe();
    } catch {
      // Realtime is strictly best-effort: the poll/focus/interval paths below
      // keep the badge working on their own, so a subscribe failure here must
      // never crash the signed-in shell.
      console.warn("LiveUnreadBadge: realtime subscription failed, falling back to polling");
    }

    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    // Opening a conversation marks it read and fires this event; re-poll at once
    // so the badge clears immediately instead of lingering until the next poll.
    const onSeen = () => poll();
    window.addEventListener("hearth:chat-seen", onSeen);
    const t = setInterval(poll, 120000);
    return () => {
      active = false;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          // Best-effort cleanup: nothing to do if this fails, the channel is
          // going away along with the component either way.
        }
      }
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("hearth:chat-seen", onSeen);
      clearInterval(t);
    };
  }, [role]);

  if (!count) return null;
  return (
    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-semibold text-white">
      {count}
    </span>
  );
}
