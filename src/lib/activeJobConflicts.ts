import { createAdminClient } from "@/lib/supabase/admin";

// Marketplace integrity: a pro with an ACTIVE job for a homeowner (assigned
// and not yet closed or lost) shouldn't buy a second lead from that same
// homeowner in that same category. They already have the homeowner in
// Messages, so a second apply fee double-charges the pro and looks broken to
// the homeowner. Boundaries that matter just as much as the rule:
//
//  - Once the earlier job is closed (won) or lost, applying again is fine:
//    rehires are the highest-value loop and must never be blocked.
//  - A different category with the same homeowner is always allowed.
//  - A different homeowner is always allowed.
//
// "Same homeowner" means the property owner (properties.user_id), the same
// identity rehire_pro (migration 0030) uses for prior-hire history. Open jobs
// hide the homeowner behind RLS, so the lookups run on the admin client; this
// module is server-only and returns nothing beyond what the pro already has
// (the id and name of their own active lead).

export type ActiveJobConflict = {
  // The pro's own active lead: where the existing Messages thread lives.
  activeLeadId: string;
  // Snapshot name off that lead, for "Message <name>" copy.
  homeownerName: string | null;
  // The shared category (raw value, not label).
  category: string;
};

// For a contractor and a set of open job ids, returns a map of open job id ->
// conflict for every job posted by a homeowner the pro already has an active
// job with in the same category. Best-effort by design: on any lookup hiccup
// it logs and returns what it has, so a transient error can never lock a pro
// out of applying to everything (the DB-side guard in apply_to_lead is the
// hard backstop).
export async function findActiveJobConflicts(
  contractorId: string,
  openLeadIds: string[]
): Promise<Map<string, ActiveJobConflict>> {
  const conflicts = new Map<string, ActiveJobConflict>();
  if (!contractorId || openLeadIds.length === 0) return conflicts;

  try {
    const admin = createAdminClient();

    // The pro's active jobs: assigned to them and still in flight. "Active"
    // matches the pro dashboard's own definition (anything not closed/lost).
    const { data: activeLeads } = await admin
      .from("contractor_leads")
      .select("id, category, property_id, homeowner_name, created_at")
      .eq("contractor_id", contractorId)
      .not("status", "in", "(closed,lost)")
      .order("created_at", { ascending: false });
    if (!activeLeads || activeLeads.length === 0) return conflicts;

    // Resolve each active lead's property to its owner.
    const activePropertyIds = Array.from(
      new Set(activeLeads.map((l) => l.property_id).filter(Boolean))
    );
    if (activePropertyIds.length === 0) return conflicts;
    const { data: activeProps } = await admin
      .from("properties")
      .select("id, user_id")
      .in("id", activePropertyIds);
    const ownerByProperty = new Map<string, string>(
      (activeProps ?? []).map((p) => [p.id, p.user_id])
    );

    // owner + category -> the pro's newest active lead for that relationship
    // (newest wins, so the Message link opens the freshest thread).
    const activeByRelationship = new Map<string, ActiveJobConflict>();
    for (const lead of activeLeads) {
      const owner = ownerByProperty.get(lead.property_id);
      if (!owner) continue;
      const key = `${owner}|${lead.category}`;
      if (!activeByRelationship.has(key)) {
        activeByRelationship.set(key, {
          activeLeadId: lead.id,
          homeownerName: lead.homeowner_name,
          category: lead.category,
        });
      }
    }
    if (activeByRelationship.size === 0) return conflicts;

    // Now the open jobs being considered: same owner + category means the pro
    // already has this relationship live.
    const { data: openLeads } = await admin
      .from("contractor_leads")
      .select("id, category, property_id")
      .in("id", openLeadIds);
    if (!openLeads || openLeads.length === 0) return conflicts;

    const openPropertyIds = Array.from(
      new Set(
        openLeads
          .map((l) => l.property_id)
          .filter((id) => Boolean(id) && !ownerByProperty.has(id))
      )
    );
    if (openPropertyIds.length > 0) {
      const { data: openProps } = await admin
        .from("properties")
        .select("id, user_id")
        .in("id", openPropertyIds);
      for (const p of openProps ?? []) ownerByProperty.set(p.id, p.user_id);
    }

    for (const job of openLeads) {
      const owner = ownerByProperty.get(job.property_id);
      if (!owner) continue;
      const hit = activeByRelationship.get(`${owner}|${job.category}`);
      if (hit) conflicts.set(job.id, hit);
    }
  } catch (err) {
    console.error(
      "active job conflict check:",
      err instanceof Error ? err.message : err
    );
  }

  return conflicts;
}
