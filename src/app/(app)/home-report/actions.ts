"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { setFlash } from "@/lib/flash";

// Owner-entered dollars -> integer cents, so money never touches the database
// as a float. Returns null for blank/invalid/zero input (cost is optional).
function toCents(v: FormDataEntryValue | null): number | null {
  if (!v) return null;
  const n = Number(String(v).trim().replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

// Log a maintenance record the owner already knows happened (a past service,
// repair, or replacement) - never AI-generated or inferred. This is the only
// way an entry lands in the report's maintenance history beyond checking off
// a reminder, and it writes to the exact same maintenance_tasks table/status
// the dashboard's "mark done" flow uses, so a manual entry here shows up
// anywhere else that reads completed tasks, and vice versa.
export async function addMaintenanceHistoryAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");

  const title = ((formData.get("title") as string) || "").trim();
  const date = ((formData.get("completed_date") as string) || "").trim();
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    setFlash("Add what was done and a date.", "error");
    return;
  }
  const performedBy =
    ((formData.get("performed_by") as string) || "").trim() || null;
  const costCents = toCents(formData.get("cost"));
  // Noon UTC avoids a date shifting a day in either direction across
  // timezones; only the date part is ever shown or deduped on.
  const completedAt = new Date(`${date}T12:00:00Z`).toISOString();

  const supabase = createClient();

  // Guard duplicate inserts here too (belt-and-suspenders with the DB unique
  // index from migration 0061, which may not be applied to the live database
  // yet): the same title landing on the same day at the same property is the
  // same real-world event, not a second one.
  const { data: existing } = await supabase
    .from("maintenance_tasks")
    .select("title, completed_at")
    .eq("property_id", property.id)
    .eq("status", "done")
    .not("completed_at", "is", null);
  const isDupe = (existing ?? []).some(
    (t) =>
      t.title.trim().toLowerCase() === title.toLowerCase() &&
      t.completed_at?.slice(0, 10) === date
  );
  if (isDupe) {
    setFlash("That's already in your maintenance history.", "info");
    return;
  }

  const baseRow = {
    property_id: property.id,
    title,
    status: "done",
    completed_at: completedAt,
  };

  // cost_cents / performed_by are migration 0061 columns, not yet in the
  // generated types (hence the cast). Retry without them so logging history
  // never breaks if that migration hasn't run against the live database yet
  // - same pattern as the HVAC filter fields in profile/actions.ts.
  let { error } = await supabase.from("maintenance_tasks").insert({
    ...baseRow,
    cost_cents: costCents,
    performed_by: performedBy,
  } as any);
  if (error) {
    ({ error } = await supabase.from("maintenance_tasks").insert(baseRow));
  }
  if (error) {
    setFlash("Couldn't save that entry. Please try again.", "error");
    return;
  }

  setFlash("Added to your maintenance history.");
  revalidatePath("/home-report");
  revalidatePath("/dashboard");
}
