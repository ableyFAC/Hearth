// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// HeaderSearchRow renders the real GlobalSearch, which only uses router.push.
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import HeaderSearchRow from "./HeaderSearchRow";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  push.mockClear();
});

function renderRow() {
  return render(
    <HeaderSearchRow
      side="homeowner"
      brand={<span data-testid="brand">OakTend · 123 Oak St</span>}
      leading={<span data-testid="leading">pills</span>}
      trailing={<span data-testid="trailing">avatar</span>}
    />
  );
}

// The wrapper div the row put around the leading segment.
function leadingWrapper(): HTMLElement {
  const el = screen.getByTestId("leading").parentElement;
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

// The box that animates its max-width across the leading segment; min-h-11 is
// its marker.
function searchWrapper(container: HTMLElement): HTMLElement {
  const el = container.querySelector("div.min-h-11");
  expect(el).not.toBeNull();
  return el as HTMLElement;
}

function openSearch() {
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  return screen.getByRole("searchbox", { name: "Search" });
}

describe("HeaderSearchRow takeover", () => {
  it("renders the brand, both control segments and a collapsed search button at rest", () => {
    const { container } = renderRow();

    expect(screen.getByTestId("brand")).toBeInTheDocument();
    expect(screen.getByTestId("leading")).toBeInTheDocument();
    expect(screen.getByTestId("trailing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    // Closed means icon only: no input in the row.
    expect(screen.queryByRole("searchbox")).toBeNull();
    // The leading wrapper is boxless (display:contents), so the pills stay
    // direct flex items of the right group and the resting row measures
    // exactly what it measured before.
    expect(leadingWrapper().className).toBe("contents");
    // And the box is capped at the collapsed icon's own 36px by the class, with
    // no inline width left over - that is what makes the next open a real
    // 2.25rem -> Npx change the browser can animate.
    expect(searchWrapper(container).className).toContain("max-w-9");
    expect(searchWrapper(container).style.maxWidth).toBe("");
  });

  it("takes over the leading segment only, leaving the brand and the trailing controls alone", async () => {
    const { container } = renderRow();
    openSearch();

    // The wordmark and address never go anywhere - the box stops short of
    // them - and neither do the bell/profile side of the row.
    expect(screen.getByTestId("brand")).toBeInTheDocument();
    expect(screen.getByTestId("trailing")).toBeInTheDocument();
    expect(screen.getByTestId("trailing").parentElement?.className).not.toContain(
      "hidden"
    );
    // display:none from sm up; below sm only `contents` applies, so the phone
    // row keeps every control exactly where it was.
    expect(leadingWrapper().className).toBe("contents sm:hidden");

    // The open width is measured from the live row (magnifier's right edge back
    // to the first visible leading control's left edge) and applied one frame
    // later, so the box has a collapsed value to animate from. jsdom has no
    // layout, so every rect is zero and the w-56 floor is what lands.
    await waitFor(() => {
      expect(searchWrapper(container).style.maxWidth).toBe("224px");
    });
    expect(searchWrapper(container).style.width).toBe("224px");
  });

  it("drops the suggestions only once the box has finished expanding", async () => {
    const { container } = renderRow();
    openSearch();

    // The input has focus already, but the panel must not race the slide.
    expect(screen.queryByText("Try searching")).toBeNull();

    fireEvent.transitionEnd(searchWrapper(container), {
      propertyName: "max-width",
    });
    expect(await screen.findByText("Try searching")).toBeInTheDocument();
  });

  it("drops the suggestions anyway if the transition never fires", async () => {
    renderRow();
    openSearch();

    // Reduced motion (or a width that did not actually change) means no
    // transitionend at all; the 260ms backstop has to let the panel through.
    expect(screen.queryByText("Try searching")).toBeNull();
    expect(await screen.findByText("Try searching", undefined, { timeout: 2000 }))
      .toBeInTheDocument();
  });

  it("replays the whole sequence on a second open, not just the first", async () => {
    const { container } = renderRow();

    // First open, all the way through: box expands, then the panel drops.
    openSearch();
    await waitFor(() => {
      expect(searchWrapper(container).style.maxWidth).toBe("224px");
    });
    fireEvent.transitionEnd(searchWrapper(container), {
      propertyName: "max-width",
    });
    await screen.findByText("Try searching");

    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search" }), {
      key: "Escape",
    });
    // Closed: no inline width left behind, so the box is back to the collapsed
    // class and the next open is something the browser can animate. The
    // collapse's own transitionend must not count as "expanded" either.
    expect(searchWrapper(container).style.maxWidth).toBe("");
    fireEvent.transitionEnd(searchWrapper(container), {
      propertyName: "max-width",
    });

    // Second open: the panel waits for the slide exactly as it did the first
    // time, instead of arriving with the click.
    openSearch();
    expect(screen.queryByText("Try searching")).toBeNull();
    await waitFor(() => {
      expect(searchWrapper(container).style.maxWidth).toBe("224px");
    });
    fireEvent.transitionEnd(searchWrapper(container), {
      propertyName: "max-width",
    });
    expect(await screen.findByText("Try searching")).toBeInTheDocument();
  });

  it("escape gives the toolbar back", () => {
    renderRow();
    const input = openSearch();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    expect(leadingWrapper().className).not.toContain("sm:hidden");
    // Coming back from a takeover the controls fade rather than pop (on the
    // children, since the wrapper itself is display:contents). They do NOT
    // carry the animation on first paint - see the resting test above.
    expect(leadingWrapper().className).toContain(
      "motion-safe:[&>*]:animate-fade-scale"
    );
  });

  it("closes on blur when the box is empty", async () => {
    renderRow();
    const input = openSearch();

    // React maps onBlur to focusout, so that is the event the wrapper hears.
    fireEvent.focusOut(input);
    // The blur close is on a 120ms timer (it has to outlive a click on a
    // suggestion row).
    await waitFor(() => {
      expect(screen.queryByRole("searchbox")).toBeNull();
    });
    expect(leadingWrapper().className).not.toContain("sm:hidden");
  });

  it("stays open on blur when something has been typed", async () => {
    renderRow();
    const input = openSearch();
    fireEvent.change(input, { target: { value: "water heater" } });

    fireEvent.focusOut(input);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    // Their query is still there, and so is the takeover.
    expect(screen.getByRole("searchbox", { name: "Search" })).toBeInTheDocument();
    expect(leadingWrapper().className).toBe("contents sm:hidden");
  });

  it("closes on a window resize, whose layout the measured width no longer fits", async () => {
    renderRow();
    openSearch();

    fireEvent(window, new Event("resize"));
    await waitFor(() => {
      expect(screen.queryByRole("searchbox")).toBeNull();
    });
  });
});
