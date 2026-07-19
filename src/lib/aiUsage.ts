import { createAdminClient } from "@/lib/supabase/admin";

// Shared per-user daily cap for the AI-backed routes, counted in the same
// ai_usage table (migration 0024) and with the same limits as /api/ask, so
// every route that touches the paid Gemini API shares one daily budget
// instead of each being its own side door around the abuse limits.
const DAILY_LIMIT_FREE = 25;
const DAILY_LIMIT_PLUS = 250;

// Count one usage for this user today and report whether they are now over
// their daily cap. Counted via the service-role client through the atomic
// bump_ai_usage RPC (migration 0070), so parallel requests can't race each
// other into overwriting the same row and fanning out past the cap.
//
// Fails CLOSED: if the counter is broken (e.g. the RPC or table is missing),
// every AI route is a paid side door, so a broken counter must block rather
// than silently grant unlimited access. It logs loudly and treats the caller
// as over-limit. Migration 0070 MUST be applied before this code runs, or all
// AI routes go dark.
export async function countAiUsage(
  userId: string,
  isPlus: boolean
): Promise<{ overLimit: boolean }> {
  const dailyLimit = isPlus ? DAILY_LIMIT_PLUS : DAILY_LIMIT_FREE;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("bump_ai_usage", {
      p_user: userId,
      p_delta: 1,
    });
    if (error) throw error;
    return { overLimit: (data as number) > dailyLimit };
  } catch (err) {
    console.error("bump_ai_usage failed - failing CLOSED:", err);
    return { overLimit: true };
  }
}

// Add N extra usages for this user today (e.g. a route that fans out to the
// model more than once per request). Best-effort: it never throws and never
// blocks the caller, since the gating decision is already made by
// countAiUsage. Non-positive extras are a no-op.
export async function addAiUsage(userId: string, extra: number): Promise<void> {
  if (extra <= 0) return;
  try {
    const admin = createAdminClient();
    await admin.rpc("bump_ai_usage", { p_user: userId, p_delta: extra });
  } catch (err) {
    console.error("addAiUsage failed:", err);
  }
}
