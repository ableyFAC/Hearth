"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Sparkles } from "lucide-react";

// The AskHearth chat body (Markdown renderer, voice input, full conversation
// logic) is heavy and was previously bundled into every page via this dock.
// Loading it lazily keeps it out of the initial bundle; it's only fetched
// once the dock is actually opened (or a pending question opens it), which is
// exactly when it's needed. ssr:false is fine here: this is a client-only
// floating widget with no content that needs to exist in the server-rendered
// HTML, and the file is already "use client".
const AskHearth = dynamic(() => import("@/components/AskHearth"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-stone-500 dark:text-stone-400">
      Loading…
    </div>
  ),
});

// A floating Ask Hearth widget pinned to the bottom-right. Always available; a
// little tab that opens into the full, scrollable conversation.
export default function AskHearthDock({
  greeting,
  endpoint,
  storageKeyBase,
  retentionKeyBase,
  headingTitle = "Ask Hearth",
  headingSubtitle,
}: {
  greeting?: string;
  // Override to mount a different-brained assistant (e.g. the pro copilot).
  // Defaults leave the homeowner dock behaving exactly as before.
  endpoint?: string;
  storageKeyBase?: string;
  retentionKeyBase?: string;
  headingTitle?: string;
  headingSubtitle?: string;
}) {
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

  // Ask Hearth stays docked bottom-right on almost every screen, /emergency
  // included. The one care there: the pill must not sit on top of a panic
  // button (a wrong-tap in a real emergency). That's handled on the Emergency
  // page by giving its content bottom clearance (pb) so the pill floats over
  // empty space, not a card - see src/app/(app)/emergency/page.tsx.
  //
  // The exception is the homeowner Messages screen: it already hosts a
  // full-screen Ask Hearth conversation, so a second entry point there is just
  // clutter sitting on top of the composer. /pro/chats is NOT hidden: the pro
  // side has no embedded assistant, and this dock is the only entry point to
  // the pro copilot.
  const hiddenHere = pathname === "/chats" || pathname.startsWith("/chats/");

  // Hiding the dock unmounts its AskHearth instance while `open` and
  // `pendingQuestion` survive in this component. A fresh AskHearth mounted on
  // the way back would treat the same initialQuestion as new (its one-shot
  // guard is a ref inside the instance) and submit it again on every round
  // trip. By the time this route is reached the question was either already
  // submitted or abandoned, so drop it.
  useEffect(() => {
    if (hiddenHere && pendingQuestion) setPendingQuestion(null);
  }, [hiddenHere, pendingQuestion]);

  if (hiddenHere) return null;

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open ? (
        <div className="flex h-[60vh] max-h-[560px] w-[22rem] max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-stone-200 bg-white p-3 shadow-pop dark:border-white/10 dark:bg-stone-800">
          <div className="mb-1 flex items-center justify-end gap-3 text-stone-500 dark:text-stone-400">
            <Link
              href="/chats?lead=ask-hearth"
              onClick={close}
              title="Open full screen in Messages"
              className="leading-none hover:text-hearth-700 dark:hover:text-hearth-300"
            >
              ⤢
            </Link>
            <button
              type="button"
              onClick={close}
              title="Minimize"
              className="text-lg leading-none hover:text-stone-700 dark:hover:text-stone-200"
            >
              −
            </button>
            <button
              type="button"
              onClick={close}
              title="Close"
              className="-m-2 p-2 leading-none hover:text-red-600 dark:hover:text-red-400"
            >
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <AskHearth
              fill
              greeting={greeting}
              initialQuestion={pendingQuestion ?? undefined}
              endpoint={endpoint}
              storageKeyBase={storageKeyBase}
              retentionKeyBase={retentionKeyBase}
              headingTitle={headingTitle}
              headingSubtitle={headingSubtitle}
            />
          </div>
        </div>
      ) : (
        // Compact icon-only FAB on phones; the full labeled pill from sm up.
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-hearth-600 text-lg font-semibold text-white shadow-pop hover:bg-hearth-700 sm:h-auto sm:w-auto sm:px-4 sm:py-3 sm:text-sm"
        >
          <span aria-hidden="true" className="sm:hidden">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="sr-only sm:not-sr-only">{headingTitle}</span>
        </button>
      )}
    </div>
  );
}
