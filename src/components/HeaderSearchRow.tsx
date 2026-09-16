"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import GlobalSearch from "@/components/GlobalSearch";
import type { SearchSide } from "@/lib/searchSuggestions";

// The single toolbar row shared by BOTH shells (src/components/Nav.tsx and
// src/components/ProNav.tsx), and the one piece of the header that has to be a
// client component.
//
// WHY IT EXISTS: opening the header search is a TAKEOVER. From sm up the box
// slides and expands back across the row, and the toolbar items it expands over
// hide - nothing between the address and the magnifier is used while you are
// searching. That means the open state has to be owned by something sitting
// ABOVE both the search box and the controls it hides, and both navs are server
// components (they pass server actions into ProfileMenu and must stay server).
// So the row itself moved in here; the navs still own every control, passed in
// as slots, and nothing else about them changed.
//
// HOW FAR IT EXPANDS: exactly over the `leading` segment - from the left edge
// of the first nav pill to the right edge of the magnifier, measured in pixels
// at the moment it opens (see measureOpenWidth). It never reaches the wordmark
// or the home address, which stay put and readable.
//
// THE ORDER MATTERS: click, then the box expands, and only then do the
// suggestions drop under it. They used to arrive on the same frame as the click
// (focusing the input is what opens the panel), which read as two things
// happening at once. `expandedDone` below gates the panel on the box's own
// max-width transition; the input still takes focus immediately, so anything
// typed during those 200ms is kept and shows up when the list arrives.
//
// BELOW sm NOTHING CHANGES. Phones use the /search and /pro/search icon links,
// not the inline box, so the box is `hidden sm:flex` exactly as it was, the
// takeover can never open down there, and the leading controls keep their phone
// layout even if it somehow did (the hidden state is sm-up only).

// Floor for the open box, in px: the width the box used to have (w-56) before
// it could expand. Below lg the nav pills live in the bottom tab bar, so the
// leading segment is empty or tiny and the measurement alone would leave an
// unusable sliver. At those widths the floor can push the address to truncate,
// which is what the box did before this change anyway.
const MIN_OPEN_WIDTH = 224;

export default function HeaderSearchRow({
  side,
  brand,
  leading,
  trailing,
}: {
  // Which registry/FAQ half the box searches, and which shell's accent it uses.
  side: SearchSide;
  // The whole left group: wordmark link (with its side pill) and, on the
  // homeowner row, the "·" and the home switcher. ALWAYS visible - the takeover
  // stops short of it on purpose.
  brand: ReactNode;
  // Everything between the address and the magnifier: the lg+ nav pill strip
  // and, on the homeowner row, ToolsMenu. This is the segment the open box
  // takes over, so it hides from sm up while open.
  leading: ReactNode;
  // Everything to the RIGHT of the magnifier: the phone search link, the tour
  // button, the bell and the profile menu. Never hidden, never rewrapped -
  // these render straight into the right group exactly as they did in the nav.
  trailing: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Only fade the leading controls back in on a CLOSE, never on first paint:
  // without this the toolbar would play an entrance animation on every load.
  const [hasOpened, setHasOpened] = useState(false);
  // Measured px width of the open box. Null until it has been opened once.
  const [openWidth, setOpenWidth] = useState<number | null>(null);
  // True once the box has finished sliding open. The suggestions panel waits
  // for this: click, expand, THEN the list drops - not all three at once.
  const [expandedDone, setExpandedDone] = useState(false);
  const leadingRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);

  // How wide the box opens to. Called from the click that opens it, while the
  // row is still laid out CLOSED, so every rect below is the resting one:
  //
  //   width = magnifier's right edge - first visible leading control's left edge
  //
  // One measured distance rather than a sum of widths and gaps, so it picks up
  // the row's real gaps whatever they are. With nothing visible in the leading
  // segment (below lg the pill strip is in the bottom tab bar, and the pro row
  // has nothing else there) it falls back to the icon slot itself and the floor
  // takes over.
  function measureOpenWidth(): number {
    const box = searchRef.current;
    if (!box) return MIN_OPEN_WIDTH;
    const iconRect = box.getBoundingClientRect();
    let left = iconRect.left;
    // The leading wrapper is display:contents and has no box of its own, so
    // measure its children; skip the ones that are hidden at this width (a
    // display:none element reports an all-zero rect).
    for (const child of Array.from(leadingRef.current?.children ?? [])) {
      const rect = child.getBoundingClientRect();
      if (rect.width > 0) {
        left = rect.left;
        break;
      }
    }
    return Math.max(Math.round(iconRect.right - left), MIN_OPEN_WIDTH);
  }

  function onOpenChange(next: boolean) {
    if (!next) {
      // Everything a close has to undo lives in the effect below, so that it
      // runs for the closes GlobalSearch starts too (Escape, an empty blur, or
      // navigating away from a picked result).
      setOpen(false);
      return;
    }
    // Measure while the row is still laid out CLOSED, then open, then apply the
    // width one frame later. The frame matters: the browser has to paint the
    // box at its collapsed 2.25rem first, or there is nothing to animate FROM
    // and the box jumps straight to full width. Belt and braces with the close
    // clearing the inline width - either alone leaves an open that can skip the
    // slide, and a skipped slide means no transitionend and no "the box has
    // stopped moving" for the suggestions to wait on.
    const width = measureOpenWidth();
    setHasOpened(true);
    setOpen(true);
    frame.current = requestAnimationFrame(() => setOpenWidth(width));
  }

  // THE ONE PLACE A CLOSE IS UNDONE, whoever started it (the row, or
  // GlobalSearch reporting Escape / an empty blur / a picked result). Both
  // pieces of open state have to go back: the measured width, so the box is
  // rendered from the collapsed max-w-9 class again and the next open is a real
  // 2.25rem -> Npx change, and the expanded flag, so the suggestions wait for
  // the slide every time and not just the first.
  //
  // The setTimeout is the backstop for the transition that flips that flag: a
  // transitionend never arrives if the browser had nothing to animate (reduced
  // motion, or a measured width that happens to equal the collapsed 36px) and
  // the suggestions must not be stuck off forever. 260ms is the 200ms
  // transition plus a frame or two of slack. Its cleanup cancels it on close
  // and on unmount, so a timer from a previous open can never fire into a new
  // one.
  useEffect(() => {
    if (!open) {
      // Including a width measurement that has not been applied yet: left to
      // land, it would put an inline max-width on the box before the NEXT
      // open's own frame, and that open would have nothing to animate.
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      setExpandedDone(false);
      setOpenWidth(null);
      return;
    }
    const t = setTimeout(() => setExpandedDone(true), 260);
    return () => clearTimeout(t);
  }, [open]);

  // Same pending frame, on the way out: unmounting mid-open (a route change
  // from a picked suggestion) must not leave a setState scheduled.
  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, []);

  // A resize re-lays out the row under the box, and the width it opened to is a
  // measurement of a layout that no longer exists. Closing is the honest
  // answer, and it is what leaving the header does anyway.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);

  // Written out as whole literal strings, never assembled from fragments, so
  // Tailwind's source scanner sees every class that can reach the DOM.
  //
  // `contents`, NOT a flex box: this wrapper must add no box of its own, so the
  // controls stay DIRECT flex items of the right group and the resting row
  // measures to the pixel what it measured before. A real wrapper would also
  // earn a gap even when everything inside it is hidden - the pro row's leading
  // segment is only the lg+ nav strip, so below lg it would be an empty box
  // pushing the whole toolbar 2-4px sideways.
  // Open: sm:hidden wins from sm up (later display utility, same specificity)
  // and takes the segment with it; below sm only `contents` applies, so the
  // phone row is untouched.
  // Coming back, the controls fade rather than pop - the animation has to go on
  // them rather than on the wrapper, since display:contents generates no box to
  // animate.
  const leadingClass = open
    ? "contents sm:hidden"
    : hasOpened
      ? "contents motion-safe:[&>*]:animate-fade-scale"
      : "contents";

  return (
    <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 sm:py-3">
      <div className="flex min-w-0 items-center gap-2">{brand}</div>
      {/* shrink-0 is safe ONLY because the left group above can actually shrink
          (HomeSwitcher is min-w-0 + truncate at every width). It was not: with
          the switcher pinned to min-width:auto from sm up, the left group held
          its full content width, this group refused to give any back, and
          between roughly 1024 and 1680px the address ran underneath the nav
          pills - "OakTend · 3831 [Home]ve[Browse Pros]". If either half is ever
          made unshrinkable again, that returns. */}
      <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
        <div ref={leadingRef} className={leadingClass}>
          {leading}
        </div>
        {/* The box itself. Closed it is capped at the collapsed icon button's
            own 36px (2.25rem), so it is the icon and nothing more; open it gets
            the measured width inline and max-width carries it there over 200ms,
            growing leftward over the segment that just hid. min-h-11 holds the
            row at the height of the h-11 controls beside it, so the header does
            not jump 4px when they go. No overflow-hidden once open: it would
            clip the suggestions panel, which hangs out of the bottom of this
            box. Below sm the whole thing is hidden, exactly as before. */}
        <div
          ref={searchRef}
          // max-w-9 is on BOTH states and is the resting cap: the inline width
          // below overrides it while open, and there is no inline style at all
          // while closed, so every open starts from the same 2.25rem.
          className={
            open
              ? "hidden min-h-11 max-w-9 items-center transition-[max-width] duration-200 ease-out sm:flex"
              : "hidden min-h-11 max-w-9 items-center overflow-hidden transition-[max-width] duration-200 ease-out sm:flex"
          }
          style={
            open && openWidth !== null
              ? { width: `${openWidth}px`, maxWidth: `${openWidth}px` }
              : undefined
          }
          // The box has stopped moving: the suggestions may drop now. Only this
          // element's own max-width counts - the input inside runs its own
          // transitions and those bubble through here - and only while open,
          // since the collapse back to 36px ends here too and would otherwise
          // leave the flag true for the next open.
          onTransitionEnd={(e) => {
            if (
              open &&
              e.propertyName === "max-width" &&
              e.target === e.currentTarget
            ) {
              setExpandedDone(true);
            }
          }}
        >
          <GlobalSearch
            side={side}
            mode="takeover"
            open={open}
            onOpenChange={onOpenChange}
            suggestionsReady={expandedDone}
          />
        </div>
        {trailing}
      </div>
    </div>
  );
}
