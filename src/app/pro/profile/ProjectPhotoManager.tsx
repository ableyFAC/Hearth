"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Multi-photo uploader for a project album. Same client-upload machinery as
// LogoUpload/PhotoUpload: files go straight to the PUBLIC `pro-logos` bucket
// (reused from 0033, no separate bucket) under
//   <contractorId>/projects/<uuid>.<ext>
// and each kept photo renders a hidden photo_urls + photo_befores pair, in
// document order, so the parent <form>'s server action receives an aligned
// list. Per-photo Before/After toggle; the badge only shows publicly for Pro
// members (the RPC gates it), but every pro can set it.

export type ManagedPhoto = { url: string; before: boolean };

const MAX_PHOTOS = 20;

export default function ProjectPhotoManager({
  contractorId,
  initial,
}: {
  contractorId: string;
  initial: ManagedPhoto[];
}) {
  const supabase = createClient();
  const [photos, setPhotos] = useState<ManagedPhoto[]>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setErr(null);

    const MAX_BYTES = 15 * 1024 * 1024; // 15MB per photo, same as PhotoUpload
    const room = MAX_PHOTOS - photos.length;
    let failures = 0;
    let overflow = 0;

    for (const [i, file] of files.entries()) {
      if (i >= room) {
        overflow++;
        continue;
      }
      // Skip anything oversized or not actually an image (accept="" is a hint).
      if (file.size > MAX_BYTES || !file.type.startsWith("image/")) {
        failures++;
        continue;
      }
      const ext = file.name.split(".").pop() || "jpg";
      const id = crypto.randomUUID();
      const path = `${contractorId}/projects/${id}.${ext}`;
      const { error } = await supabase.storage
        .from("pro-logos")
        .upload(path, file, { upsert: false });
      if (error) {
        failures++;
        continue;
      }
      const { data } = supabase.storage.from("pro-logos").getPublicUrl(path);
      setPhotos((prev) => [...prev, { url: data.publicUrl, before: false }]);
    }

    setBusy(false);
    const problems: string[] = [];
    if (failures) {
      problems.push(
        `${failures} photo${failures > 1 ? "s" : ""} couldn't upload (is the pro-logos bucket created?).`
      );
    }
    if (overflow) {
      problems.push(`A project can have up to ${MAX_PHOTOS} photos.`);
    }
    setErr(problems.length ? problems.join(" ") : null);
    // Reset so picking the same file again still fires onChange.
    input.value = "";
  }

  function toggleBefore(index: number) {
    setPhotos((prev) =>
      prev.map((p, i) => (i === index ? { ...p, before: !p.before } : p))
    );
  }

  function remove(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="label">Photos</label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={onPick}
        disabled={photos.length >= MAX_PHOTOS}
        className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-hearth-100 file:px-3 file:py-1.5 file:text-hearth-800 dark:text-stone-300"
      />
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        Up to {MAX_PHOTOS} photos. Tag a photo &quot;Before&quot; to build a
        before/after story.
      </p>
      {busy && <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Uploading…</p>}
      {err && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{err}</p>}

      {photos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {photos.map((p, i) => (
            <li key={p.url} className="w-24">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={`project photo ${i + 1}`}
                  className="h-24 w-24 rounded-lg border border-stone-200 object-cover dark:border-white/10"
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove photo"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-stone-200 bg-white text-xs text-stone-500 shadow-sm hover:text-stone-800 dark:border-white/10 dark:bg-stone-800 dark:text-stone-400 dark:hover:text-stone-100"
                >
                  ×
                </button>
              </div>
              <button
                type="button"
                onClick={() => toggleBefore(i)}
                className={`mt-1 w-full rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
                  p.before
                    ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                    : "border-stone-200 bg-white text-stone-500 hover:bg-stone-50 dark:border-white/10 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700"
                }`}
              >
                {p.before ? "Before" : "After"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Aligned pairs, in document order, for the server action. */}
      {photos.map((p) => (
        <span key={`${p.url}-hidden`}>
          <input type="hidden" name="photo_urls" value={p.url} />
          <input type="hidden" name="photo_befores" value={p.before ? "1" : "0"} />
        </span>
      ))}
    </div>
  );
}
