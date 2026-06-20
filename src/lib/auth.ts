import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// The authenticated user, cached for the duration of a single server request.
// Uses getSession() (reads the validated session from the cookie, no network
// round-trip) instead of getUser() (which calls Supabase's auth server every
// time). The middleware already validates the session with getUser() on each
// request, and the database enforces real auth via RLS, so this is safe and
// much faster. React's cache() also dedupes it to once per render.
export const getUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
});
