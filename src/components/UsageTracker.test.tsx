// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";

type TrackCall = { event: string; props?: Record<string, unknown> };
const trackCalls: TrackCall[] = [];

// Records what the component fired AND calls through to the real track(), so
// the "no sendBeacon" case below exercises the actual guard in
// src/lib/analytics.ts rather than a stub that could never throw.
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analytics")>();
  return {
    track: (event: string, props?: Record<string, unknown>) => {
      trackCalls.push({ event, props });
      actual.track(event, props);
    },
  };
});

// The route the component thinks it is on. Mutated by a test, then picked up
// on the next render - the same way a client navigation reaches usePathname.
let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

// UsageTracker keeps its listeners and its open timing interval at module
// level (on purpose - see the comment there), so each test needs a fresh copy
// of the module rather than a fresh React tree.
async function loadTracker() {
  vi.resetModules();
  const mod = await import("./UsageTracker");
  return mod.default;
}

let nowMs = 0;
// jsdom implements neither of these; both are needed to drive the component.
let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  trackCalls.length = 0;
  pathname = "/";
  nowMs = 0;
  visibility = "visible";
  vi.spyOn(performance, "now").mockImplementation(() => nowMs);
  // defineProperty, not vi.spyOn: jsdom puts visibilityState on
  // Document.prototype as a getter, and the component reads it off `document`.
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    writable: true,
    value: vi.fn(() => true),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (document as { visibilityState?: unknown }).visibilityState;
  delete (navigator as { sendBeacon?: unknown }).sendBeacon;
});

describe("UsageTracker", () => {
  it("renders nothing and reports a page_view on mount", async () => {
    const UsageTracker = await loadTracker();
    const { container } = render(<UsageTracker />);

    expect(container.innerHTML).toBe("");
    expect(trackCalls).toEqual([
      { event: "page_view", props: { path: "/", side: "public" } },
    ]);
  });

  it("reports page_time for the page being left, then page_view for the new one", async () => {
    const UsageTracker = await loadTracker();
    const { rerender } = render(<UsageTracker />);
    trackCalls.length = 0;

    nowMs = 4200;
    pathname = "/dashboard";
    rerender(<UsageTracker />);

    expect(trackCalls).toEqual([
      {
        event: "page_time",
        props: { path: "/", side: "public", duration_ms: 4200 },
      },
      {
        event: "page_view",
        props: { path: "/dashboard", side: "homeowner" },
      },
    ]);
  });

  it("normalizes a dynamic route to its pattern", async () => {
    pathname = "/pro/leads/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
    const UsageTracker = await loadTracker();
    render(<UsageTracker />);

    expect(trackCalls).toEqual([
      { event: "page_view", props: { path: "/pro/leads/:id", side: "pro" } },
    ]);
  });

  it("does not report a page twice for the same interval", async () => {
    const UsageTracker = await loadTracker();
    render(<UsageTracker />);
    trackCalls.length = 0;

    // The normal way a phone visit ends: hidden, then pagehide immediately
    // after. That is one visit, so it must be one page_time.
    nowMs = 1500;
    visibility = "hidden";
    fireEvent(document, new Event("visibilitychange"));
    fireEvent(window, new Event("pagehide"));

    expect(trackCalls).toEqual([
      {
        event: "page_time",
        props: { path: "/", side: "public", duration_ms: 1500 },
      },
    ]);
  });

  it("restarts the clock on return to visibility without a second page_view", async () => {
    const UsageTracker = await loadTracker();
    const { rerender } = render(<UsageTracker />);
    trackCalls.length = 0;

    nowMs = 1000;
    visibility = "hidden";
    fireEvent(document, new Event("visibilitychange"));

    // Five minutes in another app. None of it counts as time on this page.
    nowMs = 301_000;
    visibility = "visible";
    fireEvent(document, new Event("visibilitychange"));

    nowMs = 303_000;
    pathname = "/pricing";
    // A navigation away closes the second interval.
    rerender(<UsageTracker />);

    expect(trackCalls).toEqual([
      {
        event: "page_time",
        props: { path: "/", side: "public", duration_ms: 1000 },
      },
      {
        event: "page_time",
        props: { path: "/", side: "public", duration_ms: 2000 },
      },
      { event: "page_view", props: { path: "/pricing", side: "public" } },
    ]);
  });

  it("reports ui_click only for a control inside [data-track]", async () => {
    const UsageTracker = await loadTracker();
    render(<UsageTracker />);
    trackCalls.length = 0;

    const tagged = document.createElement("button");
    tagged.setAttribute("data-track", "landing_get_started");
    const label = document.createElement("span");
    // A click almost always lands on a child node, not the button itself.
    tagged.appendChild(label);

    const untagged = document.createElement("button");
    untagged.textContent = "Leaky roof in the kitchen";

    document.body.append(tagged, untagged);

    fireEvent.click(label);
    fireEvent.click(untagged);

    expect(trackCalls).toEqual([
      {
        event: "ui_click",
        props: {
          id: "landing_get_started",
          path: "/",
          side: "public",
        },
      },
    ]);

    tagged.remove();
    untagged.remove();
  });

  it("ignores a data-track value outside the id alphabet", async () => {
    const UsageTracker = await loadTracker();
    render(<UsageTracker />);
    trackCalls.length = 0;

    const el = document.createElement("button");
    // What an accidental interpolation of something a person typed would
    // look like. It must not become an analytics value.
    el.setAttribute("data-track", "Leaky roof in the kitchen");
    document.body.append(el);

    fireEvent.click(el);

    expect(trackCalls).toEqual([]);
    el.remove();
  });

  it("does not throw when navigator.sendBeacon is missing", async () => {
    delete (navigator as { sendBeacon?: unknown }).sendBeacon;

    const UsageTracker = await loadTracker();
    expect(() => {
      render(<UsageTracker />);

      const el = document.createElement("button");
      el.setAttribute("data-track", "landing_get_started");
      document.body.append(el);
      fireEvent.click(el);
      el.remove();

      nowMs = 900;
      visibility = "hidden";
      fireEvent(document, new Event("visibilitychange"));
      fireEvent(window, new Event("pagehide"));
    }).not.toThrow();

    // The component still does its work; track() is what declines to send.
    expect(trackCalls.map((c) => c.event)).toEqual([
      "page_view",
      "ui_click",
      "page_time",
    ]);
  });
});
