"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { setFlash } from "@/lib/flash";

// Ask Hearth proposes these via [[LOGISSUE]] / [[REMINDER]] blocks; the chat
// renders a button that calls one of these to write it to the home record. RLS
// limits writes to the caller's own property.

export async function logIssueFromChat(payload: {
  category: string;
  severity?: string;
  description?: string;
  system_type?: string;
  condition?: number | null;
}) {
  const property = await getActiveProperty();
  if (!property) return;
  const supabase = createClient();

  // Find the matching system first so we can LINK the issue to it. That link is
  // what lets resolving the issue later lift the red flag off the system on the
  // Home page (otherwise a chat-logged issue has no system_id to trace back to).
  let systemId: string | null = null;
  if (payload.system_type) {
    const { data: sys } = await supabase
      .from("home_systems")
      .select("id")
      .eq("property_id", property.id)
      .eq("system_type", payload.system_type)
      .maybeSingle();
    systemId = sys?.id ?? null;
  }

  await supabase.from("issues").insert({
    property_id: property.id,
    system_id: systemId,
    category: payload.category || "other",
    severity: payload.severity || "medium",
    description: payload.description || null,
    status: "open",
  });

  // Reflect the problem on the matching system by lowering its condition.
  if (systemId && payload.condition) {
    await supabase
      .from("home_systems")
      .update({ condition_rating: payload.condition })
      .eq("id", systemId);
  }

  setFlash("Logged to your home record.", "success");
  revalidatePath("/dashboard");
  revalidatePath("/issues");
}

export async function setReminderFromChat(payload: {
  title: string;
  due_date?: string;
}) {
  const property = await getActiveProperty();
  if (!property || !payload.title) return;
  const supabase = createClient();

  await supabase.from("maintenance_tasks").insert({
    property_id: property.id,
    title: payload.title,
    due_date: payload.due_date || null,
    status: "open",
  });

  setFlash("Reminder added to your tasks.", "success");
  revalidatePath("/dashboard");
}
