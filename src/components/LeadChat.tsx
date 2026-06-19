"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { censor } from "@/lib/censor";

type Msg = {
  id: string;
  sender_role: string;
  body: string;
  created_at: string;
};

// System-message markers used to open/close a thread. They're stored as normal
// rows (sender_role = "system") so both sides see them with no schema change.
const CLOSE_BODY = "Chat closed by the contractor.";
const REOPEN_BODY = "Chat reopened.";

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
  const [filtered, setFiltered] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);
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

  // Closed if the most recent system marker is a "close" (not a "reopen").
  const closed = useMemo(() => {
    const sys = messages.filter((m) => m.sender_role === "system");
    return sys.length ? sys[sys.length - 1].body === CLOSE_BODY : false;
  }, [messages]);

  async function ensureUid() {
    if (!uidRef.current) {
      const { data } = await supabase.auth.getUser();
      uidRef.current = data.user?.id ?? null;
    }
    return uidRef.current;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || closed) return;
    // Mask profanity before the message is stored; slurs also auto-report.
    const { clean, flagged, slur } = censor(text);
    setFiltered(flagged);
    setBusy(true);
    const uid = await ensureUid();
    await supabase.from("messages").insert({
      lead_id: leadId,
      sender_role: role,
      sender_id: uid,
      body: clean,
    });
    if (slur) {
      await supabase.from("reports").insert({
        lead_id: leadId,
        reporter_id: uid,
        reporter_role: role,
        reason: "Auto-flagged by filter: slur / hate speech",
      });
    }
    setBody("");
    setBusy(false);
    load();
  }

  // Post a system marker to close or reopen the thread.
  async function postSystem(text: string) {
    setBusy(true);
    await supabase.from("messages").insert({
      lead_id: leadId,
      sender_role: "system",
      sender_id: await ensureUid(),
      body: text,
    });
    setBusy(false);
    load();
  }

  // Flag this conversation for the Hearth team to review.
  async function submitReport() {
    setBusy(true);
    await supabase.from("reports").insert({
      lead_id: leadId,
      reporter_id: await ensureUid(),
      reporter_role: role,
      reason: reportReason.trim() || null,
    });
    setBusy(false);
    setReporting(false);
    setReported(true);
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

      {/* Contractor-only close/reopen control (shown in the inbox thread). */}
      {embedded && role === "contractor" && (
        <div className="mb-2 flex justify-end">
          {closed ? (
            <button
              type="button"
              onClick={() => postSystem(REOPEN_BODY)}
              disabled={busy}
              className="text-xs font-medium text-hearth-700 hover:underline disabled:opacity-50"
            >
              Reopen chat
            </button>
          ) : (
            <button
              type="button"
              onClick={() => postSystem(CLOSE_BODY)}
              disabled={busy}
              className="text-xs font-medium text-stone-400 hover:text-red-600 disabled:opacity-50"
            >
              Close chat
            </button>
          )}
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
            if (m.sender_role === "system") {
              return (
                <div key={m.id} className="flex justify-center">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs text-stone-500">
                    {m.body}
                  </span>
                </div>
              );
            }
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

      {closed ? (
        <p className="mt-2 rounded-lg bg-stone-100 px-3 py-2 text-center text-xs text-stone-500">
          This chat is closed.
          {role === "contractor" ? " Reopen it to send more messages." : ""}
        </p>
      ) : (
        <div className="mt-2">
          <form onSubmit={send} className="flex gap-2">
            <input
              className="input"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (filtered) setFiltered(false);
              }}
              placeholder="Type a message…"
            />
            <button className="btn-primary" disabled={busy}>
              Send
            </button>
          </form>
          {filtered && (
            <p className="mt-1 text-xs text-amber-600">
              ⚠️ Your message was filtered to keep the chat respectful.
            </p>
          )}
        </div>
      )}

      <div className="mt-2 border-t border-stone-100 pt-2">
        {reported ? (
          <p className="text-xs text-stone-400">
            ✓ Reported. Our team will review this conversation.
          </p>
        ) : reporting ? (
          <div className="space-y-2">
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              rows={2}
              placeholder="What's the problem? (optional)"
              className="input w-full text-sm"
            />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={submitReport}
                disabled={busy}
                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
              >
                Submit report
              </button>
              <button
                type="button"
                onClick={() => setReporting(false)}
                className="text-xs text-stone-400 hover:text-stone-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="text-xs text-stone-400 hover:text-red-600"
          >
            ⚠ Report chat
          </button>
        )}
      </div>
    </div>
  );
}
