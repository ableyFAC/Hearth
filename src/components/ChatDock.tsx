"use client";

import { useEffect, useState } from "react";
import LeadChat from "@/components/LeadChat";

type ActiveChat = { leadId: string; name: string };

// A floating chat window pinned to the bottom-right. Opens when an
// "hearth:open-chat" event fires (see OpenChatButton). Can be minimized,
// expanded, or closed. Render once per page; role is set by the page.
export default function ChatDock({
  role = "contractor",
}: {
  role?: "homeowner" | "contractor";
}) {
  const [chat, setChat] = useState<ActiveChat | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as ActiveChat;
      setChat(detail);
      setMinimized(false);
    }
    window.addEventListener("hearth:open-chat", onOpen);
    return () => window.removeEventListener("hearth:open-chat", onOpen);
  }, []);

  if (!chat) return null;

  const width = expanded ? "w-[28rem]" : "w-80";
  const height = expanded ? "h-[70vh]" : "h-96";

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 ${width} rounded-xl border border-stone-200 bg-white shadow-2xl`}
    >
      <div className="flex items-center justify-between gap-2 rounded-t-xl border-b border-stone-100 bg-stone-50 px-3 py-2">
        <span className="truncate text-sm font-semibold text-stone-900">
          {chat.name}
        </span>
        <div className="flex items-center gap-2 text-stone-400">
          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            title={minimized ? "Open" : "Minimize"}
            className="leading-none hover:text-stone-700"
          >
            {minimized ? "▢" : "—"}
          </button>
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            title={expanded ? "Shrink" : "Expand"}
            className="leading-none hover:text-stone-700"
          >
            ⤢
          </button>
          <button
            type="button"
            onClick={() => setChat(null)}
            title="Close"
            className="leading-none hover:text-red-600"
          >
            ✕
          </button>
        </div>
      </div>

      {!minimized && (
        <div className={`${height} p-3`}>
          <LeadChat key={chat.leadId} leadId={chat.leadId} role={role} embedded />
        </div>
      )}
    </div>
  );
}
