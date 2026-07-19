import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import type { Contractor } from "@/lib/database.types";

// The current user's contractor company, or null if they aren't a pro.
// A user is treated as a contractor iff a contractors row links to their uid.
// Cached per request so repeated calls don't re-query.
export const getCurrentContractor = cache(
  async (): Promise<Contractor | null> => {
    // Deliberately NOT src/lib/auth.ts's getUser(): that helper trusts
    // getSession(), which reads the user id straight off the (unverified)
    // cookie. Below we hand that id to the admin client, which bypasses RLS
    // entirely, so a cookie-edited id would let an attacker read any
    // contractor's full row (balance, checkr_*, license_verify_detail, ...).
    // supabase.auth.getUser() here re-checks the id against Supabase's auth
    // server, so it's safe to trust before the admin-client query below.
    const authClient = createClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) return null;

    // Admin client, not the user client: 0067 stripped column-level SELECT on
    // contractors down to the public columns, so a user-client `select *`
    // would error on the sensitive columns (balance, checkr_*, *_doc_path,
    // license_verify_detail, ...). The session is already validated via
    // supabase.auth.getUser() above and the query is pinned to
    // `.eq("user_id", user.id)`, so the admin client still returns only the
    // caller's own row.
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("contractors")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return data ?? null;
  }
);

// Cheap role check - reuses the cached contractor lookup.
export async function isContractor(): Promise<boolean> {
  return (await getCurrentContractor()) !== null;
}

export type Role = "homeowner" | "contractor";

// The current user's role, used to route a single sign-in to the right side of
// the app. Set explicitly at sign-up (user_metadata.role); for legacy accounts
// created before that, we fall back to inferring it from a contractor company.
// A user with neither signal has NO known role and gets null: callers that
// only branch on "contractor"/"homeowner" behave as before (null falls into
// the homeowner-side default), but /pro can now send them to the role chooser
// instead of silently trapping them in the homeowner flow.
export const getRole = cache(async (): Promise<Role | null> => {
  const user = await getUser();
  if (!user) return null;

  const meta = (user.user_metadata?.role ?? user.app_metadata?.role) as
    | string
    | undefined;
  if (meta === "contractor" || meta === "homeowner") return meta;

  // Legacy fallback: a company row means they're a contractor.
  return (await isContractor()) ? "contractor" : null;
});
