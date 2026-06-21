"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logIssueFromChat, setReminderFromChat } from "@/lib/ask-actions";

type Msg = { role: "user" | "assistant"; content: string };
type Job = { category: string; timing: string; summary: string };

// The assistant can append machine-readable [[TAG]]{...}[[/TAG]] blocks for
// actions (hire a pro, log an issue, set a reminder). Pull each out of the
// visible text and turn it into a button.
function extractBlock(
  content: string,
  tag: string
): { content: string; data: any } {
  const re = new RegExp(`\\[\\[${tag}\\]\\]([\\s\\S]*?)\\[\\[\\/${tag}\\]\\]`);
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

// One shared, persisted conversation so the chat carries across Home, Learn, and
// Messages (and survives a refresh).
const STORAGE_KEY = "hearth_ask_chat";
const SYNC_EVENT = "hearth:ask-updated";
const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi, I'm Hearth. If you have any questions about your home, feel free to ask.",
};

// `fill` = take the full height of its container (the Messages pane); otherwise
// it renders as a compact card (Home / Learn).
export default function AskHearth({ fill = false }: { fill?: boolean }) {
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Load the saved conversation on mount, pick up changes from other tabs
  // (storage event), and from other instances on THIS page (custom event - the
  // dock and the Messages pane can be open together).
  useEffect(() => {
    function sync() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        setMessages(
          Array.isArray(parsed) && parsed.length ? parsed : [GREETING]
        );
      } catch {
        /* ignore */
      }
    }
    sync();
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) sync();
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener(SYNC_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SYNC_EVENT, sync);
    };
  }, []);

  // Save the conversation and notify any other open instances on this page.
  // Called only on real user turns (never on mount), so loading a saved chat
  // can't accidentally overwrite it.
  function persist(msgs: Msg[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(SYNC_EVENT));
  }

  function clearChat() {
    setMessages([GREETING]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(SYNC_EVENT));
  }

  useEffect(() => {
    // Only the full-height Messages pane auto-scrolls, and only within its own
    // scroll container - never the page (that was shoving Home/Learn down).
    if (!fill) return;
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, loading, fill]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user", content: text } as Msg];
    setMessages(next);
    persist(next);
    setInput("");
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

  // Compact "line by line" box for Home / Learn: just the input and the latest
  // answer. The full back-and-forth still lives in the shared conversation, so
  // Messages shows the whole thread.
  if (!fill) {
    const lastRaw =
      [...messages].reverse().find((m) => m.role === "assistant")?.content ??
      null;
    const last = lastRaw ? parseAssistant(lastRaw) : null;
    return (
      <div className="card border-hearth-200 bg-hearth-50">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-hearth-900">✨ Ask Hearth</p>
          <button
            type="button"
            onClick={clearChat}
            className="text-xs text-stone-400 hover:text-stone-700"
          >
            Clear
          </button>
        </div>
        <p className="text-xs text-hearth-700">
          Your home assistant. Answers use your systems and their ages.
        </p>
        <form onSubmit={send} className="mt-3 flex gap-2">
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your home…"
          />
          <button className="btn-primary" disabled={loading}>
            Ask
          </button>
        </form>
        {loading ? (
          <p className="mt-3 text-sm text-stone-400">Thinking…</p>
        ) : last ? (
          <div className="mt-3 rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-700">
            <p className="whitespace-pre-wrap">{last.text}</p>
            <MessageActions
              job={last.job}
              issue={last.issue}
              reminder={last.reminder}
            />
          </div>
        ) : null}
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
        {messages.map((m, i) => {
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
              <span
                className={`block max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-sm ${
                  m.role === "user"
                    ? "bg-hearth-600 text-white"
                    : "border border-stone-200 bg-white text-stone-700"
                }`}
              >
                {parsed.text}
              </span>
              <MessageActions
                job={parsed.job}
                issue={parsed.issue}
                reminder={parsed.reminder}
              />
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <span className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-400">
              Thinking…
            </span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="mt-2 flex gap-2">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your home…"
        />
        <button className="btn-primary" disabled={loading}>
          Send
        </button>
      </form>
    </div>
  );
}
