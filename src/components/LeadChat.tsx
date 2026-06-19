"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Msg = {
  id: string;
  sender_role: string;
  body: string;
  created_at: string;
};

// Messaging thread for a lead. Both the homeowner and the assigned contractor
// see the same thread (RLS enforces only those two can read/post). Polls every
// few seconds so the other side's replies show up without a refresh.
//
// `embedded` renders the thread always-open and full-height (no toggle button),
// for use as the right-hand pane of the /pro/chats inbox.
export default function LeadChat({
  leadId,
  role,
  embedded = false,
}: {
  leadId: string;
  role: "homeowner" | "contractor";
  embedded?: boolean;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(embedded);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const uidRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function load() {
    const { data } = await supabase
      .from("messages")
      .select("id, sender_role, body, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });
    setMessages(data ?? []);
  }

  useEffect(() => {
    if (!open) return;
    supabase.auth
      .getUser()
      .then(({ data }) => (uidRef.current = data.user?.id ?? null));
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    await supabase.from("messages").insert({
      lead_id: leadId,
      sender_role: role,
      sender_id: uidRef.current,
      body: text,
    });
    setBody("");
    setBusy(false);
    load();
  }

  if (!embedded && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-hearth-700 hover:underline"
      >
        💬 Messages{messages.length ? ` (${messages.length})` : ""}
      </button>
    );
  }

  return (
    <div
      className={
        embedded
          ? "flex h-full flex-col"
          : "mt-2 rounded-lg border border-stone-200 bg-stone-50 p-3"
      }
    >
      {!embedded && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500">
            Messages
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-stone-400 hover:text-stone-600"
          >
            Close
          </button>
        </div>
      )}

      <div
        className={
          embedded
            ? "flex-1 space-y-2 overflow-y-auto"
            : "max-h-48 space-y-2 overflow-y-auto"
        }
      >
        {messages.length === 0 ? (
          <p className="text-xs text-stone-400">No messages yet — say hello.</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_role === role;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <span
                  className={`max-w-[80%] rounded-lg px-3 py-1.5 text-sm ${
                    mine
                      ? "bg-hearth-600 text-white"
                      : "border border-stone-200 bg-white text-stone-700"
                  }`}
                >
                  {m.body}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-2 flex gap-2">
        <input
          className="input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message…"
        />
        <button className="btn-primary" disabled={busy}>
          Send
        </button>
      </form>
    </div>
  );
}
