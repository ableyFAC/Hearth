"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logIssueFromChat, setReminderFromChat } from "@/lib/ask-actions";

type Msg = {
  role: "user" | "assistant";
  content: string;
  // Optional attached photo (downscaled JPEG, base64 without the data: prefix).
  image?: string;
  mime?: string;
};
type Job = { category: string; timing: string; summary: string };

// Downscale a chosen photo to a small JPEG so it's cheap to send to the model
// and small enough to keep in sessionStorage.
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
  // Tolerate a malformed/typo'd closing tag (e.g. [[/LOGISSGUE]]): match the
  // exact opening, then content, up to the NEXT bracket marker of any kind.
  const re = new RegExp(
    `\\[\\[${tag}\\]\\]([\\s\\S]*?)\\[\\[\\/?[^\\]]*\\]\\]`
  );
  const m = content.match(re);
  if (!m) return { content, data: null };
  let data: any = null;
  try {
    data = JSON.parse(m[1].trim());
  } catch {
    /* ignore malformed block */
  }
  return { content: content.replace(m[0], "").trim(), data };
}

function parseAssistant(content: string): {
  text: string;
  job: Job | null;
  issue: any;
  reminder: any;
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
  // Safety net: strip any leftover machine block / stray bracket markers so the
  // user never sees raw [[...]] text.
  text = text
    .replace(/\[\[[A-Za-z/]+\]\][\s\S]*?\[\[\/?[^\]]*\]\]/g, "")
    .replace(/\[\[\/?[^\]]*\]\]/g, "")
    .trim();
  return { text, job, issue, reminder };
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
  if (done)
    return (
      <span className="inline-block text-xs font-medium text-green-600">
        {doneLabel}
      </span>
    );
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await onApply();
          setDone(true);
        } catch {
          setBusy(false);
        }
      }}
      className="inline-block rounded-lg bg-hearth-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hearth-700 disabled:opacity-50"
    >
      {busy ? "…" : label}
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
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {job && (
        <Link
          href={jobHref(job)}
          className="inline-block rounded-lg bg-hearth-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hearth-700"
        >
          📋 Post this job
        </Link>
      )}
      {issue && (
        <ActionButton
          label="✅ Log to home record"
          doneLabel="✓ Logged to home record"
          onApply={() => logIssueFromChat(issue)}
        />
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

// One shared conversation kept in sessionStorage: it carries across in-app
// navigation within a session, but auto-clears when the tab/app is closed OR
// refreshed, so a returning user doesn't see stale text.
const STORAGE_KEY = "hearth_ask_chat";
const SYNC_EVENT = "hearth:ask-updated";
// Module-scoped: true once we've handled the very first mount of this page load
// (so a reload clears the chat once, not on every in-app navigation).
let pageLoadHandled = false;
const DEFAULT_GREETING =
  "Hi, I'm Hearth. If you have any questions about your home, feel free to ask.";

// `fill` = take the full height of its container (the Messages pane); otherwise
// it renders as a compact card (Home / Learn). `suggestions` are starter
// questions shown as chips until the owner asks something. `greeting` is an
// optional personalized opener (e.g. referencing their systems/issues).
export default function AskHearth({
  fill = false,
  suggestions,
  greeting,
}: {
  fill?: boolean;
  suggestions?: string[];
  greeting?: string;
}) {
  const GREETING: Msg = {
    role: "assistant",
    content: greeting || DEFAULT_GREETING,
  };
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    mime: string;
    data: string;
  } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<(t: string) => void>(() => {});

  // Load the conversation on mount, and sync with other instances on this page
  // (dock + Messages). A real page RELOAD clears it once so stale text isn't
  // shown; in-app navigation within the session keeps it.
  useEffect(() => {
    function read() {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        setMessages(
          Array.isArray(parsed) && parsed.length ? parsed : [GREETING]
        );
      } catch {
        /* ignore */
      }
    }
    if (!pageLoadHandled) {
      pageLoadHandled = true;
      let reloaded = false;
      try {
        const nav = performance.getEntriesByType("navigation")[0] as any;
        reloaded = nav?.type === "reload";
      } catch {
        /* ignore */
      }
      if (reloaded) {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
        setMessages([GREETING]);
      } else {
        read();
      }
    } else {
      read();
    }
    window.addEventListener(SYNC_EVENT, read);
    return () => window.removeEventListener(SYNC_EVENT, read);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save the conversation and notify other open instances on this page. Only on
  // real user turns, so loading a saved chat can't overwrite it.
  function persist(msgs: Msg[]) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(SYNC_EVENT));
  }

  function clearChat() {
    setMessages([GREETING]);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(SYNC_EVENT));
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
      const res = await fetch("/api/ask", {
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
        },
      ];
      setMessages(updated);
      persist(updated);
    } catch {
      const updated: Msg[] = [
        ...next,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ];
      setMessages(updated);
      persist(updated);
    } finally {
      setLoading(false);
    }
  }
  submitRef.current = submit;

  // The Learn box answers questions fired from the "Maintenance basics" cards.
  useEffect(() => {
    if (fill) return;
    function onAsk(e: Event) {
      const q = (e as CustomEvent).detail;
      if (typeof q === "string") submitRef.current(q);
    }
    window.addEventListener("hearth:ask-question", onAsk);
    return () => window.removeEventListener("hearth:ask-question", onAsk);
  }, [fill]);

  async function onPickImage(file: File) {
    try {
      setPendingImage(await downscaleImage(file));
    } catch {
      /* ignore */
    }
  }

  // One message bubble (text + optional photo + action buttons).
  function bubble(m: Msg, i: number) {
    const parsed =
      m.role === "assistant"
        ? parseAssistant(m.content)
        : { text: m.content, job: null, issue: null, reminder: null };
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
            className={`block max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-sm ${
              m.role === "user"
                ? "bg-hearth-600 text-white"
                : "border border-stone-200 bg-white text-stone-700"
            }`}
          >
            {parsed.text}
          </span>
        )}
        <MessageActions
          job={parsed.job}
          issue={parsed.issue}
          reminder={parsed.reminder}
        />
      </div>
    );
  }

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
            className="text-xs text-stone-400 hover:text-red-600"
          >
            Remove
          </button>
        </div>
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
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask or attach a photo…"
        />
        <button className="btn-primary" disabled={loading}>
          {fill ? "Send" : "Ask"}
        </button>
      </form>
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
        <p className="text-sm font-semibold text-hearth-900">✨ Ask Hearth</p>
        <p className="text-xs text-hearth-700">
          Your home assistant. Answers use your systems, ages, and any issues.
        </p>

        {(hasConversation || loading) && (
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto rounded-lg border border-stone-200 bg-white p-3">
            {displayed.map((m, i) => bubble(m, i))}
            {loading && (
              <div className="flex justify-start">
                <span className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-400">
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
          <p className="text-sm font-semibold text-hearth-900">✨ Ask Hearth</p>
          <p className="text-xs text-hearth-700">
            Your home assistant. Answers use your systems and their ages.
          </p>
        </div>
        <button
          type="button"
          onClick={clearChat}
          className="shrink-0 text-xs text-stone-400 hover:text-stone-700"
        >
          Clear
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto py-2">
        {messages.map((m, i) => bubble(m, i))}
        {loading && (
          <div className="flex justify-start">
            <span className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-400">
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
