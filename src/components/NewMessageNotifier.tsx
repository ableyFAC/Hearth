"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Toast = { id: string; name: string; body: string; href: string };

// Mounted once per shell. Polls for incoming messages (from the other party)
// across all your conversations and shows a bottom-right popup, anywhere in the
// app. Only notifies about messages that arrive after the page loads.
export default function NewMessageNotifier({
  role,
}: {
  role: "homeowner" | "contractor";
}) {
  const supabase = createClient();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const sinceRef = useRef<string>(new Date().toISOString());
  const seenIds = useRef<Set<string>>(new Set());

  function dismiss(id: string) {
    setToasts((t) => t.filter((x) => x.id !== id));
  }

  useEffect(() => {
    let active = true;

    async function poll() {
      if (typeof document !== "undefined" && document.hidden) return;
      // RLS limits this to messages on the user's own conversations. Kept simple
      // (no joins) so a relationship hiccup can't silently break notifications.
      const { data } = await supabase
        .from("messages")
        .select("id, lead_id, sender_role, body, created_at")
        .gt("created_at", sinceRef.current)
        .neq("sender_role", role)
        .neq("sender_role", "system")
        .order("created_at", { ascending: false })
        .limit(5);

      if (!active || !data || data.length === 0) return;

      const fresh = data.filter((m: any) => !seenIds.current.has(m.id));
      if (!fresh.length) return;
      sinceRef.current = fresh[0].created_at;

      const next: Toast[] = fresh.map((m: any) => {
        seenIds.current.add(m.id);
        const name =
          role === "contractor" ? "New message" : "New message from your pro";
        const href =
          role === "contractor"
            ? `/pro/chats?lead=${m.lead_id}`
            : `/chats?lead=${m.lead_id}`;
        return { id: m.id, name, body: m.body, href };
      });

      setToasts((t) => [...next, ...t].slice(0, 4));
      next.forEach((t) => setTimeout(() => dismiss(t.id), 6000));
    }

    poll();
    const interval = setInterval(poll, 8000);
    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          onClick={() => dismiss(t.id)}
          className="block w-72 rounded-xl border border-stone-200 bg-white p-3 shadow-lg transition hover:border-hearth-300"
        >
          <p className="text-sm font-semibold text-stone-900">💬 {t.name}</p>
          <p className="truncate text-xs text-stone-500">{t.body}</p>
        </Link>
      ))}
    </div>
  );
}
