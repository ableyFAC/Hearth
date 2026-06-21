"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Mark a reminder (maintenance task) done. RLS limits it to the caller's tasks.
export async function completeReminderAction(id: string) {
  const supabase = createClient();
  await supabase
    .from("maintenance_tasks")
    .update({ status: "done" })
    .eq("id", id);
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
