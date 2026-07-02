// Helpers for serving files from the (now private) home-photos bucket.
//
// Objects are stored with a value that is either a full Supabase public URL
// (legacy rows / getPublicUrl output) or a bare object path. Either way we only
// need the object PATH, then we serve it through /api/img, which signs a short
// lived URL gated by the caller's RLS. Never render a stored URL directly - the
// bucket is private, so a raw public URL would 400.

const BUCKET_MARKER = "/home-photos/";

// Extract the object path within the bucket from a stored value.
export function toObjectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const i = value.indexOf(BUCKET_MARKER);
  if (i !== -1) return value.slice(i + BUCKET_MARKER.length);
  // Already a bare path (possibly with a leading "home-photos/").
  return value.replace(/^home-photos\//, "");
}

// The authenticated image proxy URL for a stored value. Use this for any
// <img src> / <a href> that points at a home-photos object.
export function imgSrc(value: string | null | undefined): string | null {
  const path = toObjectPath(value);
  if (!path) return null;
  return `/api/img?path=${encodeURIComponent(path)}`;
}
