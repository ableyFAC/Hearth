"use client";

import { useState } from "react";
import Link from "next/link";
import AskHearth from "@/components/AskHearth";

// A floating Ask Hearth widget pinned to the bottom-right. Always available; a
// little tab that opens into the full, scrollable conversation.
export default function AskHearthDock({ greeting }: { greeting?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open ? (
        <div className="flex h-[60vh] max-h-[560px] w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-stone-200 bg-white p-3 shadow-2xl">
          <div className="mb-1 flex items-center justify-end gap-3 text-stone-400">
            <Link
              href="/chats?lead=ask-hearth"
              onClick={() => setOpen(false)}
              title="Open full screen in Messages"
              className="leading-none hover:text-hearth-700"
            >
              ⤢
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Minimize"
              className="text-lg leading-none hover:text-stone-700"
            >
              –
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Close"
              className="leading-none hover:text-red-600"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AskHearth fill greeting={greeting} />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-hearth-600 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-hearth-700"
        >
          ✨ Ask Hearth
        </button>
      )}
    </div>
  );
}
