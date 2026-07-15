"use client";

import { useEffect, useRef, useState } from "react";
import { photoTipsFor } from "@/lib/constants";

// Quiet per-category shot list under the photo picker: once a category is
// chosen, tells the homeowner exactly what to photograph (a leak close-up,
// the shutoff valve, a coin next to the crack for scale). Like
// StrongPostMeter, it finds the surrounding <form> from its own position and
// watches the form's "category" select, so it drops into any form that has
// one (post-a-job, report-an-issue) with no rewiring.
export default function PhotoTips() {
  const ref = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState("");

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;

    const read = () => {
      const sel = form.elements.namedItem(
        "category"
      ) as HTMLSelectElement | null;
      setCategory(sel?.value ?? "");
    };

    read();
    form.addEventListener("change", read);
    return () => form.removeEventListener("change", read);
  }, []);

  const tips = category ? photoTipsFor(category) : [];

  // The outer div always renders (even with nothing picked yet) so the ref
  // exists for the closest("form") lookup above.
  return (
    <div ref={ref} className={tips.length ? "mt-2 rounded-lg bg-stone-50 p-3 dark:bg-stone-800" : undefined}>
      {tips.length > 0 && (
        <>
          <p className="text-xs font-medium text-stone-600 dark:text-stone-300">
            Good shots to include
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-stone-500 dark:text-stone-400">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
