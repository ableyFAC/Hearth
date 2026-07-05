import { createAdminClient } from "@/lib/supabase/admin";

// Shared per-user daily cap for the AI-backed routes, counted in the same
// ai_usage table (migration 0024) and with the same limits as /api/ask, so
// every route that touches the paid Gemini API shares one daily budget
// instead of each being its own side door around the abuse limits.
const DAILY_LIMIT_FREE = 25;
const DAILY_LIMIT_PLUS = 250;

// Count one usage for this user today and report whether they are now over
// their daily cap. Counted via the service-role client so it works regardless
// of RLS, and tracked by calendar date (not a rolling window) so it resets
// cleanly at midnight. Fails OPEN: a broken counter should never block the
// homeowner from using a feature, so any error logs and lets the request
// through uncounted.
export async function countAiUsage(
  userId: string,
  isPlus: boolean
): Promise<{ overLimit: boolean }> {
  const dailyLimit = isPlus ? DAILY_LIMIT_PLUS : DAILY_LIMIT_FREE;
  let usageCount = 1;
  try {
    const admin = createAdminClient();
    const usageDate = new Date().toISOString().slice(0, 10);
    // Supabase-js has no atomic "increment" helper, so read the current count
    // for today and write it back one higher. A missed race under these
    // routes' low traffic just undercounts by one, which is fine for an
    // abuse cap.
    const { data: existing } = await (admin as any)
      .from("ai_usage")
      .select("count")
      .eq("user_id", userId)
      .eq("usage_date", usageDate)
      .maybeSingle();
    usageCount = (existing?.count ?? 0) + 1;
    await (admin as any)
      .from("ai_usage")
      .upsert(
        { user_id: userId, usage_date: usageDate, count: usageCount },
        { onConflict: "user_id,usage_date" }
      );
  } catch (err) {
    console.error("ai_usage upsert failed", err);
    usageCount = 0;
  }
  return { overLimit: usageCount > dailyLimit };
}
