// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import PayoutsNudge, { shouldShowPayoutsNudge } from "./PayoutsNudge";
import type { ConnectStatus } from "@/lib/connectStatus";

// The payouts nudge on pro Home. Two rules are worth pinning: it must appear
// for every state a pro can still act on, and it must NOT appear for the two
// where nagging them would be wrong - already connected, or the app cannot
// read the columns at all (migration 0164 not pasted yet).

afterEach(cleanup);

describe("shouldShowPayoutsNudge", () => {
  it("shows for the three states a pro can act on", () => {
    for (const status of [
      "not_started",
      "in_progress",
      "restricted",
    ] as ConnectStatus[]) {
      expect(shouldShowPayoutsNudge(status), status).toBe(true);
    }
  });

  it("hides for ready and unavailable", () => {
    expect(shouldShowPayoutsNudge("ready")).toBe(false);
    // The columns could not be read. Asking a pro to fix something the app
    // cannot see is worse than saying nothing.
    expect(shouldShowPayoutsNudge("unavailable")).toBe(false);
  });
});

describe("PayoutsNudge", () => {
  it("renders nothing at all when connected", () => {
    const { container } = render(<PayoutsNudge status="ready" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the status is unavailable", () => {
    const { container } = render(<PayoutsNudge status="unavailable" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("asks a brand-new pro to add where they get paid", () => {
    render(<PayoutsNudge status="not_started" />);
    expect(screen.getByText("Add where you get paid")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Connect Stripe once so you can send invoices and get paid in the app."
      )
    ).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Set up payouts" });
    expect(cta).toHaveAttribute("href", "/pro/payouts");
  });

  it("uses the same copy for a half-finished setup", () => {
    render(<PayoutsNudge status="in_progress" />);
    expect(screen.getByText("Add where you get paid")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up payouts" })
    ).toBeInTheDocument();
  });

  it("changes its words when Stripe has asked for something specific", () => {
    render(<PayoutsNudge status="restricted" />);
    expect(screen.getByText("Stripe needs one more thing")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Fix payouts" });
    expect(cta).toHaveAttribute("href", "/pro/payouts");
  });

  it("has no dismiss control, on purpose", () => {
    // Deliberate difference from ProNudge: this is not a sale a pro can defer,
    // it is the reason their first invoice will not send.
    render(<PayoutsNudge status="not_started" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
