"use client";

import { useState } from "react";
import { imgSrc } from "@/lib/storage";
import { StoredPhotoGrid } from "@/components/FilePreview";

// Photos already on file for the issue this job is about (see page.tsx's
// existingIssuePhotos fetch), pre-attached and shown BEFORE submit so the
// owner sees exactly what's about to go out - postJobAction reuses the same
// issue_id, so these ride along with no re-upload needed. Removing one here
// is real removal, not just a UI hide: since the photo row is shared with the
// issue tracker, "remove_photo_ids" tells postJobAction to delete that photo
// outright (scoped to this issue) rather than leaving a confusing mismatch
// where the pro's job shows fewer photos than the Issues page does.
export default function ExistingJobPhotos({
  photos,
}: {
  photos: { id: string; url: string }[];
}) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const kept = photos.filter((p) => !removed.has(p.id));

  return (
    <div className="mb-3">
      <p className="label">Photos already on file for this issue</p>
      {kept.length > 0 ? (
        <StoredPhotoGrid
          photos={kept.map((p) => ({
            key: p.id,
            src: imgSrc(p.url) ?? p.url,
            alt: "Existing photo",
          }))}
          onRemove={(key) =>
            setRemoved((prev) => {
              const next = new Set(prev);
              next.add(key);
              return next;
            })
          }
        />
      ) : (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          None will be sent with this post.
        </p>
      )}
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        These are sent with your post automatically. Remove any you don&apos;t
        want the pro to see.
      </p>
      {/* Removing here deletes the photo (see the header comment), so it's
          submitted as a real instruction to the server action, not silently
          dropped from the form. */}
      {photos
        .filter((p) => removed.has(p.id))
        .map((p) => (
          <input key={p.id} type="hidden" name="remove_photo_ids" value={p.id} />
        ))}
    </div>
  );
}
