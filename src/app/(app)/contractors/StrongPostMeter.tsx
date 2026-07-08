"use client";

import { useEffect, useRef, useState } from "react";

// Live "strong post" meter for the post-a-job form: three soft checkmarks that
// light up as the homeowner fills things in (real detail, a photo, timing).
// Purely encouraging, it never blocks posting. It finds the surrounding <form>
// from its own position, so it needs no props and no form rewiring.
export default function StrongPostMeter() {
  const ref = useRef<HTMLDivElement>(null);
  const [checks, setChecks] = useState({
    desc: false,
    photo: false,
    timing: false,
  });

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;

    const read = () => {
      const desc =
        (form.elements.namedItem("message") as HTMLTextAreaElement | null)
          ?.value ?? "";
      const timing =
        (form.elements.namedItem("timing") as HTMLSelectElement | null)
          ?.value ?? "";
      const photos = form.querySelectorAll('input[name="photo_urls"]').length;
      const next = {
        desc: desc.trim().length >= 80,
        photo: photos > 0,
        timing: Boolean(timing),
      };
      // Only re-render on a real change: the MutationObserver below also sees
      // this component's own re-renders, so an unconditional set would loop.
      setChecks((prev) =>
        prev.desc === next.desc &&
        prev.photo === next.photo &&
        prev.timing === next.timing
          ? prev
          : next
      );
    };

    read();
    form.addEventListener("input", read);
    form.addEventListener("change", read);
    // PhotoUpload appends its hidden photo_urls inputs via React state, which
    // fires no input/change event on the form: watch the subtree for them.
    const observer = new MutationObserver(read);
    observer.observe(form, { childList: true, subtree: true });
    return () => {
      form.removeEventListener("input", read);
      form.removeEventListener("change", read);
      observer.disconnect();
    };
  }, []);

  const items = [
    { done: checks.desc, label: "A few sentences of detail (80+ characters)" },
    { done: checks.photo, label: "At least one photo" },
    { done: checks.timing, label: "Timing picked" },
  ];

  return (
    <div ref={ref} className="rounded-lg bg-stone-50 p-3">
      <p className="text-xs font-medium text-stone-600">
        Strong posts get faster, better-priced responses.
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.map((it) => (
          <li
            key={it.label}
            className={`flex items-center gap-2 text-xs ${
              it.done ? "text-green-700" : "text-stone-500"
            }`}
          >
            <span aria-hidden>{it.done ? "✓" : "○"}</span>
            {it.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
