import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import type { Contractor } from "@/lib/database.types";

// The current user's contractor company, or null if they aren't a pro.
// A user is treated as a contractor iff a contractors row links to their uid.
// Cached per request so repeated calls don't re-query.
export const getCurrentContractor = cache(
  async (): Promise<Contractor | null> => {
    const user = await getUser();
    if (!user) return null;

    const supabase = createClient();
    const { data } = await supabase
      .from("contractors")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return data ?? null;
  }
);

// Cheap role check — reuses the cached contractor lookup.
export async function isContractor(): Promise<boolean> {
  return (await getCurrentContractor()) !== null;
}

export type Role = "homeowner" | "contractor";

// The current user's role, used to route a single sign-in to the right side of
// the app. Set explicitly at sign-up (user_metadata.role); for legacy accounts
// created before that, we fall back to inferring it from a contractor company.
export const getRole = cache(async (): Promise<Role | null> => {
  const user = await getUser();
  if (!user) return null;

  const meta = (user.user_metadata?.role ?? user.app_metadata?.role) as
    | string
    | undefined;
  if (meta === "contractor" || meta === "homeowner") return meta;

  // Legacy fallback: a company row means they're a contractor.
  return (await isContractor()) ? "contractor" : "homeowner";
});
