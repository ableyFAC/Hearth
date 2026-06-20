"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Loads the unread-message count on the client (after render) so it never
// blocks page navigation. Polls every 10s.
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
      // RLS limits this to the user's own conversations.
      const { data } = await supabase
        .from("messages")
        .select("lead_id, sender_role, created_at")
        .eq("sender_role", OTHER[role]);
      let c = 0;
      for (const m of data ?? []) {
        const s = seen[m.lead_id];
        if (!s || s < m.created_at) c++;
      }
      if (active) setCount(c);
    }
    poll();
    const t = setInterval(poll, 10000);
    return () => {
      active = false;
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
