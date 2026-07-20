"use client";

import PhotoUpload from "@/components/PhotoUpload";
import { useDraftJob } from "./DraftJobContext";

// Thin client wrapper so the shared PhotoUpload stays generic: it just forwards
// each new set of uploaded URLs into the post-a-job context, where
// DescriptionField picks up the first one to draft a description from it.
export default function DraftablePhotoUpload({
  propertyId,
  id,
}: {
  propertyId: string;
  id?: string;
}) {
  const ctx = useDraftJob();
  return (
    <PhotoUpload
      propertyId={propertyId}
      id={id}
      onUrlsChange={ctx?.setPhotoUrls}
    />
  );
}
