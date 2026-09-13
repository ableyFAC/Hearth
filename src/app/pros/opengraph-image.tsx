import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/ogCard";
import { isHomeownerPreview } from "@/lib/previewMode";

// Social share card for /pros, built on the shared shell in
// src/lib/ogCard.tsx (same visual pattern as
// src/app/p/[id]/opengraph-image.tsx: flat light background, one accent, no
// gradients).

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "OakTend for Pros";

export default function OgImage() {
  // PREVIEW MODE (addendum 4 H): this card is what a shared /pros link shows
  // in a chat or a feed, and the subtitle is the same lead-pricing claim the
  // page's own metadata drops during the preview. A picture makes a claim just
  // as loudly as a <meta> tag, and it outlives the page in caches.
  if (isHomeownerPreview()) {
    return renderOgCard(
      "OakTend for Pros",
      "Coming soon. Leave your email and we'll tell you first."
    );
  }

  return renderOgCard(
    "OakTend for Pros",
    "Real local leads. Pay only when you apply."
  );
}
