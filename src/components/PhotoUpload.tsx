"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Uploads images to the `home-photos` bucket under <propertyId>/ and renders a
// hidden input per uploaded URL (name="photo_urls") so the parent <form>'s
// server action receives them. Degrades gracefully if the bucket isn't set up.
export default function PhotoUpload({ propertyId }: { propertyId: string }) {
  const supabase = createClient();
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setErr(null);

    for (const file of files) {
      const ext = file.name.split(".").pop() || "jpg";
      // Avoid Math.random/Date in this environment-agnostic path; use crypto.
      const id = crypto.randomUUID();
      const path = `${propertyId}/${id}.${ext}`;
      const { error } = await supabase.storage
        .from("home-photos")
        .upload(path, file, { upsert: false });
      if (error) {
        setErr(
          "Photo upload unavailable (is the home-photos bucket created?). You can still save without photos."
        );
        continue;
      }
      const { data } = supabase.storage.from("home-photos").getPublicUrl(path);
      setUrls((prev) => [...prev, data.publicUrl]);
    }
    setBusy(false);
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
      {busy && <p className="mt-1 text-xs text-stone-400">Uploading…</p>}
      {err && <p className="mt-1 text-xs text-amber-600">{err}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {urls.map((u) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={u}
            src={u}
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
