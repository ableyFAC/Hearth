"use client";

import { useEffect, useRef, useState } from "react";
// Type-only import - erased at compile time, so this client component never
// pulls flash.ts (and its next/headers dependency) into the browser bundle.
import type { Flash } from "@/lib/flash";

const FLASH_COOKIE = "hearth_flash";

// Shows the flash passed from the root layout, then clears the cookie so it
// can't replay. Auto-dismisses; dedupes by the flash id.
export default function Toaster({ flash }: { flash: Flash | null }) {
  const [shown, setShown] = useState<Flash | null>(null);
  // Plays the exit animation instead of an instant clear: dismiss swaps in
  // fade-slide-down, then the toast is cleared once it's played out.
  const [exiting, setExiting] = useState(false);
  const lastId = useRef<string | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismiss() {
    setExiting(true);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      setShown(null);
      setExiting(false);
    }, 120);
  }

  // Clears any pending exit timer on unmount so it can't fire setState after.
  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  useEffect(() => {
    if (!flash || flash.id === lastId.current) return;
    lastId.current = flash.id;
    setShown(flash);
    setExiting(false);
    document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/`;
    // Errors stay much longer than successes: 3.5s is enough to read "Saved"
    // but slow readers were losing error messages before finishing them, and
    // an unread error is a silent failure. Errors also get a dismiss button
    // below instead of relying on the timer alone.
    const t = setTimeout(
      dismiss,
      flash.type === "error" ? 12000 : 3500
    );
    return () => clearTimeout(t);
  }, [flash]);

  if (!shown) return null;

  // Toast floats free over whatever the page happens to show (not "on a
  // card"), so unlike the translucent chip tones it uses a solid dark fill
  // per status, opaque enough to stay crisp over any background.
  const tone =
    shown.type === "error"
      ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-950 dark:text-red-300"
      : shown.type === "info"
      ? "border-stone-200 bg-white text-stone-800 dark:border-white/10 dark:bg-stone-700 dark:text-stone-100"
      : "border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-950 dark:text-green-300";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      <div
        role={shown.type === "error" ? "alert" : "status"}
        className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
          exiting ? "motion-safe:animate-fade-slide-down" : "motion-safe:animate-fade-slide-up"
        } ${tone}`}
      >
        <span>{shown.message}</span>
        {shown.type === "error" && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="shrink-0 text-red-400 hover:text-red-600 dark:text-red-400 dark:hover:text-red-200"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
