"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { track } from "@/lib/analytics";
import {
  buildClickProps,
  buildPageTimeProps,
  buildPageViewProps,
  clickIdFrom,
  routePattern,
  PAGE_TIME_EVENT,
  PAGE_VIEW_EVENT,
  UI_CLICK_EVENT,
} from "@/lib/usageTracking";

// First-party click and page-time analytics, into the same app_events pipeline
// as every other event (docs/ANALYTICS.md) - no third-party product-analytics
// vendor, no session replay, no cookie. Three events:
//
//   page_view  - a route pattern was opened
//   page_time  - that route pattern was closed, after N ms of visible time
//   ui_click   - a control carrying an explicit data-track id was tapped
//
// Mounted ONCE, in the root layout, rather than in the two app shells the way
// WebVitals is: the clicks worth counting are on the LANDING page and the
// signup doors, which never render either shell. The root layout must stay
// free of cookies() and headers() (see the banner comment there), and a client
// component like this one costs it nothing - it is not a request-scoped read.
//
// All state below is MODULE level, not component state or refs. This component
// renders null and never re-renders for its own reasons; what it is really
// managing is the lifetime of the document's listeners and one open timing
// interval, both of which outlive any individual React commit. React 19
// StrictMode runs every effect twice in dev, and a second registration would
// double-count every click - the same reason src/components/WebVitals.tsx
// keeps its guard at module level.
let started = false;

// The route pattern currently open, or null before the first navigation.
let currentPath: string | null = null;
// When the currently open interval began (performance.now()), or null when no
// interval is open - either because the page is hidden, or because its time
// has already been reported. This doubles as the "never send the same
// interval twice" guard: every send sets it back to null, and only a fresh
// page_view or a return to visibility sets it again.
let openedAt: number | null = null;

// performance.now() is monotonic, which Date.now() is not - a clock
// adjustment mid-visit would otherwise show up as a negative or wildly long
// page_time. Falls back only if performance is somehow absent; the two are
// never mixed within one interval, since either the API exists for the whole
// page lifetime or it does not.
function now(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

// Close the open interval and report it. A no-op when nothing is open, which
// is what makes this safe to call from three places (a route change, a hide,
// and pagehide) that can fire in any order and sometimes back to back -
// visibilitychange:hidden immediately followed by pagehide is the normal way a
// phone browser is closed, and that must produce ONE page_time, not two.
function flushPageTime() {
  if (currentPath === null || openedAt === null) return;
  track(PAGE_TIME_EVENT, buildPageTimeProps(currentPath, openedAt, now()));
  openedAt = null;
}

export default function UsageTracker() {
  const pathname = usePathname();

  // Route changes. Runs on mount and on every client navigation.
  useEffect(() => {
    const pattern = routePattern(pathname ?? "/");
    // Also the StrictMode guard for this effect: a double-invoked mount sees
    // the pattern it just recorded and stops, so the page is viewed once.
    if (currentPath === pattern) return;
    // The page being left gets its time reported before the new one opens.
    flushPageTime();
    currentPath = pattern;
    openedAt = now();
    track(PAGE_VIEW_EVENT, buildPageViewProps(pattern));
  }, [pathname]);

  // Document-level listeners, registered once for the life of the document.
  useEffect(() => {
    if (started) return;
    started = true;

    // Time only counts while the page is actually on screen. A tab left open
    // in the background for an hour is not an hour of reading, and on a phone
    // "switched away" is the overwhelmingly common way a visit ends - pagehide
    // often never fires there at all, which is why visibilitychange carries
    // most of the load here rather than being a refinement of it.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        flushPageTime();
      } else if (currentPath !== null && openedAt === null) {
        // Back on screen: restart the clock WITHOUT a new page_view. The
        // visitor returned to a page they already opened; counting a second
        // view would inflate every screen people tab away from.
        openedAt = now();
      }
    };

    // The last chance to report on a real unload (and the bfcache-correct
    // event to use - "unload" is ignored by some browsers and breaks bfcache).
    // track() sends via navigator.sendBeacon, which is the one request kind
    // guaranteed to survive the page going away.
    const onPageHide = () => flushPageTime();

    // ONE delegated listener instead of a handler per button. Capture phase so
    // it still sees a click on a control whose own handler calls
    // stopPropagation(), and passive so it can never delay or cancel the
    // interaction it is only observing.
    const onClick = (event: Event) => {
      const id = clickIdFrom(event.target as Element | null);
      if (!id) return;
      // Free text never enters here: clickIdFrom reads an explicit data-track
      // attribute and nothing else - never the button's label (payload rule,
      // docs/ANALYTICS.md).
      const path =
        currentPath ?? routePattern(window.location.pathname);
      track(UI_CLICK_EVENT, buildClickProps(id, path));
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("click", onClick, {
      capture: true,
      passive: true,
    });

    return () => {
      // Unlike src/components/WebVitals.tsx - whose "web-vitals" listeners
      // cannot be removed once registered, which is why it has no cleanup -
      // every listener here is removable, so it is removed. Without this, a
      // second registration (a StrictMode remount, or a second copy of this
      // module in a test file) leaves the previous one still listening on the
      // same document and every click is counted twice.
      //
      // `started` is cleared here too, or the re-run right after a StrictMode
      // cleanup would find the flag set and register nothing. React pairs the
      // double-invoke as add -> remove -> add, so dev still ends with exactly
      // one of each listener.
      //
      // currentPath/openedAt are deliberately NOT reset: they describe the
      // page the visitor is on, which a remount of this component does not
      // change, and clearing them would make the route effect above fire a
      // duplicate page_view.
      started = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, []);

  return null;
}
