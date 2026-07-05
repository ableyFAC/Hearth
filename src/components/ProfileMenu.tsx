"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type MenuLink = {
  href: string;
  label: string;
  // Optional visual accent for an item that needs to stand out (currently only
  // used by the homeowner "Emergency" link). Undefined renders the normal row.
  accent?: "red";
};

// Avatar + dropdown shown in the top-right of both navs. The menu links differ
// per side (contractor: company listing + billing; homeowner: account), but the
// chrome - avatar, name, chevron, and the Log out form - is shared so the two
// toolbars can't drift apart.
export default function ProfileMenu({
  name,
  links,
  linksLabel,
  hasPlus,
  plusTools,
  moreLinks,
}: {
  name: string | null;
  links: MenuLink[];
  // Optional section label rendered above `links` (homeowner passes
  // "Your home"). Omitted on the contractor side, which renders links plain.
  linksLabel?: string;
  // Homeowner-only: whether the signed-in user has Hearth Plus. Undefined on
  // the contractor side (ProNav), which has no Plus entry to show.
  hasPlus?: boolean;
  // Homeowner premium tools, shown as a group in the menu. For non-Plus users
  // they render locked (dimmed + a lock) and link to the upgrade page, so the
  // menu doubles as a teaser of what Plus unlocks.
  plusTools?: Array<{ href: string; label: string; locked?: boolean }>;
  // Secondary links tucked behind a "More" row so the menu opens showing only
  // the handful people reach for daily. Log out always stays visible.
  moreLinks?: MenuLink[];
}) {
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setShowMore(false);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm font-medium text-stone-700 hover:bg-hearth-50"
      >
        {/* Placeholder avatar - blank humanoid head + torso. */}
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-stone-200 text-stone-400">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="12" cy="9" r="4" />
            <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6v1H4v-1z" />
          </svg>
        </span>
        {name && (
          <span className="hidden max-w-[12rem] truncate sm:inline">{name}</span>
        )}
        {/* Dropdown indicator. */}
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 text-stone-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-stone-200 bg-white py-1.5 shadow-lg"
        >
          {hasPlus !== undefined && (
            <Link
              href="/plus"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={
                hasPlus
                  ? "block border-b border-stone-100 px-4 py-2 text-sm text-stone-400"
                  : "block border-b border-stone-100 bg-hearth-50 px-4 py-2 text-sm font-medium text-hearth-700 hover:bg-hearth-100"
              }
            >
              {hasPlus ? "Hearth Plus ✓" : "Upgrade to Hearth Plus"}
            </Link>
          )}
          <div
            className={
              plusTools && plusTools.length > 0
                ? "border-b border-stone-100 py-1"
                : undefined
            }
          >
            {linksLabel && (
              <p className="px-4 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                {linksLabel}
              </p>
            )}
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={
                  l.accent === "red"
                    ? "mx-1 flex items-center rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    : "mx-1 flex items-center rounded-md px-3 py-2 text-sm text-stone-700 hover:bg-hearth-50"
                }
              >
                {l.label}
              </Link>
            ))}
          </div>
          {plusTools && plusTools.length > 0 && (
            <div className="border-b border-stone-100 py-1">
              <p className="px-4 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                Plus tools
              </p>
              {plusTools.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={`mx-1 flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm hover:bg-hearth-50 ${
                    l.locked ? "text-stone-400" : "text-stone-700"
                  }`}
                >
                  <span>{l.label}</span>
                  {l.locked && (
                    <span aria-hidden="true" className="text-xs">
                      🔒
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
          {moreLinks && moreLinks.length > 0 && !showMore && (
            <button
              type="button"
              role="menuitem"
              onClick={() => setShowMore(true)}
              className="mx-1 flex w-[calc(100%-0.5rem)] items-center gap-1 rounded-md px-3 py-2 text-left text-sm text-stone-400 hover:bg-hearth-50 hover:text-stone-600"
            >
              More
              <svg
                viewBox="0 0 20 20"
                className="h-3.5 w-3.5"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          )}
          {moreLinks &&
            showMore &&
            moreLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="mx-1 flex items-center rounded-md px-3 py-2 text-sm text-stone-700 hover:bg-hearth-50"
              >
                {l.label}
              </Link>
            ))}
          <form
            action="/auth/signout"
            method="post"
            className="border-t border-stone-100"
          >
            <button
              type="submit"
              role="menuitem"
              className="block w-full px-4 py-2 text-left text-sm font-medium text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
