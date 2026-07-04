// Aging-lead deals: a job that sits unclaimed gets an automatic markdown on the
// per-apply fee, so pros get a deal and stale inventory clears.
//
// These tiers MUST match supabase/migrations/0028_ghost_protection.sql
// (lead_fee_cents), which is the source of truth for what a pro is actually
// charged. This helper is display-only, so the leads board can advertise the deal.
// (Softened from 25/40% in 0028: ghost protection now covers dead-lead risk, so
// the deep discount double-compensated.)
export const AGING_LEAD_TIERS = [
  { days: 7, off: 30 },
  { days: 3, off: 15 },
] as const;

// Discount percent for a lead given when its job was posted (0 if still fresh).
export function agingDiscountPct(createdAt: string | Date): number {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  for (const t of AGING_LEAD_TIERS) if (days >= t.days) return t.off;
  return 0;
}

// Base and effective (post-markdown) fee in dollars, plus the percent off.
export function agingLeadFee(baseFeeDollars: number, createdAt: string | Date) {
  const off = agingDiscountPct(createdAt);
  const fee = Math.round(baseFeeDollars * (100 - off)) / 100;
  return { base: baseFeeDollars, fee, off };
}
