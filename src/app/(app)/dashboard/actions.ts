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
// The plan stays small and encouraging. Each scheduled task becomes ONE upcoming
// reminder, staggered so quick checks land within a couple of weeks and bigger
// jobs a month or two out. Re-running only adds task types you do not already
// have open, so the list never balloons and never duplicates.

// Always scheduled, regardless of the home's systems. dueInDays = when the next
// occurrence lands (small/quick tasks sooner, bigger ones later).
const ALWAYS_SCHEDULE: Array<{ title: string; dueInDays: number }> = [
  { title: "Test smoke and CO detectors", dueInDays: 10 },
  { title: "Clean gutters and downspouts", dueInDays: 45 },
];

// Extra tasks added only when that system is on the property's inventory.
const SYSTEM_SCHEDULE: Record<
  string,
  Array<{ title: string; dueInDays: number }>
> = {
  hvac: [
    { title: "Replace HVAC air filter", dueInDays: 14 },
    { title: "Schedule an HVAC tune-up", dueInDays: 60 },
  ],
  water_heater: [{ title: "Flush the water heater", dueInDays: 75 }],
  roof: [{ title: "Inspect roof and flashing", dueInDays: 50 }],
  plumbing: [
    { title: "Check under sinks and around toilets for leaks", dueInDays: 20 },
  ],
  electrical_panel: [
    { title: "Test GFCI outlets and breakers", dueInDays: 30 },
  ],
  appliance: [
    { title: "Clean the dryer vent and refrigerator coils", dueInDays: 40 },
  ],
  windows: [{ title: "Check window caulk and weatherstripping", dueInDays: 55 }],
  foundation: [
    {
      title: "Walk the foundation and grading for cracks or pooling",
      dueInDays: 65,
    },
  ],
  sewer_line: [
    { title: "Watch for slow drains, consider a sewer scope", dueInDays: 70 },
  ],
};

// Keep the plan digestible.
const MAX_PLAN_TASKS = 12;

function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  // Local date parts, not toISOString (UTC), so due dates match the real calendar.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Plus-only: builds a short, staggered set of maintenance reminders tailored to
// the active property's systems, adding only task types not already open.
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

  const schedule = [
    ...ALWAYS_SCHEDULE,
    ...[...systemTypes].flatMap((t) => SYSTEM_SCHEDULE[t] ?? []),
  ];

  // Task types already open, so re-running never piles on a duplicate.
  const { data: existing } = await supabase
    .from("maintenance_tasks")
    .select("title")
    .eq("property_id", property.id)
    .eq("status", "open");
  const openTitles = new Set((existing ?? []).map((t) => t.title));

  const today = new Date(Date.now());
  const seen = new Set<string>();
  const rows = schedule
    .filter((s) => {
      if (openTitles.has(s.title) || seen.has(s.title)) return false;
      seen.add(s.title);
      return true;
    })
    .slice(0, MAX_PLAN_TASKS)
    .map((s) => ({
      property_id: property.id,
      title: s.title,
      due_date: addDays(today, s.dueInDays),
      status: "open",
    }));

  if (rows.length > 0) {
    await supabase.from("maintenance_tasks").insert(rows);
    setFlash("Your maintenance plan is ready. Check your reminders.", "success");
  } else {
    setFlash("Your maintenance plan is already up to date.", "info");
  }
  revalidatePath("/dashboard");
}
