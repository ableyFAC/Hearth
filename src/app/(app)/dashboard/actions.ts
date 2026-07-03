"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { hasPlus } from "@/lib/subscription";
import { setFlash } from "@/lib/flash";

// Mark a reminder (maintenance task) done. RLS limits it to the caller's tasks.
export async function completeReminderAction(id: string) {
  const supabase = createClient();
  await supabase
    .from("maintenance_tasks")
    .update({ status: "done" })
    .eq("id", id);
  revalidatePath("/dashboard");
}

// Delete a reminder entirely (offered only after it's checked off).
export async function deleteReminderAction(id: string) {
  const supabase = createClient();
  await supabase.from("maintenance_tasks").delete().eq("id", id);
  revalidatePath("/dashboard");
}

// Edit a reminder's title / due date.
export async function editReminderAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = createClient();
  await supabase
    .from("maintenance_tasks")
    .update({
      title: ((formData.get("title") as string) || "").trim() || "Reminder",
      due_date: (formData.get("due_date") as string) || null,
    })
    .eq("id", id);
  revalidatePath("/dashboard");
}

// Undo: put a reminder back to open (in case it was checked off by accident).
export async function uncompleteReminderAction(id: string) {
  const supabase = createClient();
  await supabase
    .from("maintenance_tasks")
    .update({ status: "open" })
    .eq("id", id);
  revalidatePath("/dashboard");
}

// --- Hearth Plus: personalized maintenance plan ---
//
// Every home gets these two, regardless of its system inventory.
const ALWAYS_SCHEDULE: Array<{ title: string; everyMonths: number }> = [
  { title: "Test smoke and CO detectors", everyMonths: 6 },
  { title: "Clean gutters and downspouts", everyMonths: 6 },
];

// Additional tasks, keyed by system_type, added only when that system is on
// the property's home_systems inventory.
const SYSTEM_SCHEDULE: Record<string, Array<{ title: string; everyMonths: number }>> = {
  hvac: [
    { title: "Replace HVAC air filter", everyMonths: 3 },
    { title: "Schedule an HVAC tune-up", everyMonths: 12 },
  ],
  water_heater: [{ title: "Flush the water heater", everyMonths: 12 }],
  roof: [{ title: "Inspect roof and flashing", everyMonths: 12 }],
  plumbing: [
    { title: "Check under sinks and around toilets for leaks", everyMonths: 6 },
  ],
  electrical_panel: [{ title: "Test GFCI outlets and breakers", everyMonths: 6 }],
  appliance: [
    { title: "Clean the dryer vent and refrigerator coils", everyMonths: 12 },
  ],
  windows: [{ title: "Check window caulk and weatherstripping", everyMonths: 12 }],
  foundation: [
    { title: "Walk the foundation and grading for cracks or pooling", everyMonths: 12 },
  ],
  sewer_line: [
    { title: "Watch for slow drains, consider a sewer scope", everyMonths: 12 },
  ],
};

// Safety cap so a plan can never balloon the reminders list.
const MAX_PLAN_INSERTS = 40;

function addMonths(base: Date, months: number): string {
  const d = new Date(base.getTime());
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Builds one year of due dates for a recurring task: today + N, +2N, ... up to
// 12 months out (every 3 months -> 4 tasks, every 6 -> 2, every 12 -> 1).
function occurrencesOverAYear(
  base: Date,
  title: string,
  everyMonths: number
): Array<{ title: string; due_date: string }> {
  const count = Math.floor(12 / everyMonths);
  const rows: Array<{ title: string; due_date: string }> = [];
  for (let i = 1; i <= count; i++) {
    rows.push({ title, due_date: addMonths(base, everyMonths * i) });
  }
  return rows;
}

// Plus-only: builds a year of maintenance reminders tailored to the active
// property's system inventory, skipping anything already on the books.
export async function generateMaintenancePlanAction() {
  const plus = await hasPlus();
  if (!plus) redirect("/plus?reason=plan");

  const property = await getActiveProperty();
  if (!property) redirect("/dashboard");

  const supabase = createClient();
  const { data: systems } = await supabase
    .from("home_systems")
    .select("system_type")
    .eq("property_id", property.id);
  const systemTypes = new Set((systems ?? []).map((s) => s.system_type));

  const today = new Date(Date.now());
  let candidates: Array<{ title: string; due_date: string }> = [];
  for (const item of ALWAYS_SCHEDULE) {
    candidates = candidates.concat(
      occurrencesOverAYear(today, item.title, item.everyMonths)
    );
  }
  for (const systemType of systemTypes) {
    for (const item of SYSTEM_SCHEDULE[systemType] ?? []) {
      candidates = candidates.concat(
        occurrencesOverAYear(today, item.title, item.everyMonths)
      );
    }
  }
  candidates = candidates.slice(0, MAX_PLAN_INSERTS);

  // Dedupe against this property's existing open tasks (same title + due date).
  const { data: existing } = await supabase
    .from("maintenance_tasks")
    .select("title, due_date")
    .eq("property_id", property.id)
    .eq("status", "open");
  const existingKeys = new Set(
    (existing ?? []).map((t) => `${t.title}|${t.due_date ?? ""}`)
  );

  const rows = candidates
    .filter((c) => !existingKeys.has(`${c.title}|${c.due_date}`))
    .map((c) => ({
      property_id: property.id,
      title: c.title,
      due_date: c.due_date,
      status: "open",
    }));

  if (rows.length > 0) {
    await supabase.from("maintenance_tasks").insert(rows);
  }

  setFlash("Your maintenance plan is ready. Check your reminders.", "success");
  revalidatePath("/dashboard");
}
