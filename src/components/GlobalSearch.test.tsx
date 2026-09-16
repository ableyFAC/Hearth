// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// GlobalSearch only uses router.push; the rest of next/navigation is
// irrelevant here.
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import GlobalSearch from "./GlobalSearch";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  push.mockClear();
});

// Focus the box and type. The suggestion list is debounced (~180ms), so
// assertions below use findBy*/waitFor instead of immediate getBy*.
function type(value: string) {
  const input = screen.getByRole("searchbox", { name: "Search" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  return input;
}

describe("GlobalSearch suggestions", () => {
  it("shows a destination and an FAQ hit while typing, and expands the FAQ answer on selection", async () => {
    render(<GlobalSearch />);
    type("trial");

    // The FAQ entry seeded from the pricing page surfaces as a suggestion.
    const faqRow = await screen.findByText("How does the OakTend Plus trial work?");
    // Selecting it expands the answer inline rather than navigating.
    fireEvent.click(faqRow);
    expect(
      screen.getByText(/the first \d+ days cost nothing/)
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("navigates to a destination with arrow keys and enter", async () => {
    render(<GlobalSearch />);
    const input = type("post a job");

    await screen.findByText("Post a job");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/contractors");
  });

  it("closes the dropdown on escape", async () => {
    render(<GlobalSearch />);
    const input = type("post a job");

    await screen.findByText("Post a job");
    fireEvent.keyDown(input, { key: "Escape" });
    // The panel plays a 120ms exit animation before unmounting.
    await waitFor(() => {
      expect(screen.queryByText("Post a job")).toBeNull();
    });
  });

  it("filters by side: the pro box suggests pro destinations and submits to /pro/search", async () => {
    const { container } = render(<GlobalSearch side="pro" />);
    type("leads");

    await screen.findByText("Browse leads");
    // The homeowner-only destinations never leak into the pro box.
    expect(screen.queryByText("Post a job")).toBeNull();

    // Enter with nothing highlighted submits the form to the pro search page.
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    expect(push).toHaveBeenCalledWith("/pro/search?q=leads");
  });

  it("offers Ask OakTend when nothing matches", async () => {
    render(<GlobalSearch />);
    type("zzzz qqqq");

    await screen.findByText(/No matches/);
    const ask = screen.getByText(/Ask OakTend: /);
    fireEvent.click(ask);
    expect(push).toHaveBeenCalledWith(
      `/chats?lead=ask-oaktend&q=${encodeURIComponent("zzzz qqqq")}`
    );
  });
});

// The controlled mode both headers use: HeaderSearchRow owns `open` (it has to
// hide the rest of the toolbar in the same beat) and this box only reports.
describe("GlobalSearch takeover mode", () => {
  it("is a single icon button until the row opens it", () => {
    const onOpenChange = vi.fn();
    render(<GlobalSearch mode="takeover" open={false} onOpenChange={onOpenChange} />);

    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("opens to a full-width input with a full-width panel under it", async () => {
    const { container } = render(
      <GlobalSearch mode="takeover" open onOpenChange={vi.fn()} />
    );

    const input = screen.getByRole("searchbox", { name: "Search" });
    // w-full, not the inline pill's w-24/focus:w-48: the row is its to fill.
    expect(input.className).toContain("w-full");
    expect(input.className).not.toContain("w-24");

    fireEvent.change(input, { target: { value: "post a job" } });
    await screen.findByText("Post a job");
    const panel = container.querySelector("div.rounded-xl");
    expect(panel).not.toBeNull();
    // Hangs off the bottom of the input at the full width of the taken-over
    // row, instead of the inline mode's w-72 pinned to a narrow pill's right.
    expect(panel!.className).toContain("left-0");
    expect(panel!.className).toContain("right-0");
    expect(panel!.className).toContain("top-full");
    expect(panel!.className).not.toContain("w-72");
  });

  it("holds the suggestions back until the box has finished expanding", async () => {
    const { rerender } = render(
      <GlobalSearch
        mode="takeover"
        open
        suggestionsReady={false}
        onOpenChange={vi.fn()}
      />
    );
    // Focused and typable while the box slides - just no panel yet.
    fireEvent.focus(screen.getByRole("searchbox", { name: "Search" }));
    expect(screen.queryByText("Try searching")).toBeNull();

    rerender(
      <GlobalSearch mode="takeover" open suggestionsReady onOpenChange={vi.fn()} />
    );
    expect(await screen.findByText("Try searching")).toBeInTheDocument();
  });

  it("reports a close on escape", async () => {
    const onOpenChange = vi.fn();
    render(<GlobalSearch mode="takeover" open onOpenChange={onOpenChange} />);
    const input = screen.getByRole("searchbox", { name: "Search" });

    fireEvent.change(input, { target: { value: "post a job" } });
    await screen.findByText("Post a job");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("reports a close when a destination is picked", async () => {
    const onOpenChange = vi.fn();
    render(<GlobalSearch mode="takeover" open onOpenChange={onOpenChange} />);
    const input = screen.getByRole("searchbox", { name: "Search" });

    fireEvent.change(input, { target: { value: "post a job" } });
    fireEvent.click(await screen.findByText("Post a job"));
    expect(push).toHaveBeenCalledWith("/contractors");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
