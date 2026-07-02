"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

// Rough "3h ago" / "2d ago" label - no need for a date library for this.
function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Bell icon in the nav for the notifications the app already computes for the
// homeowner (weather alerts, recalls, ...). Polls for the unread count, and
// mirrors LiveUnreadBadge's realtime + poll pattern so it updates promptly
// without hammering the DB. Marking read happens the moment the panel opens,
// so the badge clears as soon as the homeowner has seen the list.
export default function NotificationBell() {
  const supabase = createClient();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function loadCount() {
    if (typeof document !== "undefined" && document.hidden) return;
    try {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      setUnread(count ?? 0);
    } catch {
      // Degrade to nothing - a failed count just leaves the badge as-is.
    }
  }

  async function loadList() {
    try {
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, title, body, url, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      setItems(data ?? []);

      const unreadIds = (data ?? [])
        .filter((n) => !n.read_at)
        .map((n) => n.id);
      if (unreadIds.length) {
        await supabase
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .in("id", unreadIds);
        setItems((cur) =>
          cur.map((n) =>
            unreadIds.includes(n.id)
              ? { ...n, read_at: new Date().toISOString() }
              : n
          )
        );
        setUnread(0);
      }
    } catch {
      // Leave whatever was already shown.
    }
  }

  useEffect(() => {
    let active = true;
    async function poll() {
      await loadCount();
    }
    poll();

    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        () => active && poll()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on outside click or Escape - matches ProfileMenu.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function togglePanel() {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={togglePanel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-stone-500 hover:bg-hearth-50 hover:text-hearth-700"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2a6 6 0 00-6 6v3.09c0 .5-.16.98-.46 1.38L4 15.5c-.6.8-.02 2 .98 2h14.04c1 0 1.58-1.2.98-2l-1.54-3.03A2.25 2.25 0 0118 11.09V8a6 6 0 00-6-6z" />
          <path d="M9.5 20a2.5 2.5 0 005 0h-5z" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-80 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg"
        >
          <div className="border-b border-stone-100 px-4 py-2 text-sm font-semibold text-stone-900">
            Notifications
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-stone-400">
                Nothing new right now.
              </p>
            ) : (
              items.map((n) => {
                const content = (
                  <>
                    <p className="text-sm font-medium text-stone-900">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-stone-500">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-stone-400">
                      {timeAgo(n.created_at)}
                    </p>
                  </>
                );
                return n.url ? (
                  <Link
                    key={n.id}
                    href={n.url}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="block border-b border-stone-50 px-4 py-3 last:border-b-0 hover:bg-hearth-50"
                  >
                    {content}
                  </Link>
                ) : (
                  <div
                    key={n.id}
                    role="menuitem"
                    className="block border-b border-stone-50 px-4 py-3 last:border-b-0"
                  >
                    {content}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
