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

// Batched for applicant cards: one small query PER contractor for their own
// recent applications (in parallel), then one shared query for all the leads
// they applied to. A single shared .limit across all contractors looks
// cheaper but starves the low-volume pros: one prolific applicant's rows can
// fill the whole shared window, so real 3+-application pros silently lose
// their reply-speed line. Applicant lists are small (3-applicant cap per
// job), so a handful of limit-20 queries is the honest, still-cheap shape.
export async function computeResponseTimeMinutesBatch(
  supabase: any,
  contractorIds: string[]
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  const ids = Array.from(new Set(contractorIds.filter(Boolean)));
  if (ids.length === 0) return result;

  // Bounded: at most RESPONSE_TIME_SAMPLE_SIZE rows per contractor, newest
  // first, guaranteed per contractor (not shared across the batch).
  const perContractor = await Promise.all(
    ids.map((id) =>
      supabase
        .from("lead_applications")
        .select("contractor_id, lead_id, created_at")
        .eq("contractor_id", id)
        .order("created_at", { ascending: false })
        .limit(RESPONSE_TIME_SAMPLE_SIZE)
        .then(({ data, error }: { data: unknown; error: unknown }) =>
          error ? [] : ((data ?? []) as LeadApplicationRow[])
        )
    )
  );

  const byContractor = new Map<string, LeadApplicationRow[]>();
  const allRows: LeadApplicationRow[] = [];
  for (const rows of perContractor) {
    for (const row of rows) {
      if (!row.contractor_id || !row.lead_id || !row.created_at) continue;
      const bucket = byContractor.get(row.contractor_id) ?? [];
      bucket.push(row);
      byContractor.set(row.contractor_id, bucket);
      allRows.push(row);
    }
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
