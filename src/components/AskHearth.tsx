"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { logIssueFromChat, setReminderFromChat } from "@/lib/ask-actions";
import VoiceButton from "@/components/VoiceButton";
import Markdown from "@/components/Markdown";
import { track } from "@/lib/analytics";

type Msg = {
  role: "user" | "assistant";
  content: string;
  // Optional attached photo (downscaled JPEG, base64 without the data: prefix).
  image?: string;
  mime?: string;
  // When the message was sent (Date.now()); used to age messages out.
  ts?: number;
};
type Job = { category: string; timing: string; summary: string };

// Downscale a chosen photo to a small JPEG so it's cheap to send to the model
// and small enough to keep in localStorage.
async function downscaleImage(
  file: File,
  maxDim = 1024,
  quality = 0.7
): Promise<{ mime: string; data: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas context"));
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve({ mime: "image/jpeg", data: dataUrl.split(",")[1] });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// The assistant can append machine-readable [[TAG]]{...}[[/TAG]] blocks for
// actions (hire a pro, log an issue, set a reminder). Pull each out of the
// visible text and turn it into a button.
function extractBlock(
  content: string,
  tag: string
): { content: string; data: any } {
  const open = `[[${tag}]]`;
  const idx = content.indexOf(open);
  if (idx === -1) return { content, data: null };

  // Find the JSON payload by brace-matching from the first "{" after the tag.
  // This tolerates a missing or typo'd closing tag (e.g. [[/LOGISSGUE]]) AND a
  // fully UNCLOSED block, so raw {json} never leaks into the visible message.
  const after = content.slice(idx + open.length);
  const start = after.indexOf("{");
  let data: any = null;
  // Default: if we can't find a clean JSON object, strip from the tag to the
  // end of the message (the AI is told to put blocks at the very end).
  let consumedEnd = content.length;

  if (start !== -1) {
    let depth = 0;
    let end = -1;
    let inStr = false;
    let esc = false;
    for (let i = start; i < after.length; i++) {
      const ch = after[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end !== -1) {
      try {
        data = JSON.parse(after.slice(start, end + 1));
      } catch {
        /* ignore malformed block */
      }
      // Also swallow a trailing closing tag if one is present.
      const tail = after.slice(end + 1).match(/^\s*\[\[\/?[^\]]*\]\]/);
      consumedEnd = idx + open.length + end + 1 + (tail ? tail[0].length : 0);
    }
  }

  const cleaned = (content.slice(0, idx) + content.slice(consumedEnd)).trim();
  return { content: cleaned, data };
}

function parseAssistant(content: string): {
  text: string;
  job: Job | null;
  issue: any;
  reminder: any;
  options: string[] | null;
} {
  let text = content;
  let r = extractBlock(text, "POSTJOB");
  text = r.content;
  const job: Job | null = r.data
    ? {
        category: String(r.data.category ?? "other"),
        timing: String(r.data.timing ?? ""),
        summary: String(r.data.summary ?? ""),
      }
    : null;
  r = extractBlock(text, "LOGISSUE");
  text = r.content;
  const issue = r.data;
  r = extractBlock(text, "REMINDER");
  text = r.content;
  const reminder = r.data;
  // Tappable quick-reply options the assistant offers, so the homeowner rarely
  // has to type. Rendered as buttons under the message.
  r = extractBlock(text, "OPTIONS");
  text = r.content;
  const options: string[] | null = Array.isArray(r.data?.options)
    ? r.data.options.map((o: any) => String(o)).filter(Boolean).slice(0, 5)
    : null;
  // Safety net: strip any leftover machine block / stray bracket markers so the
  // user never sees raw [[...]] text.
  text = text
    .replace(/\[\[[A-Za-z/]+\]\][\s\S]*?\[\[\/?[^\]]*\]\]/g, "")
    .replace(/\[\[\/?[^\]]*\]\]/g, "")
    .trim();
  return { text, job, issue, reminder, options };
}

function jobHref(job: Job): string {
  const params = new URLSearchParams();
  if (job.category) params.set("category", job.category);
  if (job.timing) params.set("timing", job.timing);
  if (job.summary) params.set("desc", job.summary);
  return `/contractors?${params.toString()}`;
}

// A button that runs a server action once, then shows a confirmation.
function ActionButton({
  label,
  doneLabel,
  onApply,
}: {
  label: string;
  doneLabel: string;
  onApply: () => Promise<void>;
}) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (done)
    return (
      <span className="inline-block text-xs font-medium text-green-600">
        {doneLabel}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            await onApply();
            setDone(true);
          } catch {
            setFailed(true);
            setBusy(false);
          }
        }}
        className="inline-block rounded-lg bg-hearth-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hearth-700 disabled:opacity-50"
      >
        {busy ? "…" : failed ? "Try again" : label}
      </button>
      {failed && (
        <span className="text-xs text-red-600">Didn&apos;t save</span>
      )}
    </span>
  );
}

// When the AI wants to BOTH log an issue to the home record AND post a job, it's
// one intent for the homeowner - so it's one button: log the issue, then go
// straight to the prefilled job posting.
function LogAndPostButton({ job, issue }: { job: Job; issue: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        // Log it to the home record first; even if that hiccups, still let them
        // post the job rather than blocking on it.
        try {
          await logIssueFromChat(issue);
        } catch {
          /* ignore - proceed to post */
        }
        track("post_job_from_chat", { category: job.category });
        router.push(jobHref(job));
      }}
      className="inline-block rounded-lg bg-hearth-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hearth-700 disabled:opacity-50"
    >
      {busy ? "…" : "📋 Log & post this job"}
    </button>
  );
}

function MessageActions({
  job,
  issue,
  reminder,
}: {
  job: Job | null;
  issue: any;
  reminder: any;
}) {
  if (!job && !issue && !reminder) return null;
  // Both at once -> a single combined button.
  const combined = job && issue;
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {combined ? (
        <LogAndPostButton job={job} issue={issue} />
      ) : (
        <>
          {job && (
            <Link
              href={jobHref(job)}
              onClick={() =>
                track("post_job_from_chat", { category: job.category })
              }
              className="btn-primary flex-col gap-0.5 py-2 leading-tight"
            >
              <span className="text-sm font-semibold">
                Get 3 free quotes
              </span>
              <span className="text-[11px] font-normal text-hearth-100">
                Vetted local pros compete for your job
              </span>
            </Link>
          )}
          {issue && (
            <ActionButton
              label="✅ Log to home record"
              doneLabel="✓ Logged to home record"
              onApply={() => logIssueFromChat(issue)}
            />
          )}
        </>
      )}
      {reminder && (
        <ActionButton
          label="🔔 Set a reminder"
          doneLabel="✓ Reminder set"
          onApply={() => setReminderFromChat(reminder)}
        />
      )}
    </div>
  );
}

// One shared conversation kept in localStorage: it survives reloads, and
// messages age out per the retention setting below (default: 24 hours), pruned
// by each message's own timestamp on load. Keys are namespaced per user id
// (e.g. "hearth_ask_chat:<uuid>") so chats can't leak between accounts on a
// shared device; the bare legacy keys are only used while the id loads. The
// key BASES are props so a separate mount (e.g. the pro copilot) stores its
// own conversation without colliding with the homeowner chat.
const DEFAULT_STORAGE_KEY = "hearth_ask_chat";
const DEFAULT_RETENTION_KEY = "hearth_ask_retention";
const SYNC_EVENT = "hearth:ask-updated";

type Retention = "24h" | "2w" | "1m" | "never";
const RETENTION_MS: Record<Retention, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "2w": 14 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  never: Infinity,
};
// Even on "never", cap the history so localStorage can't bloat.
const MAX_MESSAGES = 200;

function loadRetention(key: string): Retention {
  try {
    const r = localStorage.getItem(key);
    if (r === "24h" || r === "2w" || r === "1m" || r === "never") return r;
  } catch {
    /* ignore */
  }
  return "24h";
}

// Drop messages older than the retention window (by their own timestamp, so
// history rolls off gradually), then cap the count. Messages without a
// timestamp (the greeting) are kept.
function prune(msgs: Msg[], retention: Retention): Msg[] {
  const cutoff = Date.now() - RETENTION_MS[retention];
  const kept =
    retention === "never"
      ? msgs
      : msgs.filter((m) => !m.ts || m.ts >= cutoff);
  return kept.slice(-MAX_MESSAGES);
}
const DEFAULT_GREETING =
  "Hi, I'm Hearth. If you have any questions about your home, feel free to ask.";
const DEFAULT_HEADING_TITLE = "✨ Ask Hearth";
const DEFAULT_HEADING_SUBTITLE =
  "Your home assistant. Answers use your systems, ages, and any issues.";
const DEFAULT_DISCLAIMER =
  "Hearth's cost figures are ballpark estimates. Confirm with a local pro before you commit.";

// `fill` = take the full height of its container (the Messages pane); otherwise
// it renders as a compact card (Home / Learn). `suggestions` are starter
// questions shown as chips until the owner asks something. `greeting` is an
// optional personalized opener (e.g. referencing their systems/issues).
// `initialQuestion` is a question handed to a freshly mounted instance (the
// dock opening in response to "hearth:ask-question"); it is submitted once.
export default function AskHearth({
  fill = false,
  suggestions,
  greeting,
  initialQuestion,
  endpoint = "/api/ask",
  storageKeyBase = DEFAULT_STORAGE_KEY,
  retentionKeyBase = DEFAULT_RETENTION_KEY,
  headingTitle = DEFAULT_HEADING_TITLE,
  headingSubtitle = DEFAULT_HEADING_SUBTITLE,
  disclaimer = DEFAULT_DISCLAIMER,
}: {
  fill?: boolean;
  suggestions?: string[];
  greeting?: string;
  initialQuestion?: string;
  // Which API to talk to and where to keep the conversation. Defaults keep the
  // homeowner "Ask Hearth" behavior identical; the pro copilot overrides them.
  endpoint?: string;
  storageKeyBase?: string;
  retentionKeyBase?: string;
  headingTitle?: string;
  headingSubtitle?: string;
  disclaimer?: string;
}) {
  // Local aliases so the per-user namespacing and legacy migration below read
  // exactly as before, just off the prop bases.
  const STORAGE_KEY = storageKeyBase;
  const RETENTION_KEY = retentionKeyBase;
  const GREETING: Msg = {
    role: "assistant",
    content: greeting || DEFAULT_GREETING,
  };
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [retention, setRetention] = useState<Retention>("24h");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    mime: string;
    data: string;
  } | null>(null);
  const [imageError, setImageError] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<(t: string) => void>(() => {});

  // Which account's chat this is. Until the id loads (or if it can't), fall
  // back to the legacy shared keys so nothing breaks.
  const [userId, setUserId] = useState<string | null>(null);
  const [userReady, setUserReady] = useState(false);
  const storageKey = userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
  const retentionKey = userId ? `${RETENTION_KEY}:${userId}` : RETENTION_KEY;

  // Resolve the signed-in user once, and migrate any legacy shared-key chat to
  // the per-user key (then remove the legacy key so the next account on this
  // device can't see it).
  useEffect(() => {
    let cancelled = false;
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        if (cancelled) return;
        if (user) {
          try {
            const chatKey = `${STORAGE_KEY}:${user.id}`;
            const legacyChat = localStorage.getItem(STORAGE_KEY);
            if (legacyChat !== null) {
              if (localStorage.getItem(chatKey) === null) {
                localStorage.setItem(chatKey, legacyChat);
              }
              localStorage.removeItem(STORAGE_KEY);
            }
            const retKey = `${RETENTION_KEY}:${user.id}`;
            const legacyRet = localStorage.getItem(RETENTION_KEY);
            if (legacyRet !== null) {
              if (localStorage.getItem(retKey) === null) {
                localStorage.setItem(retKey, legacyRet);
              }
              localStorage.removeItem(RETENTION_KEY);
            }
          } catch {
            /* ignore */
          }
          setUserId(user.id);
        }
        setUserReady(true);
      })
      .catch(() => {
        if (!cancelled) setUserReady(true); // stay on the legacy keys
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the conversation on mount (and again once the per-user key resolves),
  // prune anything older than the retention window, and sync with other
  // instances on this page (dock + Messages).
  useEffect(() => {
    function read() {
      const r = loadRetention(retentionKey);
      setRetention(r);
      try {
        const raw = localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : null;
        const pruned = Array.isArray(parsed) ? prune(parsed, r) : [];
        if (Array.isArray(parsed) && pruned.length !== parsed.length) {
          localStorage.setItem(storageKey, JSON.stringify(pruned));
        }
        setMessages(pruned.length ? pruned : [GREETING]);
      } catch {
        /* ignore */
      }
    }
    function onSync(e: Event) {
      // Ignore updates for a different key (e.g. another instance already on
      // the per-user key while this one is still on the legacy key).
      const k = (e as CustomEvent).detail?.key;
      if (typeof k === "string" && k !== storageKey) return;
      read();
    }
    read();
    window.addEventListener(SYNC_EVENT, onSync);
    return () => window.removeEventListener(SYNC_EVENT, onSync);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, retentionKey]);

  // Save the conversation and notify other open instances on this page. Only on
  // real user turns, so loading a saved chat can't overwrite it.
  function persist(msgs: Msg[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(prune(msgs, retention)));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENT, { detail: { key: storageKey } })
    );
  }

  function clearChat() {
    setMessages([GREETING]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENT, { detail: { key: storageKey } })
    );
  }

  // Save the new window and apply it right away; other instances pick it up
  // via the sync event.
  function changeRetention(r: Retention) {
    setRetention(r);
    try {
      localStorage.setItem(retentionKey, r);
      const pruned = prune(messages, r);
      setMessages(pruned.length ? pruned : [GREETING]);
      localStorage.setItem(storageKey, JSON.stringify(pruned));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(
      new CustomEvent(SYNC_EVENT, { detail: { key: storageKey } })
    );
  }

  useEffect(() => {
    // Scroll to the newest message, but only within the chat's own scroll
    // container (block: nearest) - never the page.
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, loading]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    submit(input.trim());
  }

  async function submit(text: string) {
    if ((!text && !pendingImage) || loading) return;
    const userMsg: Msg = {
      role: "user",
      content: text || (pendingImage ? "Here's a photo - what is this?" : ""),
      ts: Date.now(),
      ...(pendingImage
        ? { image: pendingImage.data, mime: pendingImage.mime }
        : {}),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    persist(next);
    setInput("");
    setPendingImage(null);
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Drop the leading canned greeting before sending history to the model.
        body: JSON.stringify({
          messages: next.filter((m, i) => !(i === 0 && m.role === "assistant")),
        }),
      });
      const data = await res.json();
      const updated: Msg[] = [
        ...next,
        {
          role: "assistant",
          content: data.answer ?? data.error ?? "Something went wrong.",
          ts: Date.now(),
        },
      ];
      setMessages(updated);
      persist(updated);
    } catch {
      const updated: Msg[] = [
        ...next,
        {
          role: "assistant",
          content: "Something went wrong. Please try again.",
          ts: Date.now(),
        },
      ];
      setMessages(updated);
      persist(updated);
    } finally {
      setLoading(false);
    }
  }
  submitRef.current = submit;

  // Answer questions fired from elsewhere in the app (Learn's "Maintenance
  // basics" cards, the forecast plan button). Every mounted instance listens;
  // the first one to see the event claims it via a flag on the event object
  // (listeners run synchronously in registration order), so when two instances
  // exist (Learn's inline box + the dock) exactly one submits.
  useEffect(() => {
    function onAsk(e: Event) {
      if ((e as any).__hearthHandled) return;
      (e as any).__hearthHandled = true;
      const q = (e as CustomEvent).detail;
      if (typeof q === "string") submitRef.current(q);
    }
    window.addEventListener("hearth:ask-question", onAsk);
    return () => window.removeEventListener("hearth:ask-question", onAsk);
  }, []);

  // Submit a question handed in by the dock when it opened for an event that
  // fired while it was closed. Wait until the per-user storage key and saved
  // conversation have loaded (userReady + a timeout past this commit) so the
  // submit can't clobber the stored history, and guard with a ref so it fires
  // exactly once.
  const initialSentRef = useRef(false);
  useEffect(() => {
    if (!initialQuestion || !userReady || initialSentRef.current) return;
    initialSentRef.current = true;
    const t = setTimeout(() => submitRef.current(initialQuestion), 0);
    return () => clearTimeout(t);
  }, [initialQuestion, userReady]);

  async function onPickImage(file: File) {
    setImageError(false);
    try {
      setPendingImage(await downscaleImage(file));
    } catch {
      // Couldn't read/shrink the image (corrupt, unsupported, too big) - tell
      // the homeowner instead of silently dropping it.
      setImageError(true);
    }
  }

  // One message bubble (text + optional photo + action buttons).
  function bubble(m: Msg, i: number, isLast = false) {
    const parsed =
      m.role === "assistant"
        ? parseAssistant(m.content)
        : {
            text: m.content,
            job: null,
            issue: null,
            reminder: null,
            options: null as string[] | null,
          };
    return (
      <div
        key={i}
        className={`flex flex-col ${
          m.role === "user" ? "items-end" : "items-start"
        }`}
      >
        {m.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:${m.mime ?? "image/jpeg"};base64,${m.image}`}
            alt="attached"
            className="mb-1 max-h-48 rounded-lg border border-stone-200 object-cover"
          />
        )}
        {parsed.text && (
          <span
            className={`block max-w-[85%] break-words rounded-lg px-3 py-1.5 text-sm ${
              m.role === "user"
                ? "whitespace-pre-wrap bg-hearth-600 text-white"
                : "border border-stone-200 bg-white text-stone-700"
            }`}
          >
            {m.role === "assistant" ? (
              <Markdown text={parsed.text} />
            ) : (
              parsed.text
            )}
          </span>
        )}
        <MessageActions
          job={parsed.job}
          issue={parsed.issue}
          reminder={parsed.reminder}
        />
        {/* Tappable quick-reply options, shown on the latest reply so the
            homeowner can drill down without typing. */}
        {parsed.options && isLast && !loading && (
          <div className="mt-2 flex flex-wrap gap-2">
            {parsed.options
              // Drop any "Other" the model added; we always add our own below.
              .filter((opt) => !/^(other|something else)\b/i.test(opt.trim()))
              .map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => submit(opt)}
                  disabled={loading}
                  className="rounded-full border border-hearth-300 bg-white px-3 py-1 text-xs font-medium text-hearth-800 hover:bg-hearth-50 disabled:opacity-50"
                >
                  {opt}
                </button>
              ))}
            {/* Always let them type their own answer instead of picking. */}
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-500 hover:bg-stone-50"
            >
              Other (type)
            </button>
          </div>
        )}
      </div>
    );
  }

  // Retention control: which of the compact card and dock views renders it
  // depends on `fill` (see below) - kept as one element so the two views
  // can't drift on wording or options.
  const retentionControl = (
    <p className="text-[11px] text-stone-500">
      {retention === "never" ? "Chats are kept " : "Chats clear after "}
      <select
        value={retention}
        onChange={(e) => changeRetention(e.target.value as Retention)}
        aria-label="How long chats are kept"
        className="cursor-pointer appearance-none border-0 bg-transparent p-0 text-[11px] text-stone-500 underline decoration-dotted hover:text-stone-600 focus:outline-none"
      >
        <option value="24h">24 hours</option>
        <option value="2w">2 weeks</option>
        <option value="1m">1 month</option>
        <option value="never">forever</option>
      </select>
    </p>
  );

  // The input row: photo attach + text + send. Shared by both views.
  const composer = (
    <div>
      {pendingImage && (
        <div className="mb-2 inline-flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${pendingImage.mime};base64,${pendingImage.data}`}
            alt="attachment preview"
            className="h-12 w-12 rounded object-cover"
          />
          <button
            type="button"
            onClick={() => setPendingImage(null)}
            className="text-xs text-stone-500 hover:text-red-600"
          >
            Remove
          </button>
        </div>
      )}
      {imageError && (
        <p className="mb-2 text-xs text-red-600">
          Couldn&apos;t attach that image. Try a different photo.
        </p>
      )}
      <form onSubmit={send} className="flex gap-2">
        <label
          title="Attach a photo"
          className="flex cursor-pointer items-center rounded-lg border border-stone-200 px-2 text-lg text-stone-500 hover:border-hearth-400 hover:text-hearth-700"
        >
          🖼
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={loading}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) await onPickImage(f);
              e.target.value = "";
            }}
          />
        </label>
        <VoiceButton
          disabled={loading}
          onText={(t) =>
            setInput((prev) => (prev ? `${prev} ${t}` : t))
          }
        />
        <input
          ref={inputRef}
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask, speak, or attach a photo…"
        />
        <button className="btn-primary" disabled={loading}>
          {fill ? "Send" : "Ask"}
        </button>
      </form>
      <p className="mt-1 text-[11px] text-stone-500">{disclaimer}</p>
      {/* In the dock (fill), this control moves to the header instead - */}
      {/* down here it sat below the whole conversation, off-screen until */}
      {/* scrolled to. The compact card has no such scroll, so it stays put. */}
      {!fill && <div className="mt-0.5">{retentionControl}</div>}
    </div>
  );

  // Learn's assistant: a bounded, SCROLLABLE conversation (follow-ups stay
  // visible), with starter chips and a clear button at the bottom.
  if (!fill) {
    // Drop the canned greeting here - the suggestions are the starting point.
    const displayed = messages.filter(
      (m, i) => !(i === 0 && m.role === "assistant")
    );
    const hasConversation = displayed.length > 0;
    return (
      <div className="card border-hearth-200 bg-hearth-50">
        <p className="text-sm font-semibold text-hearth-900">{headingTitle}</p>
        <p className="text-xs text-hearth-700">{headingSubtitle}</p>

        {(hasConversation || loading) && (
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto rounded-lg border border-stone-200 bg-white p-3">
            {displayed.map((m, i) => bubble(m, i, i === displayed.length - 1))}
            {loading && (
              <div className="flex justify-start">
                <span className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-500">
                  Thinking…
                </span>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}

        {suggestions && suggestions.length > 0 && !hasConversation && (
          <div className="mt-3 flex flex-wrap gap-2">
            {suggestions.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => submit(q)}
                disabled={loading}
                className="rounded-full border border-hearth-200 bg-white px-3 py-1 text-xs text-hearth-800 hover:border-hearth-400 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div className="mt-3">{composer}</div>

        {hasConversation && (
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={clearChat}
              className="text-sm font-medium text-stone-500 hover:text-red-600"
            >
              Clear conversation
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2 pb-2">
        <div>
          <p className="text-sm font-semibold text-hearth-900">{headingTitle}</p>
          <p className="text-xs text-hearth-700">{headingSubtitle}</p>
        </div>
        {/* Surfaced here (next to Clear) instead of only below the input: */}
        {/* the dock is short and scrollable, and buried at the bottom it */}
        {/* was easy to never see. */}
        <div className="flex shrink-0 flex-col items-end gap-1">
          {retentionControl}
          <button
            type="button"
            onClick={clearChat}
            className="text-xs text-stone-500 hover:text-stone-700"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-2">
        {messages.map((m, i) => bubble(m, i, i === messages.length - 1))}
        {loading && (
          <div className="flex justify-start">
            <span className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-500">
              Thinking…
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="mt-2">{composer}</div>
    </div>
  );
}
