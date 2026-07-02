"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { setFlash } from "@/lib/flash";
import { DEFAULT_LIFESPANS } from "@/lib/health";
import { labelFor, SYSTEM_TYPES } from "@/lib/constants";

// The vault's write path. The client uploads the file and runs vision
// extraction first; these actions persist the result and, on the owner's
// say-so, push the facts into the digital twin. RLS scopes every write to the
// caller's own property.

function s(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  const t = typeof v === "string" ? v.trim() : "";
  return t.length ? t : null;
}

// Save an uploaded document + its extracted facts to the vault.
export async function saveDocumentAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
  const supabase = createClient();

  const fileUrl = s(formData, "file_url");
  if (!fileUrl) throw new Error("No file uploaded");

  const yearRaw = s(formData, "install_year");
  const year = yearRaw ? Number(yearRaw) : null;

  const { error } = await supabase.from("documents").insert({
    property_id: property.id,
    file_url: fileUrl,
    doc_type: s(formData, "doc_type"),
    title: s(formData, "title") ?? "Home document",
    brand: s(formData, "brand"),
    model: s(formData, "model"),
    install_year: Number.isInteger(year as number) ? year : null,
    warranty_expires: s(formData, "warranty_expires"),
    system_type: s(formData, "system_type"),
    summary: s(formData, "summary"),
  });
  if (error) throw new Error(error.message);

  setFlash("Saved to your documents.", "success");
  revalidatePath("/documents");
}

// Push a saved document's facts into the digital twin: update the matching home
// system (or create it), and, if the doc carries a warranty date, set a
// reminder so the owner hears about it before coverage lapses.
export async function applyDocumentToTwinAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
  const supabase = createClient();

  const id = s(formData, "id");
  if (!id) throw new Error("No document");

  const { data: doc } = await supabase
    .from("documents")
    .select(
      "id, system_type, brand, model, install_year, warranty_expires, title"
    )
    .eq("id", id)
    .maybeSingle();
  if (!doc) throw new Error("Document not found");

  const material =
    [doc.brand, doc.model].filter(Boolean).join(" ").trim() || null;

  let touchedSystem = false;
  if (doc.system_type) {
    // Update the existing system of this type, if there is one; otherwise add it.
    const { data: existing } = await supabase
      .from("home_systems")
      .select("id, material_or_model, install_year")
      .eq("property_id", property.id)
      .eq("system_type", doc.system_type)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("home_systems")
        .update({
          // Only fill blanks / newer facts; don't clobber what the owner set.
          material_or_model: existing.material_or_model ?? material,
          install_year: doc.install_year ?? existing.install_year,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("home_systems").insert({
        property_id: property.id,
        system_type: doc.system_type,
        material_or_model: material,
        install_year: doc.install_year,
        expected_lifespan_years: DEFAULT_LIFESPANS[doc.system_type] ?? null,
      });
    }
    touchedSystem = true;
  }

  // A warranty date the owner would otherwise forget → a dated reminder.
  if (doc.warranty_expires) {
    const label = doc.title || "your home document";
    await supabase.from("maintenance_tasks").insert({
      property_id: property.id,
      title: `Warranty expires: ${label}`,
      due_date: doc.warranty_expires,
      status: "open",
    });
  }

  await supabase
    .from("documents")
    .update({ applied_at: new Date().toISOString() })
    .eq("id", id);

  const sysLabel = doc.system_type
    ? labelFor(SYSTEM_TYPES, doc.system_type)
    : null;
  setFlash(
    touchedSystem
      ? `Added to your home${sysLabel ? ` (${sysLabel})` : ""}.`
      : "Saved to your home record.",
    "success"
  );
  revalidatePath("/documents");
  revalidatePath("/dashboard");
}

export async function deleteDocumentAction(formData: FormData) {
  const supabase = createClient();
  const id = s(formData, "id");
  if (!id) return;
  // RLS guarantees the row belongs to the caller's property.
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
  setFlash("Document removed", "info");
  revalidatePath("/documents");
}
