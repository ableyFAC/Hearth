"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Loads the unread-message count on the client (after render) so it never
// blocks page navigation. A realtime subscription bumps the badge the instant a
// message arrives from the other side; a 30s poll and a focus refresh back it up.
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
      const seen = readSeen(SEEN_COOKIE[role]);
      // Only the most recent messages - unread ones are always recent, and this
      // keeps the query bounded (and from hogging a DB connection).
      const { data } = await supabase
        .from("messages")
        .select("lead_id, sender_role, created_at")
        .eq("sender_role", OTHER[role])
        .order("created_at", { ascending: false })
        .limit(50);
      // Count one per person (conversation), not one per message.
      const unread = new Set<string>();
      for (const m of data ?? []) {
        const s = seen[m.lead_id];
        if (!s || s < m.created_at) unread.add(m.lead_id);
      }
      if (active) setCount(unread.size);
    }
    poll();

    // Realtime: a new message from the other role updates the badge instantly.
    const channel = supabase
      .channel(`unread-${role}`)
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

    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    const t = setInterval(poll, 30000);
    return () => {
      active = false;
      supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
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
