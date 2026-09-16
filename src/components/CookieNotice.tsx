"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// The one-time cookie notice, mounted once in the ROOT layout
// (src/app/layout.tsx) so every surface shows it exactly once - marketing
// pages, the homeowner app, the pro app and the closed-door pro page alike.
//
// THIS IS INFORMATIONAL, NOT A CONSENT GATE, and the difference is load-
// bearing. src/content/legal/cookies.md and the Cookies section of
// privacy.md both state the position OakTend actually holds: every cookie it
// sets is first-party and functional (sign-in, the password-reset door, the
// active-home selection, one-shot flash messages), analytics is the host's
// cookieless page-view counter, and there are no advertising or session-replay
// trackers anywhere - so no consent is legally required under California law.
// A banner that BLOCKED anything or offered a toggle would therefore be
// theatre: it would imply a choice that has nothing on the other side of it,
// and it would be a second, contradictory account of what this product does
// next to the legal pages. So this card only tells you, and goes away. Nothing
// is gated on it, nothing is toggled by it, and no cookie is deferred until it
// is read. If OakTend ever adds a cookie that DOES need consent, this
// component is not the thing to extend - that needs a real preference store.
//
// Modelled on PreviewNotice.tsx, including the starts-hidden-then-appears
// pattern and the try/catch discipline around storage; see the notes on each
// below.
const DISMISSED_KEY = "oaktend_cookie_notice_dismissed";

export default function CookieNotice() {
  // STARTS HIDDEN, then appears if the mount check says it should - same
  // reasoning as PreviewNotice: visibility depends on localStorage, which only
  // exists in the browser, so the server HTML cannot know the answer.
  // Rendering it and removing it would flash the card at everyone who already
  // dismissed it, on every navigation in the app.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
    } catch {
      // Storage blocked (private window, cookies-and-site-data off). Show the
      // card: the safe direction to fail is TELLING somebody what cookies we
      // set, not hiding it because we could not read a flag.
    }
    setVisible(true);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Worst case it comes back on the next load. Never a crash: this is a
      // notice, and a notice must not be able to take the page down.
    }
  }

  if (!visible) return null;

  return (
    <div
      // role="region", not "dialog" or "alertdialog": nothing is modal, focus
      // is not trapped, and the page behind stays fully usable.
      role="region"
      aria-label="Cookie notice"
      // Small floating card, bottom-right on desktop and a full-width strip
      // inside the 1rem gutters on a phone.
      //
      // THE BOTTOM OFFSET CLEARS THE MOBILE TAB BAR. Below lg both app shells
      // pin a fixed bottom nav that is 3.5rem of content plus the safe-area
      // inset (Nav.tsx and ProNav.tsx: `pb-[env(safe-area-inset-bottom)]` on a
      // `fixed inset-x-0 bottom-0` bar), and pro/layout.tsx's footer already
      // uses this exact expression to get out of its way. A plain bottom-4
      // would put this card on top of the tab bar on every phone. From lg up
      // the bar is gone (lg:hidden) and the card drops back to bottom-4.
      // Underscores, not spaces, inside the arbitrary value - Tailwind's
      // arbitrary-value syntax cannot contain literal spaces.
      className="fixed left-4 right-4 z-40 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_1rem)] rounded-xl border border-stone-200 bg-white p-4 shadow-menu lg:bottom-4 sm:left-auto sm:right-6 sm:max-w-sm dark:border-white/10 dark:bg-stone-900"
    >
      <p className="text-sm leading-relaxed text-stone-700 dark:text-stone-300">
        We use only the cookies that keep you signed in and make OakTend work.
        No ad cookies, ever.
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Link
          href="/cookies"
          className="text-sm font-medium text-stone-500 underline hover:text-stone-700 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center dark:text-stone-400 dark:hover:text-stone-200"
        >
          Cookie notice
        </Link>
        {/* Plain .btn-primary, with no min-h of its own: .btn (globals.css)
            already pins every button in the app to min-h-[44px], the thumb
            floor this card needs on a phone, at every width. shrink-0 so the
            label never wraps next to the link on a narrow screen. */}
        <button type="button" onClick={dismiss} className="btn-primary shrink-0">
          Got it
        </button>
      </div>
    </div>
  );
}
