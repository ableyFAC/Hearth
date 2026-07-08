"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { imgSrc } from "@/lib/storage";

// Uploads images to the `home-photos` bucket under <propertyId>/ and renders a
// hidden input per uploaded URL (name="photo_urls") so the parent <form>'s
// server action receives them. Degrades gracefully if the bucket isn't set up.
export default function PhotoUpload({ propertyId }: { propertyId: string }) {
  const supabase = createClient();
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setErr(null);

    const MAX_BYTES = 15 * 1024 * 1024; // 15MB per photo
    let failures = 0;
    for (const file of files) {
      // Skip anything oversized or not actually an image (accept="" is a hint).
      if (file.size > MAX_BYTES || !file.type.startsWith("image/")) {
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
    // Only show an error if something actually failed, worded to the real count
    // (so one bad file doesn't make successful ones look failed).
    setErr(
      failures
        ? `${failures} photo${failures > 1 ? "s" : ""} couldn't upload (is the home-photos bucket created?). You can still save without ${failures > 1 ? "them" : "it"}.`
        : null
    );
    // Reset so picking the same file again still fires onChange.
    input.value = "";
  }

  return (
    <div>
      <label className="label">Photos (optional)</label>
      <input
        type="file"
        accept="image/*"
        multiple
        onChange={onPick}
        className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-md file:border-0 file:bg-hearth-100 file:px-3 file:py-1.5 file:text-hearth-800"
      />
      {busy && <p className="mt-1 text-xs text-stone-500">Uploading…</p>}
      {err && <p className="mt-1 text-xs text-amber-600">{err}</p>}
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
