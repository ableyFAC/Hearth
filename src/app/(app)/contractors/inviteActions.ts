"use server";

import { getOrCreateReferralCode } from "@/lib/referralCode";

// Thin server-action wrapper so the client ReviewButton can lazily fetch the
// signed-in homeowner's personal invite code the moment its share panel
// appears. Returns null on anything unusual (not signed in, feature not live
// on this DB yet), in which case the panel just doesn't show - it never
// interrupts the review flow. See src/lib/referralCode.ts for the lazy
// generation and its race-safety.
export async function getMyInviteCodeAction(): Promise<string | null> {
  return getOrCreateReferralCode();
}
