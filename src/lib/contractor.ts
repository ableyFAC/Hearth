import { createClient } from "@/lib/supabase/server";
import type { Contractor } from "@/lib/database.types";

// The current user's contractor company, or null if they aren't a pro.
// A user is treated as a contractor iff a contractors row links to their uid.
export async function getCurrentContractor(): Promise<Contractor | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("contractors")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  return data ?? null;
}

// Cheap role check that doesn't need the full row.
export async function isContractor(): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { count } = await supabase
    .from("contractors")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return (count ?? 0) > 0;
}

export type Role = "homeowner" | "contractor";

// The current user's role, used to route a single sign-in to the right side of
// the app. Set explicitly at sign-up (user_metadata.role); for legacy accounts
// created before that, we fall back to inferring it from a contractor company.
export async function getRole(): Promise<Role | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = (user.user_metadata?.role ?? user.app_metadata?.role) as
    | string
    | undefined;
  if (meta === "contractor" || meta === "homeowner") return meta;

  // Legacy fallback: a company row means they're a contractor.
  return (await isContractor()) ? "contractor" : "homeowner";
}
