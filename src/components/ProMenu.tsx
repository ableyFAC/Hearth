"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// Profile avatar + dropdown in the top-right of the contractor nav. Replaces the
// separate Company / Billing / Sign out buttons with a single menu.
export default function ProMenu({ company }: { company: string | null }) {
  const [open, setOpen] = useState(false);
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
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 text-sm font-medium text-stone-700 hover:bg-hearth-50"
      >
        {/* Placeholder avatar — blank humanoid head + torso. */}
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
        {company && (
          <span className="hidden max-w-[12rem] truncate sm:inline">
            {company}
          </span>
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
          className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
        >
          <Link
            href="/pro/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-stone-700 hover:bg-hearth-50"
          >
            Edit profile
          </Link>
          <Link
            href="/pro/billing"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-stone-700 hover:bg-hearth-50"
          >
            Billing
          </Link>
          <form
            action="/auth/signout"
            method="post"
            className="border-t border-stone-100 p-1.5"
          >
            <button
              type="submit"
              role="menuitem"
              className="block w-full rounded-md border border-transparent px-4 py-2 text-left text-sm font-medium text-stone-500 transition-colors duration-200 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
