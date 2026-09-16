// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import CookieNotice from "./CookieNotice";

// The informational cookie card. Mirrors PreviewNotice.test.tsx, minus the
// flag: this one has no environment switch - it is shown to everybody once,
// on every surface, because it states a fact about the product rather than a
// temporary state.
//
// Three things matter and are pinned here: it shows on a first visit,
// dismissing it sticks across a remount, and a browser with storage blocked
// still gets a working card rather than a crash.
//
// What is deliberately NOT tested, because it must never become true: there is
// no "reject" path, nothing is blocked while the card is up, and no cookie
// waits on it. See the header comment in CookieNotice.tsx - the legal pages
// (src/content/legal/cookies.md, privacy.md) say no consent is required, so a
// consent gate here would contradict them.

const DISMISSED_KEY = "oaktend_cookie_notice_dismissed";
const TEXT =
  "We use only the cookies that keep you signed in and make OakTend work. No ad cookies, ever.";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CookieNotice", () => {
  it("shows on a first visit, with the link to the full notice", () => {
    render(<CookieNotice />);
    expect(screen.getByText(TEXT)).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Cookie notice" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cookie notice" })).toHaveAttribute(
      "href",
      "/cookies"
    );
  });

  it("clears the mobile tab bar rather than sitting on top of it", () => {
    render(<CookieNotice />);
    // Below lg both shells pin a fixed 3.5rem + safe-area bottom nav; the card
    // has to start above it and only fall back to bottom-4 from lg up.
    const card = screen.getByRole("region", { name: "Cookie notice" });
    expect(card).toHaveClass(
      "fixed",
      "z-40",
      "bottom-[calc(3.5rem_+_env(safe-area-inset-bottom)_+_1rem)]",
      "lg:bottom-4"
    );
  });

  it("hides on dismiss and remembers it across a remount", () => {
    const first = render(<CookieNotice />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1");

    // A remount is what a navigation looks like to this component.
    first.unmount();
    render(<CookieNotice />);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it("stays hidden for a browser that already carries the flag", () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    render(<CookieNotice />);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  // Private windows and "block site data" make localStorage throw on ACCESS,
  // not return null. The card must still work - and the safe direction to fail
  // is telling somebody what cookies we set, not hiding it because a flag
  // could not be read.
  it("still shows when reading storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<CookieNotice />);
    expect(screen.getByText(TEXT)).toBeInTheDocument();
  });

  it("still dismisses for this view when writing storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<CookieNotice />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: "Got it" }))
    ).not.toThrow();
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });
});
