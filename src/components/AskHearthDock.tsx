"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import AskHearth from "@/components/AskHearth";

// A floating Ask Hearth widget pinned to the bottom-right. Always available; a
// little tab that opens into the full, scrollable conversation.
export default function AskHearthDock({ greeting }: { greeting?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // A question that arrived while the dock was closed; handed to the freshly
  // mounted AskHearth (which submits it once) when the dock opens for it.
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  // Open the shell when an app-wide "ask this" event fires and no mounted
  // AskHearth instance claimed it (a page's inline box, or this dock's own
  // instance while open, takes priority). Instances claim synchronously via a
  // flag on the event object, so check it after a tick. This listener never
  // claims the event itself; it only opens the shell.
  useEffect(() => {
    function onAsk(e: Event) {
      const q = (e as CustomEvent).detail;
      if (typeof q !== "string") return;
      setTimeout(() => {
        if ((e as any).__hearthHandled) return;
        if (openRef.current) return; // the open dock's instance handles it
        setPendingQuestion(q);
        setOpen(true);
      }, 0);
    }
    window.addEventListener("hearth:ask-question", onAsk);
    return () => window.removeEventListener("hearth:ask-question", onAsk);
  }, []);

  function close() {
    setOpen(false);
    setPendingQuestion(null);
  }

  // Ask Hearth stays docked bottom-right on every screen, /emergency included.
  // The one care there: the pill must not sit on top of a panic button (a
  // wrong-tap in a real emergency). That's handled on the Emergency page by
  // giving its content bottom clearance (pb) so the pill floats over empty
  // space, not a card - see src/app/(app)/emergency/page.tsx. pathname is kept
  // for potential per-route tweaks and to keep the hook order stable.
  void pathname;

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open ? (
        <div className="flex h-[60vh] max-h-[560px] w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-stone-200 bg-white p-3 shadow-2xl">
          <div className="mb-1 flex items-center justify-end gap-3 text-stone-400">
            <Link
              href="/chats?lead=ask-hearth"
              onClick={close}
              title="Open full screen in Messages"
              className="leading-none hover:text-hearth-700"
            >
              ⤢
            </Link>
            <button
              type="button"
              onClick={close}
              title="Minimize"
              className="text-lg leading-none hover:text-stone-700"
            >
              −
            </button>
            <button
              type="button"
              onClick={close}
              title="Close"
              className="leading-none hover:text-red-600"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AskHearth
              fill
              greeting={greeting}
              initialQuestion={pendingQuestion ?? undefined}
            />
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
