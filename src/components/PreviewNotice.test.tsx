// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import PreviewNotice from "./PreviewNotice";

// The preview banner (guardrail C2). Three things matter and are pinned here:
// it does not exist when the flag is off, dismissing it sticks across a
// remount, and a browser with storage blocked still gets a working banner
// rather than a crash.

const DISMISSED_KEY = "oaktend_preview_notice_dismissed";
const TEXT =
  "Preview: everything is free right now; memberships and pros are coming soon.";

function on() {
  vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("PreviewNotice", () => {
  it("renders nothing when the flag is off", () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "");
    render(<PreviewNotice />);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it("shows the notice in preview", () => {
    on();
    render(<PreviewNotice />);
    expect(screen.getByText(TEXT)).toBeInTheDocument();
  });

  it("hides on dismiss and remembers it across a remount", () => {
    on();
    const first = render(<PreviewNotice />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(DISMISSED_KEY)).toBe("1");

    // A remount is what a navigation looks like to this component.
    first.unmount();
    render(<PreviewNotice />);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  it("stays hidden for a browser that already carries the flag", () => {
    on();
    window.localStorage.setItem(DISMISSED_KEY, "1");
    render(<PreviewNotice />);
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });

  // Private windows and "block site data" make localStorage throw on ACCESS,
  // not return null. The banner must still work - and the safe direction to
  // fail is telling somebody the product is in preview, not hiding it because
  // a flag could not be read.
  it("still shows when reading storage throws", () => {
    on();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<PreviewNotice />);
    expect(screen.getByText(TEXT)).toBeInTheDocument();
  });

  it("still dismisses for this view when writing storage throws", () => {
    on();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<PreviewNotice />);
    expect(() =>
      fireEvent.click(screen.getByRole("button", { name: /dismiss/i }))
    ).not.toThrow();
    expect(screen.queryByText(TEXT)).not.toBeInTheDocument();
  });
});
