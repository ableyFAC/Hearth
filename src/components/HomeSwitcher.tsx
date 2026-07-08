"use client";

import { useEffect, useRef, useState } from "react";
import { setActiveHomeAction } from "@/lib/homeActions";
import RemoveHomeButton from "@/components/RemoveHomeButton";
import type { PropertyWithShared } from "@/lib/property";

// Dropdown of the user's homes: switch, remove, or add. Closes on outside
// click or Escape (no need to click the toggle again).
export default function HomeSwitcher({
  homes,
  activeId,
}: {
  homes: PropertyWithShared[];
  activeId: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = homes.find((h) => h.id === activeId) ?? homes[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="-my-2.5 flex items-center gap-1 py-2.5 text-sm text-stone-500 hover:text-stone-700"
      >
        <span className="max-w-[12rem] truncate">{active?.address_line1}</span>
        <span
          className={`text-stone-400 transition ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-72 rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
          <p className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-stone-400">
            Your homes
          </p>

          {homes.map((h) => (
            <div
              key={h.id}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-hearth-50"
            >
              {h.id === active?.id ? (
                <span className="flex-1 truncate text-sm font-medium text-stone-900">
                  ✓ {h.address_line1}
                  {h.isShared && (
                    <span className="ml-1 text-xs font-normal text-stone-400">
                      Shared
                    </span>
                  )}
                </span>
              ) : (
                <form action={setActiveHomeAction} className="min-w-0 flex-1">
                  <input type="hidden" name="id" value={h.id} />
                  <button className="w-full truncate text-left text-sm text-stone-700 hover:text-hearth-700">
                    {h.address_line1}
                    {h.isShared && (
                      <span className="ml-1 text-xs font-normal text-stone-400">
                        Shared
                      </span>
                    )}
                  </button>
                </form>
              )}

              {!h.isShared && <RemoveHomeButton id={h.id} label={h.address_line1} />}
            </div>
          ))}

          <a
            href="/onboarding"
            className="mt-1 block rounded-md px-2 py-1.5 text-sm font-medium text-hearth-700 hover:bg-hearth-50"
          >
            + Add a home
          </a>
          {homes.length >= 1 && (
            <p className="px-2 pb-1 text-xs text-stone-400">
              Free includes 1 home. Hearth Plus unlocks up to 5.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
