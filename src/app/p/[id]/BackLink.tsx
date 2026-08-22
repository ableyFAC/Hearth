"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Quiet "Back" affordance at the top of a pro's public page. Homeowners land
// here from the in-app browse list or the public /pros directory and expect a
// way back to their results; router.back() restores that list exactly
// (scroll position, filters). On a direct entry (a shared link, a QR scan)
// there is no in-app history to return to, so the link falls back to the
// public directory instead of popping the visitor out of the site.
//
// The history check runs in an effect, not during render: the server renders
// this page too, and window does not exist there.
export default function BackLink() {
  const router = useRouter();
  const [hasHistory, setHasHistory] = useState(false);

  useEffect(() => {
    setHasHistory(window.history.length > 1);
  }, []);

  if (!hasHistory) {
    return (
      <a
        href="/pros"
        className="focus-ring mb-4 inline-block text-sm font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        Browse all pros
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="focus-ring mb-4 inline-block text-sm font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
    >
      Back
    </button>
  );
}
