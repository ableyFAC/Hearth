"use client";

import { useEffect, useState } from "react";
import { isHomeownerPreview } from "@/lib/previewMode";

// The one banner that tells a signed-in homeowner what they are looking at
// during the preview (guardrail C2): everything is free, memberships and pros
// are not here yet. Mounted once, in the homeowner shell
// (src/app/(app)/layout.tsx). The pro side gets NO banner - that side is a
// closed door with its own page, not an app with a note on top.
//
// Dismissal is remembered in localStorage, per browser. Deliberately not a
// cookie and not a database column: it is a display preference about a
// temporary state, nobody needs it to follow them across devices, and it must
// never cost a query on every page load.
const DISMISSED_KEY = "oaktend_preview_notice_dismissed";

// The sentence itself, not one of the two shared constants: those two say
// "coming soon" about ONE thing each (memberships, pros), and this banner has
// to cover both plus the "it's free right now" part in a single line.
const NOTICE =
  "Preview: everything is free right now; memberships and pros are coming soon.";

export default function PreviewNotice() {
  // STARTS HIDDEN, then appears if the mount check says it should - the
  // opposite of the usual "render server HTML, hide later" pattern, and
  // deliberate. This component's visibility depends on localStorage, which
  // only exists in the browser, so server HTML cannot know the answer.
  // Rendering it first and removing it would flash the banner at every person
  // who already dismissed it, on every single navigation. The cost is that a
  // first-time reader sees it a beat after paint, which nothing depends on.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isHomeownerPreview()) return;
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {
      // Storage blocked (private window, cookies-and-site-data off). Show the
      // banner: the safe direction to fail is TELLING somebody the product is
      // in preview, not hiding it because we could not read a flag.
    }
    setVisible(true);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Worst case it comes back on the next load. Never a crash: this is a
      // banner, and a banner must not be able to take the page down.
    }
  }

  if (!visible) return null;

  return (
    <div
      role="status"
      // Full-bleed strip under the nav. The inner wrapper matches the shell's
      // own max-w-5xl px-6 so the text lines up with the page content instead
      // of floating at the window edge on a wide screen.
      className="border-b border-stone-200 bg-stone-50 dark:border-white/10 dark:bg-white/5"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-6 py-2">
        <p className="min-w-0 flex-1 text-sm text-stone-700 dark:text-stone-200">
          {NOTICE}
        </p>
        {/* min-h-11 below sm: a 44px tap target, the floor every other
            phone-facing control in the app uses. shrink-0 so the label never
            wraps to two lines next to a long sentence on a narrow screen. */}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss preview notice"
          className="shrink-0 text-sm font-medium text-stone-500 underline hover:text-stone-700 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center dark:text-stone-400 dark:hover:text-stone-200"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
