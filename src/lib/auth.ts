import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// The authenticated user, cached for the duration of a single server request.
// Many helpers (getRole, getCurrentContractor, getProperties) need the user;
// React's cache() dedupes them so we only hit Supabase Auth once per render
// instead of 3–4 times, which keeps navigation fast.
export const getUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
