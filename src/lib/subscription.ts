import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import type { Subscription } from "@/lib/database.types";

// The current user's Hearth Plus subscription row (billing status, plan,
// renewal date). Written only by the Stripe webhook via the service role, so
// this is a read-only view for the app. Cached per request.
export const getSubscription = cache(
  async (): Promise<Subscription | null> => {
    const user = await getUser();
    if (!user) return null;

    const supabase = createClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return data ?? null;
  }
);

// Whether the current user has an active Hearth Plus subscription. Gates
// "finding a pro" (posting a job / contacting pros) - the rest of the app
// (home tracking, AI chat, document vault, alerts) stays free.
export async function hasPlus(): Promise<boolean> {
  const sub = await getSubscription();
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (sub.current_period_end && new Date(sub.current_period_end) <= new Date())
    return false;
  return true;
}
