"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Msg = { role: "user" | "assistant"; content: string };
type Job = { category: string; timing: string; summary: string };

// The assistant appends a [[POSTJOB]]{...}[[/POSTJOB]] block when the owner wants
// to hire. Pull it out so we can show a prefilled "Post this job" button and not
// render the raw block.
function parseJob(content: string): { text: string; job: Job | null } {
  const m = content.match(/\[\[POSTJOB\]\]([\s\S]*?)\[\[\/POSTJOB\]\]/);
  if (!m) return { text: content, job: null };
  let job: Job | null = null;
  try {
    const p = JSON.parse(m[1].trim());
    job = {
      category: String(p.category ?? "other"),
      timing: String(p.timing ?? ""),
      summary: String(p.summary ?? ""),
    };
  } catch {
    /* ignore malformed block */
  }
  return { text: content.replace(m[0], "").trim(), job };
}

function jobHref(job: Job): string {
  const params = new URLSearchParams();
  if (job.category) params.set("category", job.category);
  if (job.timing) params.set("timing", job.timing);
  if (job.summary) params.set("desc", job.summary);
  return `/contractors?${params.toString()}`;
}

function PostJobButton({ job }: { job: Job }) {
  return (
    <Link
      href={jobHref(job)}
      className="mt-1 inline-block rounded-lg bg-hearth-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hearth-700"
    >
      📋 Post this job
    </Link>
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
    const last = lastRaw ? parseJob(lastRaw) : null;
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
            {last.job && <PostJobButton job={last.job} />}
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
          const { text, job } =
            m.role === "assistant"
              ? parseJob(m.content)
              : { text: m.content, job: null };
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
                {text}
              </span>
              {job && <PostJobButton job={job} />}
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
