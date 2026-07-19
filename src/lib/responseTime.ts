// Speed-to-lead stat: how fast a pro typically applies after a job posts,
// computed purely from timestamps that already exist (contractor_leads.created_at
// and lead_applications.created_at). No schema change, no new column.
//
// RLS note: a contractor's own "leads contractor select" policy only covers
// contractor_leads rows currently assigned to them (contractor_id = their own
// id), but most of a pro's application history is against jobs that stayed
// open or went to someone else, so a user-scoped client can't read those
// leads' created_at. Callers should pass the admin client (createAdminClient())
// here; this module only ever reads the two timestamp/id columns it needs off
// lead_applications and contractor_leads, nothing homeowner-identifying.

// How many of a pro's most recent applications feed the median. Small and
// bounded so this never becomes an unbounded read.
export const RESPONSE_TIME_SAMPLE_SIZE = 20;

// Fewer data points than this and a "typical" reply time is noise, not a stat.
const MIN_APPLICATIONS = 3;

type LeadApplicationRow = {
  contractor_id: string | null;
  lead_id: string | null;
  created_at: string | null;
};

function median(sortedAsc: number[]): number {
  const mid = Math.floor(sortedAsc.length / 2);
  return sortedAsc.length % 2 !== 0
    ? sortedAsc[mid]
    : (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
}

function medianMinutes(minutes: number[]): number | null {
  if (minutes.length < MIN_APPLICATIONS) return null;
  return median([...minutes].sort((a, b) => a - b));
}

// Single-contractor convenience wrapper around the batch computation below.
export async function computeResponseTimeMinutes(
  supabase: any,
  contractorId: string
): Promise<number | null> {
  const byContractor = await computeResponseTimeMinutesBatch(supabase, [
    contractorId,
  ]);
  return byContractor.get(contractorId) ?? null;
}

// Sanity cap on the single batched query below: comfortably more rows than
// any realistic combined history for a page's worth of applicant contractors
// (mirrors the 1000-row cap on wallet_transactions in pro/business/page.tsx).
// Rows are ordered contractor_id-then-newest-first, so as long as no single
// batch's total live application history blows past this cap, every
// contractor still gets its own full newest-N window below - this only
// exists as a backstop against a truly unbounded read, not as a per-contractor
// limit (that job is done in JS, same as before).
const BATCH_ROW_CAP = 2000;

// Batched for applicant cards: ONE query for every contractor's recent
// applications (previously one query per contractor, in parallel), ordered so
// each contractor's rows land together and newest-first within the group.
// Slicing to RESPONSE_TIME_SAMPLE_SIZE per contractor in JS below reproduces
// exactly the same "at most N rows per contractor" result the old N queries
// gave, just fetched in a single round trip.
export async function computeResponseTimeMinutesBatch(
  supabase: any,
  contractorIds: string[]
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  const ids = Array.from(new Set(contractorIds.filter(Boolean)));
  if (ids.length === 0) return result;

  const { data, error } = await supabase
    .from("lead_applications")
    .select("contractor_id, lead_id, created_at")
    .in("contractor_id", ids)
    .order("contractor_id", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(BATCH_ROW_CAP);
  const fetchedRows: LeadApplicationRow[] = error
    ? []
    : ((data ?? []) as LeadApplicationRow[]);

  // Bounded: at most RESPONSE_TIME_SAMPLE_SIZE rows per contractor, newest
  // first - same cap the old per-contractor query enforced via .limit(), now
  // enforced here since rows for a given contractor are grouped together
  // (ordered by contractor_id) and already newest-first within the group.
  const byContractor = new Map<string, LeadApplicationRow[]>();
  const allRows: LeadApplicationRow[] = [];
  for (const row of fetchedRows) {
    if (!row.contractor_id || !row.lead_id || !row.created_at) continue;
    const bucket = byContractor.get(row.contractor_id) ?? [];
    if (bucket.length >= RESPONSE_TIME_SAMPLE_SIZE) continue;
    bucket.push(row);
    byContractor.set(row.contractor_id, bucket);
    allRows.push(row);
  }

  const leadIds = Array.from(
    new Set(allRows.map((a) => a.lead_id).filter(Boolean))
  ) as string[];
  if (leadIds.length === 0) {
    for (const id of ids) result.set(id, null);
    return result;
  }

  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("id, created_at")
    .in("id", leadIds)
    // Implicitly bounded by leadIds (itself capped at ids * sample size);
    // explicit limit kept for consistency with the defensive style here.
    .limit(leadIds.length);
  const postedAtByLead = new Map<string, string>(
    ((leads ?? []) as { id: string; created_at: string }[]).map((l) => [
      l.id,
      l.created_at,
    ])
  );

  for (const id of ids) {
    const rows = byContractor.get(id) ?? [];
    const minutes: number[] = [];
    for (const row of rows) {
      const postedAt = postedAtByLead.get(row.lead_id!);
      if (!postedAt) continue;
      const postedMs = new Date(postedAt).getTime();
      const appliedMs = new Date(row.created_at!).getTime();
      if (!Number.isFinite(postedMs) || !Number.isFinite(appliedMs)) continue;
      const diff = (appliedMs - postedMs) / 60_000;
      if (diff >= 0) minutes.push(diff);
    }
    result.set(id, medianMinutes(minutes));
  }

  return result;
}

// Honest, coarse phrasing only: absence (null) is the correct state for a
// slow or unproven reply time, so a slow pro shows nothing rather than a
// discouraging number.
export function formatResponseTime(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return "Typically replies within the hour";
  if (minutes < 240) return "Typically replies within a few hours";
  if (minutes < 1440) return "Typically replies the same day";
  return null;
}
