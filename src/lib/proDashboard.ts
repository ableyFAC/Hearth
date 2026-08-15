// Pure helpers for the pro dashboard (src/app/pro/page.tsx). The page batches
// its Supabase reads into two round trips, which leaves the "what do we ask
// for" and "what do we do with the rows" decisions as plain functions. They
// live here, away from the server component, so they can be unit tested
// without a database or a request context. No imports on purpose.

// Which wallet-derived reads the second batch should actually issue, given the
// wallet row the first batch returned. Mirrors the page's original per-query
// conditionals exactly:
//  - bonus grants: only when there is a wallet id AND a positive bonus counter
//    to reconcile (nothing to cap otherwise).
//  - applications: only when a wallet row exists at all.
//  - transactions: only when that wallet row has an id.
export function walletQueryPlan(
  wallet: { id?: string | null } | null | undefined,
  rawBonusCents: number
): { grants: boolean; applications: boolean; transactions: boolean } {
  return {
    grants: Boolean(wallet?.id) && rawBonusCents > 0,
    applications: Boolean(wallet),
    transactions: Boolean(wallet?.id),
  };
}

// Ids of jobs the homeowner already closed without picking anyone. Fail-open
// by design: a null rows argument (the lookup errored, or never ran) yields an
// empty set, so the board is left exactly as the RPC returned it.
export function closedLeadIdSet(
  rows: { id: string; owner_closed_at?: string | null }[] | null | undefined
): Set<string> {
  return new Set(
    (rows ?? []).filter((r) => r.owner_closed_at).map((r) => r.id)
  );
}

// Spendable bonus: the raw wallet counter capped at the sum of live, unexpired
// grants, which is what apply_to_lead (migration 0058) will actually honor.
// The cap only applies when there was a positive counter to reconcile, so a
// zero or negative counter passes through untouched.
export function bonusAvailableCents(
  rawBonusCents: number,
  grants: { remaining_cents?: number | string | null }[] | null | undefined
): number {
  if (!(rawBonusCents > 0)) return rawBonusCents;
  const grantSumCents = (grants ?? []).reduce(
    (sum, g) => sum + Number(g.remaining_cents ?? 0),
    0
  );
  return Math.min(rawBonusCents, grantSumCents);
}

// Group full-resolution issue photos by the lead that owns them, so each
// assigned-job card can render its own strip. Leads with no issue and leads
// with no photos are simply absent from the map.
export function photoUrlsByLead(
  leads: { id: string; issue_id?: string | null }[],
  photoRows: { related_id: string; url?: string | null }[] | null | undefined
): Map<string, string[]> {
  const byLead = new Map<string, string[]>();
  for (const lead of leads) {
    if (!lead.issue_id) continue;
    const urls = (photoRows ?? [])
      .filter((p) => p.related_id === lead.issue_id)
      .map((p) => p.url as string)
      .filter(Boolean);
    if (urls.length) byLead.set(lead.id, urls);
  }
  return byLead;
}

// Total the pro has spent: every wallet transaction whose combined cash+bonus
// delta is negative, as a positive number of cents. Credits (positive deltas)
// don't net against it - this is "spent on applications", not a balance.
export function totalSpentCents(
  txnRows:
    | {
        cash_delta_cents?: number | string | null;
        bonus_delta_cents?: number | string | null;
      }[]
    | null
    | undefined
): number {
  return (txnRows ?? []).reduce((sum, t) => {
    const delta =
      Number(t.cash_delta_cents ?? 0) + Number(t.bonus_delta_cents ?? 0);
    return delta < 0 ? sum + Math.abs(delta) : sum;
  }, 0);
}
