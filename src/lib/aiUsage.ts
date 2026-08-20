import { createAdminClient } from "@/lib/supabase/admin";
import { AI_GLOBAL_DAILY_LIMIT, AI_GLOBAL_BUCKET } from "@/lib/constants";

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
// `remaining` is how many of today's questions are left AFTER this one, or
// null when the counter could not be read. It exists purely so a caller can
// quietly show someone where they stand near the end of their allowance,
// instead of letting the wall arrive with no warning. Nothing gates on it.
export async function countAiUsage(
  userId: string,
  isPlus: boolean
): Promise<{
  overLimit: boolean;
  remaining: number | null;
  dailyLimit: number;
}> {
  const dailyLimit = isPlus ? DAILY_LIMIT_PLUS : DAILY_LIMIT_FREE;
  const admin = createAdminClient();
  let remaining: number | null = null;

  // Per-user daily cap (unchanged). Fails CLOSED, same as before.
  try {
    const { data, error } = await admin.rpc("bump_ai_usage", {
      p_user: userId,
      p_delta: 1,
    });
    if (error) throw error;
    const used = data as number;
    remaining = Math.max(0, dailyLimit - used);
    if (used > dailyLimit) return { overLimit: true, remaining: 0, dailyLimit };
  } catch (err) {
    console.error("bump_ai_usage failed - failing CLOSED:", err);
    return { overLimit: true, remaining: null, dailyLimit };
  }

  // Owner-wide daily SPEND BREAKER, on top of the per-user cap above. One
  // shared bucket across EVERY user (AI_GLOBAL_BUCKET), so no number of free
  // signups can fan the paid Gemini bill past AI_GLOBAL_DAILY_LIMIT in a day.
  // Uses the same atomic fixed-window rate_limit_hit RPC (migration 0068) the
  // rest of the abuse limits use; it returns true while inside the limit and
  // false once tripped. FAILS CLOSED to match the per-user counter above: a
  // broken breaker denies rather than leaving the paid model wide open. Since
  // every AI route funnels through this helper, this single check caps them
  // all. Counted once per request (fan-out weighting stays per-user via
  // addAiUsage), which is the right granularity for a runaway-cost breaker.
  try {
    const { data: allowed, error } = await admin.rpc("rate_limit_hit", {
      p_bucket: AI_GLOBAL_BUCKET,
      p_limit: AI_GLOBAL_DAILY_LIMIT,
      p_window_seconds: 86400,
    });
    if (error) throw error;
    if (allowed === false) {
      console.error(
        `AI global spend breaker tripped (${AI_GLOBAL_BUCKET} over ${AI_GLOBAL_DAILY_LIMIT}/day) - denying to cap runaway cost`
      );
      return { overLimit: true, remaining, dailyLimit };
    }
  } catch (err) {
    console.error("ai-global rate_limit_hit failed - failing CLOSED:", err);
    return { overLimit: true, remaining, dailyLimit };
  }

  return { overLimit: false, remaining, dailyLimit };
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
