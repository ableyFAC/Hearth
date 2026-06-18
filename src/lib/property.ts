import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Property } from "@/lib/database.types";

// Which home the owner is currently viewing. A user can have several; this
// cookie picks the active one. Ownership is re-validated on every read, so a
// stale/forged value just falls back to their first home.
export const ACTIVE_HOME_COOKIE = "hearth_active_home";

export async function getProperties(): Promise<Property[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("properties")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return data ?? [];
}

export async function getActiveProperty(): Promise<Property | null> {
  const props = await getProperties();
  if (props.length === 0) return null;

  const activeId = cookies().get(ACTIVE_HOME_COOKIE)?.value;
  return props.find((p) => p.id === activeId) ?? props[0];
}
