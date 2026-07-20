"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { imgSrc } from "@/lib/storage";
import TakePhotoButton from "@/components/TakePhotoButton";
import { FilePreviewGrid } from "@/components/FilePreview";

// Uploads images to the `home-photos` bucket under <propertyId>/ and renders a
// hidden input per uploaded URL (name="photo_urls") so the parent <form>'s
// server action receives them. Degrades gracefully if the bucket isn't set up.
export default function PhotoUpload({
  propertyId,
  id,
}: {
  propertyId: string;
  // Ties the internal label to the file input for assistive tech.
  id?: string;
}) {
  const supabase = createClient();
  const [urls, setUrls] = useState<string[]>([]);
  // The files just picked, shown as small previews immediately, before (and
  // while) they upload, so the owner can see what they selected. Cleared once
  // the batch finishes: the successful ones then show as the real uploaded
  // thumbnails below (via `urls`), same as before.
  const [pending, setPending] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    setPending(files);
    setBusy(true);
    setErr(null);

    const MAX_BYTES = 15 * 1024 * 1024; // 15MB per photo
    // Real allowed raster types only - matches the storage bucket's own
    // allowed_mime_types (migration 0079). `accept="image/*"` is only a
    // browser hint; without this check, a client `file.type.startsWith(
    // "image/")` test would still let image/svg+xml through, which can carry
    // a <script> and gets served back off Hearth's own storage origin
    // (security audit finding #7). The bucket-level allow-list is the real
    // backstop once 0079 is applied live; this is defense-in-depth so the
    // upload never even starts and the rejection message is clear.
    const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
    let failures = 0;
    let sawSvg = false;
    for (const file of files) {
      if (file.type === "image/svg+xml") {
        sawSvg = true;
        continue;
      }
      // Skip anything oversized or not one of the allowed raster types.
      if (file.size > MAX_BYTES || !ALLOWED_TYPES.has(file.type)) {
        failures++;
        continue;
      }
      const ext = file.name.split(".").pop() || "jpg";
      // Avoid Math.random/Date in this environment-agnostic path; use crypto.
      const id = crypto.randomUUID();
      const path = `${propertyId}/${id}.${ext}`;
      const { error } = await supabase.storage
        .from("home-photos")
        .upload(path, file, { upsert: false });
      if (error) {
        failures++;
        continue;
      }
      const { data } = supabase.storage.from("home-photos").getPublicUrl(path);
      setUrls((prev) => [...prev, data.publicUrl]);
    }
    setBusy(false);
    setPending([]);
    // Only show an error if something actually failed, worded to the real count
    // (so one bad file doesn't make successful ones look failed). SVG gets its
    // own friendly, specific message rather than folding into the generic
    // upload-failure count.
    setErr(
      sawSvg
        ? "SVG images aren't supported. Please use a PNG, JPEG, or WEBP photo."
        : failures
          ? `${failures} photo${failures > 1 ? "s" : ""} couldn't upload (is the home-photos bucket created?). You can still save without ${failures > 1 ? "them" : "it"}.`
          : null
    );
    // Reset so picking the same file again still fires onChange.
    input.value = "";
  }

  return (
    <div>
      <label className="label" htmlFor={id}>
        Photos (optional)
      </label>
      <input
        id={id}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={onPick}
        className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-bark-100 file:px-3 file:py-1.5 file:text-bark-700 dark:text-stone-300 dark:file:bg-bark-700 dark:file:text-stone-300"
      />
      {/* Phones get a direct-to-camera shortcut too. Snap, then tap again for
          the next one; each shot joins the same batch. Camera returns one
          photo per tap, so the running previews below double as the "you can
          keep adding" cue. */}
      <TakePhotoButton onPick={onPick} disabled={busy} className="mt-2" />
      {busy && <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">Uploading…</p>}
      {err && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{err}</p>}
      <FilePreviewGrid files={pending} />
      <div className="mt-2 flex flex-wrap gap-2">
        {urls.map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={u}
            src={imgSrc(u) ?? u}
            alt="upload preview"
            className="h-16 w-16 rounded-md object-cover"
          />
        ))}
      </div>
      {urls.map((u) => (
        <input key={u} type="hidden" name="photo_urls" value={u} />
      ))}
    </div>
  );
}
