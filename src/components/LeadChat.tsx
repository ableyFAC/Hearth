"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { censor } from "@/lib/censor";
import { extractQuote, formatUSD, dollarsToCents, formatUSDCents } from "@/lib/quotes";
import { imgSrc } from "@/lib/storage";
import type { QuoteLineItem } from "@/lib/database.types";

type Msg = {
  id: string;
  sender_role: string;
  body: string;
  created_at: string;
};

// A structured quote a pro composed and sent in this thread (lead_quotes).
type Quote = {
  id: string;
  contractor_id: string;
  total_cents: number;
  line_items: QuoteLineItem[];
  note: string | null;
  status: "sent" | "accepted" | "declined" | "withdrawn";
  created_at: string;
};

// A quote or a message, merged into one feed and shown in created_at order.
type FeedItem =
  | { kind: "message"; created_at: string; data: Msg }
  | { kind: "quote"; created_at: string; data: Quote };

// The companion plain message a sent quote posts alongside itself (see
// sendQuoteAction). Its own rich card renders right next to it, so the old
// regex "Quoted $X" badge would just be noise here and is skipped for it.
const isQuoteCompanionBody = (body: string) => body.startsWith("Sent a quote:");

// System-message markers used to open/close a thread. They're stored as normal
// rows (sender_role = "system") so both sides see them with no schema change.
// A close marker starts with CLOSE_PREFIX and embeds who closed it + the reason.
const CLOSE_PREFIX = "Conversation closed";
const LEGACY_CLOSE = "Chat closed by the contractor.";
const REOPEN_BODY = "Conversation reopened.";
const isCloseMarker = (body: string) =>
  body.startsWith(CLOSE_PREFIX) || body === LEGACY_CLOSE;

// Quick reactions offered in the message menu.
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👎"];

// Photo messages reuse the same text `body` column: an uploaded image is stored
// as "[img]<public-url>" so both sides can render it without a schema change.
const IMG_PREFIX = "[img]";
const imageUrl = (b: string) => b.slice(IMG_PREFIX.length);

// A photo message is only TRUSTED as an image if its URL points at our own
// Supabase storage bucket. Without this, a user could type a message like
// "[img]javascript:alert(document.cookie)" or "[img]https://tracker/x.gif" and
// have it rendered to the other party as a clickable link / auto-loading image
// in their session (stored XSS + IP/phishing). Anything that doesn't match
// falls through to plain, escaped-text rendering.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const isSafeStorageUrl = (u: string) =>
  SUPABASE_URL !== "" &&
  u.startsWith(`${SUPABASE_URL}/storage/v1/object/`);
const isImageBody = (b: string) =>
  b.startsWith(IMG_PREFIX) && isSafeStorageUrl(imageUrl(b));

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
  title,
  subtitle,
  contractorName,
  sendQuoteAction,
  withdrawQuoteAction,
  acceptQuoteAction,
  declineQuoteAction,
}: {
  leadId: string;
  role: "homeowner" | "contractor";
  embedded?: boolean;
  title?: string;
  subtitle?: string;
  // The pro's company name, used on every quote card ("Quote from {company}")
  // regardless of which side is viewing.
  contractorName?: string;
  sendQuoteAction?: (formData: FormData) => Promise<void>;
  withdrawQuoteAction?: (formData: FormData) => Promise<void>;
  acceptQuoteAction?: (formData: FormData) => Promise<void>;
  declineQuoteAction?: (formData: FormData) => Promise<void>;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(embedded);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteRows, setQuoteRows] = useState<
    { label: string; amount: string }[]
  >([{ label: "", amount: "" }]);
  const [quoteNote, setQuoteNote] = useState("");
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [confirmWithdrawId, setConfirmWithdrawId] = useState<string | null>(
    null
  );
  const [filtered, setFiltered] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [reactions, setReactions] = useState<
    Record<string, { emoji: string; user_id: string | null }[]>
  >({});
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmUnsendId, setConfirmUnsendId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ id: string; body: string } | null>(
    null
  );
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ tempId: string; body: string }[]>([]);
  const uidRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const { data } = await supabase
      .from("messages")
      .select("id, sender_role, body, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });
    setMessages(data ?? []);

    // Structured quotes sent in this thread. If the table isn't set up yet,
    // keep whatever's on screen (optimistic) instead of wiping it.
    const { data: quoteData, error: quoteErr } = await supabase
      .from("lead_quotes")
      .select("id, contractor_id, total_cents, line_items, note, status, created_at")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });
    if (!quoteErr) setQuotes((quoteData ?? []) as unknown as Quote[]);

    // Reactions. If the table isn't set up yet, keep whatever's on screen
    // (optimistic) instead of wiping it.
    const { data: reacts, error: reactErr } = await supabase
      .from("message_reactions")
      .select("message_id, emoji, user_id")
      .eq("lead_id", leadId);
    if (!reactErr) {
      const map: Record<string, { emoji: string; user_id: string | null }[]> = {};
      for (const r of reacts ?? []) {
        (map[r.message_id] ??= []).push({ emoji: r.emoji, user_id: r.user_id });
      }
      setReactions(map);
    }

    // Read receipts: mark myself as having read this thread, then look up the
    // other side's last-read time. No-op if the lead_reads table isn't set up.
    await supabase.from("lead_reads").upsert(
      { lead_id: leadId, role, read_at: new Date().toISOString() },
      { onConflict: "lead_id,role" }
    );
    const { data: reads } = await supabase
      .from("lead_reads")
      .select("role, read_at")
      .eq("lead_id", leadId);
    const other = (reads ?? []).find((r: any) => r.role !== role);
    setOtherReadAt(other?.read_at ?? null);
  }

  useEffect(() => {
    if (!open) return;
    supabase.auth
      .getUser()
      .then(({ data }) => (uidRef.current = data.user?.id ?? null));
    load();

    // Realtime: push new messages instantly (requires Realtime enabled on the
    // `messages` table in Supabase). The slow poll stays as a safety net.
    const channel = supabase
      .channel(`lead-${leadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `lead_id=eq.${leadId}`,
        },
        () => load()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "lead_quotes",
          filter: `lead_id=eq.${leadId}`,
        },
        () => load()
      )
      .subscribe();

    const t = setInterval(load, 15000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, leadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages]);

  // Closed if the most recent system marker is a "close" (not a "reopen").
  const closed = useMemo(() => {
    const sys = messages.filter((m) => m.sender_role === "system");
    return sys.length ? isCloseMarker(sys[sys.length - 1].body) : false;
  }, [messages]);

  // Which side closed it (only they may reopen).
  const closer = useMemo(() => {
    const sys = messages.filter((m) => m.sender_role === "system");
    if (!sys.length) return null;
    const last = sys[sys.length - 1].body;
    if (!isCloseMarker(last)) return null;
    if (last.includes("by the homeowner")) return "homeowner";
    if (last.includes("by the contractor") || last === LEGACY_CLOSE)
      return "contractor";
    return null;
  }, [messages]);
  const canReopen = closer === role;

  // The most recent message I sent (status shows only under this one).
  const lastMineId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_role === role) return messages[i].id;
    }
    return null;
  }, [messages, role]);

  // Messages and quotes merged into a single feed, oldest first, so a quote
  // card shows up right where it was sent relative to the surrounding chat.
  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...messages.map((m) => ({
        kind: "message" as const,
        created_at: m.created_at,
        data: m,
      })),
      ...quotes.map((q) => ({
        kind: "quote" as const,
        created_at: q.created_at,
        data: q,
      })),
    ];
    items.sort((a, b) => a.created_at.localeCompare(b.created_at));
    return items;
  }, [messages, quotes]);

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
    // When replying, prepend a short quote of the message being replied to.
    const snippet = replyingTo
      ? replyingTo.body.replace(/\n/g, " ").slice(0, 60) +
        (replyingTo.body.length > 60 ? "…" : "")
      : "";
    const finalBody = replyingTo ? `↩︎ ${snippet}\n${clean}` : clean;
    setBody("");
    setReplyingTo(null);
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          lead_id: leadId,
          sender_role: role,
          sender_id: uid,
          body: finalBody,
        })
        .select();
      if (error || !data || data.length === 0) throw new Error("send failed");
      if (slur) {
        await supabase.from("reports").insert({
          lead_id: leadId,
          reporter_id: uid,
          reporter_role: role,
          reason: "Auto-flagged by filter: slur / hate speech",
        });
      }
      setBusy(false);
      load();
    } catch {
      // Couldn't deliver (bad connection, etc.) - keep it as a failed message.
      setBusy(false);
      setFailed((f) => [
        ...f,
        {
          tempId: `f${Date.now()}${Math.round(Math.random() * 1000)}`,
          body: finalBody,
        },
      ]);
    }
  }

  // Retry sending a message that failed.
  async function retryFailed(tempId: string, failedBody: string) {
    const uid = await ensureUid();
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          lead_id: leadId,
          sender_role: role,
          sender_id: uid,
          body: failedBody,
        })
        .select();
      if (error || !data || data.length === 0) throw new Error("retry failed");
      setFailed((f) => f.filter((x) => x.tempId !== tempId));
      setBusy(false);
      load();
    } catch {
      setBusy(false);
    }
  }

  function deleteFailed(tempId: string) {
    setFailed((f) => f.filter((x) => x.tempId !== tempId));
  }

  // Upload an image to the home-photos bucket, then post it as a photo message.
  async function sendImage(file: File) {
    if (!file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      const uid = await ensureUid();
      const ext = file.name.split(".").pop() || "jpg";
      const path = `chat/${leadId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("home-photos")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage
        .from("home-photos")
        .getPublicUrl(path);
      const { error } = await supabase.from("messages").insert({
        lead_id: leadId,
        sender_role: role,
        sender_id: uid,
        body: `${IMG_PREFIX}${pub.publicUrl}`,
      });
      if (error) throw error;
      setBusy(false);
      load();
    } catch {
      setBusy(false);
      setNotice("Could not send the photo. Please try again.");
    }
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

  // Unsend (delete) one of your own messages. The DB policy only allows this
  // for your own messages within the last hour; we mirror that in the UI.
  async function unsend(id: string) {
    setConfirmUnsendId(null);
    setBusy(true);
    // .select() returns the deleted rows. If RLS blocked the delete (policy not
    // applied), it returns an empty array even though there's no error.
    const { data, error } = await supabase
      .from("messages")
      .delete()
      .eq("id", id)
      .select();
    setBusy(false);
    if (error || !data || data.length === 0) {
      setNotice("Couldn't unsend. It isn't enabled in the database yet.");
      setTimeout(() => setNotice(null), 5000);
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== id));
    load();
  }

  // Toggle an emoji reaction on a message. Updates the UI immediately, then
  // persists to the DB (and syncs on the next load).
  async function react(messageId: string, emoji: string) {
    const uid = await ensureUid();
    if (!uid) return;
    const mineAlready = (reactions[messageId] ?? []).some(
      (r) => r.emoji === emoji && r.user_id === uid
    );

    // Optimistic update so the reaction shows the instant you tap it.
    setReactions((prev) => {
      const cur = prev[messageId] ?? [];
      const next = mineAlready
        ? cur.filter((r) => !(r.emoji === emoji && r.user_id === uid))
        : [...cur, { emoji, user_id: uid }];
      return { ...prev, [messageId]: next };
    });

    if (mineAlready) {
      await supabase
        .from("message_reactions")
        .delete()
        .eq("message_id", messageId)
        .eq("user_id", uid)
        .eq("emoji", emoji);
    } else {
      await supabase.from("message_reactions").insert({
        message_id: messageId,
        lead_id: leadId,
        user_id: uid,
        emoji,
      });
    }
    load();
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
  }

  function startReply(m: Msg) {
    setReplyingTo({ id: m.id, body: m.body });
    inputRef.current?.focus();
  }

  // Report a single (other person's) message for review.
  async function reportMessage(m: Msg) {
    setBusy(true);
    await supabase.from("reports").insert({
      lead_id: leadId,
      reporter_id: await ensureUid(),
      reporter_role: role,
      reason: `Reported message: "${m.body.slice(0, 140)}"`,
    });
    setBusy(false);
    setNotice("Message reported. Our team will review it.");
    setTimeout(() => setNotice(null), 4000);
  }

  // End the conversation (after confirmation). No reason is recorded. On the
  // homeowner side, this is the job-completion moment, so refresh the page
  // around this component too: the surrounding server page (e.g. /contractors,
  // /chats) re-fetches and its "Leave a review" prompt shows up right away
  // instead of waiting for the next manual reload.
  async function confirmClose() {
    await postSystem(`${CLOSE_PREFIX} by the ${role}.`);
    setConfirmingClose(false);
    router.refresh();
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

  // ---- Structured quote composer (pro side) --------------------------------

  function addQuoteRow() {
    setQuoteRows((rows) => [...rows, { label: "", amount: "" }]);
  }

  function removeQuoteRow(idx: number) {
    setQuoteRows((rows) => rows.filter((_, i) => i !== idx));
  }

  function updateQuoteRow(idx: number, field: "label" | "amount", value: string) {
    setQuoteRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  }

  // Live preview only: the number actually saved is computed once, server
  // side, in sendQuoteAction. Uses the same dollarsToCents helper so the two
  // can never disagree.
  const quotePreviewCents = quoteRows.reduce(
    (sum, r) => sum + (dollarsToCents(r.amount) ?? 0),
    0
  );

  async function submitQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!sendQuoteAction) return;
    const clean = quoteRows.filter(
      (r) => r.label.trim() && (dollarsToCents(r.amount) ?? 0) > 0
    );
    if (clean.length === 0) return;
    setQuoteBusy(true);
    const fd = new FormData();
    fd.set("lead_id", leadId);
    fd.set("note", quoteNote);
    for (const r of clean) {
      fd.append("label", r.label.trim());
      fd.append("amount", r.amount);
    }
    await sendQuoteAction(fd);
    setQuoteBusy(false);
    setShowQuoteForm(false);
    setQuoteRows([{ label: "", amount: "" }]);
    setQuoteNote("");
    load();
  }

  async function withdrawQuote(quoteId: string) {
    if (!withdrawQuoteAction) return;
    setConfirmWithdrawId(null);
    setBusy(true);
    const fd = new FormData();
    fd.set("quote_id", quoteId);
    await withdrawQuoteAction(fd);
    setBusy(false);
    load();
  }

  async function respondToQuote(
    quoteId: string,
    action: ((formData: FormData) => Promise<void>) | undefined
  ) {
    if (!action) return;
    setBusy(true);
    const fd = new FormData();
    fd.set("quote_id", quoteId);
    await action(fd);
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
            className="text-xs text-stone-500 hover:text-stone-600"
          >
            Close
          </button>
        </div>
      )}

      {/* Conversation header: name on the left, end/reopen on the same line. */}
      {embedded && (
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-stone-100 pb-2">
          <div className="min-w-0">
            {title && (
              <p className="truncate font-semibold text-stone-900">{title}</p>
            )}
            {subtitle && (
              <p className="truncate text-xs text-stone-500">{subtitle}</p>
            )}
          </div>
          <div className="shrink-0">
            {closed ? (
              canReopen ? (
                <button
                  type="button"
                  onClick={() => postSystem(REOPEN_BODY)}
                  disabled={busy}
                  className="text-xs font-medium text-hearth-700 hover:underline disabled:opacity-50"
                >
                  Reopen
                </button>
              ) : null
            ) : confirmingClose ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-stone-700">End?</span>
                <button
                  type="button"
                  onClick={confirmClose}
                  disabled={busy}
                  className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClose(false)}
                  className="text-xs font-medium text-stone-900 hover:text-stone-600"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClose(true)}
                disabled={busy}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Finish conversation
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className={
          embedded
            ? "flex-1 space-y-2 overflow-y-auto"
            : "max-h-48 space-y-2 overflow-y-auto"
        }
      >
        {feed.length === 0 ? (
          <p className="text-xs text-stone-500">No messages yet. Say hello.</p>
        ) : (
          feed.map((item) => {
            if (item.kind === "quote") {
              return (
                <QuoteCard
                  key={`q-${item.data.id}`}
                  quote={item.data}
                  role={role}
                  contractorName={contractorName}
                  busy={busy}
                  confirmWithdraw={confirmWithdrawId === item.data.id}
                  onAskWithdraw={() => setConfirmWithdrawId(item.data.id)}
                  onCancelWithdraw={() => setConfirmWithdrawId(null)}
                  onWithdraw={() => withdrawQuote(item.data.id)}
                  onAccept={
                    acceptQuoteAction
                      ? () => respondToQuote(item.data.id, acceptQuoteAction)
                      : undefined
                  }
                  onDecline={
                    declineQuoteAction
                      ? () => respondToQuote(item.data.id, declineQuoteAction)
                      : undefined
                  }
                />
              );
            }
            const m = item.data;
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
            // A price the contractor stated gets labelled as a quote, so it is
            // easy to spot and compare in the thread. Skipped for a quote's own
            // companion message, which already gets a rich card above/below it.
            const quote =
              m.sender_role === "contractor" &&
              !isImageBody(m.body) &&
              !isQuoteCompanionBody(m.body)
                ? extractQuote(m.body)
                : null;
            // You can unsend your own messages for up to an hour.
            const recent =
              mine && Date.now() - new Date(m.created_at).getTime() < 3_600_000;
            // Aggregate reactions by emoji with counts.
            const chips = Object.entries(
              (reactions[m.id] ?? []).reduce(
                (acc, r) => {
                  acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                  return acc;
                },
                {} as Record<string, number>
              )
            );
            return (
              <div
                key={m.id}
                className={`flex flex-col ${mine ? "items-end" : "items-start"}`}
              >
                {/* Wrapper hugs the bubble, so the hover area matches the text.
                    The action bar floats to the LEFT of the bubble. */}
                <div
                  className="group relative w-fit max-w-[80%]"
                  onMouseLeave={() => setConfirmUnsendId(null)}
                >
                  {/* Outer div is a transparent buffer (extra padding) so a
                      shaky cursor stays in the hover zone; inner pill is the UI. */}
                  <div
                    className={`absolute top-1/2 z-20 hidden -translate-y-1/2 px-2 py-3 group-hover:block ${
                      mine ? "right-full" : "left-full"
                    }`}
                  >
                    <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-stone-200 bg-white px-3 py-1.5 shadow-md">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => react(m.id, e)}
                          className="text-base leading-none transition hover:scale-125"
                        >
                          {e}
                        </button>
                      ))}
                      <span className="mx-0.5 h-3 w-px bg-stone-200" />
                      <button
                        type="button"
                        onClick={() => startReply(m)}
                        className="px-1 text-xs text-stone-500 hover:text-hearth-700"
                      >
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={() => copyText(m.body)}
                        className="px-1 text-xs text-stone-500 hover:text-hearth-700"
                      >
                        Copy
                      </button>
                      {mine && recent && (
                        <button
                          type="button"
                          onClick={() =>
                            confirmUnsendId === m.id
                              ? unsend(m.id)
                              : setConfirmUnsendId(m.id)
                          }
                          disabled={busy}
                          className="px-1 text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-50"
                        >
                          {confirmUnsendId === m.id ? "Confirm?" : "Unsend"}
                        </button>
                      )}
                      {!mine && (
                        <button
                          type="button"
                          onClick={() => reportMessage(m)}
                          disabled={busy}
                          className="px-1 text-xs text-stone-500 hover:text-red-600 disabled:opacity-50"
                        >
                          Report
                        </button>
                      )}
                    </div>
                  </div>

                  {quote != null && (
                    <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-hearth-50 px-2 py-0.5 text-[10px] font-semibold text-hearth-700">
                      💵 Quoted {formatUSD(quote)}
                    </span>
                  )}

                  {isImageBody(m.body) ? (
                    <a
                      href={imgSrc(imageUrl(m.body)) ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imgSrc(imageUrl(m.body)) ?? undefined}
                        alt="shared photo"
                        className="max-h-60 w-auto rounded-lg border border-stone-200 object-cover"
                      />
                    </a>
                  ) : (
                    <span
                      className={`block whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-sm ${
                        mine
                          ? "bg-hearth-600 text-white"
                          : "border border-stone-200 bg-white text-stone-700"
                      }`}
                    >
                      {m.body}
                    </span>
                  )}
                </div>

                {chips.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {chips.map(([emoji, count]) => (
                      <span
                        key={emoji}
                        className="rounded-full border border-stone-200 bg-white px-1.5 text-xs"
                      >
                        {emoji} {count}
                      </span>
                    ))}
                  </div>
                )}

                {mine && m.id === lastMineId && (
                  <span className="mt-0.5 text-[10px] text-stone-500">
                    {otherReadAt && otherReadAt >= m.created_at
                      ? "Seen"
                      : "Delivered"}
                  </span>
                )}
              </div>
            );
          })
        )}

        {/* Messages that failed to send. */}
        {failed.map((f) => (
          <div key={f.tempId} className="flex flex-col items-end">
            <span className="block max-w-[80%] whitespace-pre-wrap break-words rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700">
              {f.body}
            </span>
            <div className="mt-0.5 flex items-center gap-2 text-[10px]">
              <span className="text-red-500">Not delivered</span>
              <button
                type="button"
                onClick={() => retryFailed(f.tempId, f.body)}
                disabled={busy}
                className="font-medium text-hearth-700 hover:underline disabled:opacity-50"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => deleteFailed(f.tempId)}
                className="font-medium text-stone-500 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {notice && (
        <p className="mt-2 rounded-md bg-green-50 px-3 py-1.5 text-center text-xs text-green-700">
          {notice}
        </p>
      )}

      {!closed && role === "contractor" && sendQuoteAction && (
        <div className="mt-2">
          {showQuoteForm ? (
            <form
              onSubmit={submitQuote}
              className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Send a quote
              </p>
              {quoteRows.map((row, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="Line item, e.g. Labor"
                    value={row.label}
                    onChange={(e) => updateQuoteRow(idx, "label", e.target.value)}
                  />
                  <input
                    className="input w-28"
                    placeholder="$0"
                    inputMode="decimal"
                    value={row.amount}
                    onChange={(e) => updateQuoteRow(idx, "amount", e.target.value)}
                  />
                  {quoteRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeQuoteRow(idx)}
                      className="text-stone-500 hover:text-red-600"
                      aria-label="Remove line item"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addQuoteRow}
                className="text-xs font-medium text-hearth-700 hover:underline"
              >
                + Add line item
              </button>
              <textarea
                value={quoteNote}
                onChange={(e) => setQuoteNote(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Note to the homeowner (optional)"
                className="input w-full text-sm"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-stone-900">
                  Total: {formatUSDCents(quotePreviewCents)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQuoteForm(false)}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={quoteBusy || quotePreviewCents <= 0}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    Send quote
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowQuoteForm(true)}
              className="text-sm font-medium text-hearth-700 hover:underline"
            >
              💵 Send a quote
            </button>
          )}
        </div>
      )}

      {closed ? (
        <p className="mt-2 rounded-lg bg-stone-100 px-3 py-2 text-center text-xs text-stone-500">
          This conversation is finished.
          {canReopen
            ? " Reopen it above to send more messages."
            : " Only the person who ended it can reopen it."}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          {replyingTo && (
            <div className="flex items-center justify-between rounded-lg border-l-2 border-hearth-400 bg-stone-50 px-2 py-1 text-xs text-stone-500">
              <span className="truncate">
                ↩︎ {replyingTo.body.replace(/\n/g, " ").slice(0, 50)}
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="ml-2 text-stone-500 hover:text-stone-700"
              >
                ✕
              </button>
            </div>
          )}
          <form onSubmit={send} className="flex gap-2">
            <label
              title="Send a photo"
              className="flex cursor-pointer items-center rounded-lg border border-stone-200 px-3 text-lg text-stone-500 hover:border-hearth-400 hover:text-hearth-700"
            >
              🖼
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) sendImage(f);
                  e.target.value = "";
                }}
              />
            </label>
            <input
              ref={inputRef}
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
            <p className="text-xs text-amber-600">
              ⚠️ Your message was filtered to keep the chat respectful.
            </p>
          )}
        </div>
      )}

      <div className="mt-2 border-t border-stone-100 pt-2">
        {reported ? (
          <p className="text-xs text-stone-500">
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
                className="text-xs text-stone-500 hover:text-stone-600"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="text-xs text-stone-500 hover:text-red-600"
          >
            ⚠ Report chat
          </button>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<Quote["status"], string> = {
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

const STATUS_PILL_CLASS: Record<Quote["status"], string> = {
  sent: "bg-hearth-50 text-hearth-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-stone-200 text-stone-600",
  withdrawn: "bg-stone-200 text-stone-500",
};

// A structured quote, rendered inline in the thread wherever it falls by
// created_at. Homeowner gets Accept/Decline on a 'sent' quote, the pro who
// sent it gets Withdraw. Accepting only ever flips this row's status: it
// never touches choose_applicant or any money logic.
function QuoteCard({
  quote,
  role,
  contractorName,
  busy,
  confirmWithdraw,
  onAskWithdraw,
  onCancelWithdraw,
  onWithdraw,
  onAccept,
  onDecline,
}: {
  quote: Quote;
  role: "homeowner" | "contractor";
  contractorName?: string;
  busy: boolean;
  confirmWithdraw: boolean;
  onAskWithdraw: () => void;
  onCancelWithdraw: () => void;
  onWithdraw: () => void;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const mine = role === "contractor";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="w-full max-w-[85%] rounded-lg border border-stone-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-stone-900">
            Quote from {contractorName || "your pro"}
          </p>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_PILL_CLASS[quote.status]}`}
          >
            {STATUS_LABEL[quote.status]}
          </span>
        </div>

        <ul className="mt-2 space-y-1">
          {quote.line_items.map((li, idx) => (
            <li
              key={idx}
              className="flex items-center justify-between text-sm text-stone-600"
            >
              <span className="truncate pr-2">{li.label}</span>
              <span className="shrink-0">{formatUSDCents(li.amount_cents)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2">
          <span className="text-sm font-semibold text-stone-900">Total</span>
          <span className="text-sm font-semibold text-stone-900">
            {formatUSDCents(quote.total_cents)}
          </span>
        </div>

        {quote.note && (
          <p className="mt-2 whitespace-pre-wrap text-xs text-stone-500">
            {quote.note}
          </p>
        )}

        {role === "homeowner" && quote.status === "sent" && (onAccept || onDecline) && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onAccept}
              disabled={busy}
              className="btn-primary flex-1 text-sm disabled:opacity-50"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={onDecline}
              disabled={busy}
              className="btn-secondary flex-1 text-sm disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        )}

        {role === "homeowner" && quote.status === "accepted" && (
          <p className="mt-3 rounded-md bg-green-50 px-2 py-1.5 text-xs text-green-700">
            Quote accepted. Head to your{" "}
            <a href="/contractors" className="font-medium underline">
              Contractors page
            </a>{" "}
            to keep this job moving.
          </p>
        )}

        {role === "contractor" && quote.status === "sent" && (
          <div className="mt-3 flex justify-end">
            {confirmWithdraw ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500">Withdraw this quote?</span>
                <button
                  type="button"
                  onClick={onWithdraw}
                  disabled={busy}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={onCancelWithdraw}
                  className="text-xs text-stone-500 hover:text-stone-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onAskWithdraw}
                disabled={busy}
                className="text-xs font-medium text-stone-500 hover:text-red-600 disabled:opacity-50"
              >
                Withdraw
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
