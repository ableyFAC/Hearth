"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { DEFAULT_LIFESPANS } from "@/lib/health";
import { setFlash } from "@/lib/flash";
import { ok, err, type ActionResult } from "@/lib/actionResult";
import { labelFor, SYSTEM_TYPES } from "@/lib/constants";

// "MM/YYYY" from the simple text field back to a "YYYY-MM-01" date for storage.
// Returns null if blank or not in that format.
function mmYyyyToDate(v: string | null): string | null {
  if (!v) return null;
  const m = v.trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[2]}-${m[1].padStart(2, "0")}-01`;
}

// The purchase date arrives from the form as a plain string. Only store a
// real YYYY-MM-DD with a year between 1900 and today; anything else becomes
// null so a typo never blocks the rest of the property update. (The /value
// feature stores this column as YYYY-01-01 and only reads the year, so any
// valid date works for it.)
function validPurchaseDate(v: string | null): string | null {
  if (!v) return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const year = Number(s.slice(0, 4));
  if (year < 1900 || year > new Date().getFullYear()) return null;
  // Round-trip through Date to reject impossible days like 2020-02-31,
  // which would otherwise make Postgres reject the whole update.
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
    return null;
  }
  return s;
}

// HVAC filter reminder fields (consumables autopilot, migration 0042).
// Returns null when the form did not include them (non-hvac forms), so we
// never null out columns the owner could not see. Values are validated here:
// size capped at 20 chars, interval must be one of the offered choices.
const FILTER_INTERVAL_CHOICES = [1, 2, 3, 6, 12];

function filterFields(
  formData: FormData
): { filter_size: string | null; filter_interval_months: number | null } | null {
  if (!formData.has("filter_size") && !formData.has("filter_interval_months")) {
    return null;
  }
  const rawSize = ((formData.get("filter_size") as string) || "").trim();
  const size = rawSize && rawSize.length <= 20 ? rawSize : null;
  const rawInterval = (formData.get("filter_interval_months") as string) || "";
  const interval = rawInterval ? Number(rawInterval) : null;
  return {
    filter_size: size,
    filter_interval_months:
      interval != null && FILTER_INTERVAL_CHOICES.includes(interval)
        ? interval
        : null,
  };
}

// Exact model number + capacity / size (migration 0102), both optional free
// text. Returns null when the form did not include them (e.g. the dashboard
// quick-add chips), so we never null out columns the owner could not see.
// Each value is trimmed and capped so a stray huge paste can't land in the DB.
function modelCapacityFields(
  formData: FormData
): { model_number: string | null; capacity: string | null } | null {
  if (!formData.has("model_number") && !formData.has("capacity")) {
    return null;
  }
  const clean = (v: string) => {
    const t = v.trim();
    return t && t.length <= 60 ? t : t ? t.slice(0, 60) : null;
  };
  return {
    model_number: clean((formData.get("model_number") as string) || ""),
    capacity: clean((formData.get("capacity") as string) || ""),
  };
}

// Save any photos the owner uploaded (the PhotoUpload component already pushed
// them to storage and put the public URLs in the form as `photo_urls`). Photos
// are polymorphic, so we tag them with related_type "system".
async function attachPhotos(
  formData: FormData,
  propertyId: string,
  systemId: string
) {
  const urls = (formData.getAll("photo_urls") as string[]).filter(Boolean);
  if (!urls.length) return;
  const supabase = createClient();
  await supabase.from("photos").insert(
    urls.map((url) => ({
      property_id: propertyId,
      related_type: "system",
      related_id: systemId,
      url,
    }))
  );
}

// Used two ways: as a plain <form action> for the dashboard's one-tap quick-add
// chips (which never look at the return value, only the setFlash toast), and
// as a programmatic `await` from SystemForm's submit wrapper (which needs the
// ActionResult to keep the panel open and show an inline error on failure).
// Both paths get a flash + a typed result so neither call site is left guessing.
export async function addSystemAction(
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const property = await getActiveProperty();
  if (!property) {
    setFlash("Couldn't add that system. Try again.", "error");
    return err("No active property");
  }
  const supabase = createClient();

  const num = (k: string) => {
    const v = formData.get(k);
    return v ? Number(v) : null;
  };
  const systemType = formData.get("system_type") as string;

  const baseRow = {
    property_id: property.id,
    system_type: systemType,
    material_or_model: (formData.get("material_or_model") as string) || null,
    install_year: num("install_year"),
    last_serviced: mmYyyyToDate(formData.get("last_serviced") as string),
    condition_rating: num("condition_rating"),
    // Seed the expected lifespan from the type default so the dashboard works
    // immediately; the owner never has to know typical lifespans.
    expected_lifespan_years: DEFAULT_LIFESPANS[systemType] ?? null,
    notes: (formData.get("notes") as string) || null,
  };

  // Optional columns that a live DB might not have yet (HVAC filter reminder
  // fields, migration 0042; exact model_number + capacity, migration 0102).
  // Bundled together so that if EITHER migration has not run, a single retry
  // without them keeps adding a system working - same pattern as pro/actions.
  const filter = filterFields(formData);
  const modelCapacity = modelCapacityFields(formData);
  const extras =
    filter || modelCapacity
      ? { ...(filter ?? {}), ...(modelCapacity ?? {}) }
      : null;
  let { data: row, error } = extras
    ? await supabase
        .from("home_systems")
        .insert({ ...baseRow, ...extras } as any)
        .select("id")
        .single()
    : await supabase.from("home_systems").insert(baseRow).select("id").single();
  if (error && extras) {
    ({ data: row, error } = await supabase
      .from("home_systems")
      .insert(baseRow)
      .select("id")
      .single());
  }

  if (error || !row) {
    // Any photos the owner already picked were uploaded straight to storage
    // by PhotoUpload before this insert ran, so a failure here leaves them
    // orphaned (no DB row references them yet). Keeping this simple: surface
    // the error and let the owner retry from the still-open form, which will
    // attach those same photo URLs once the insert succeeds. Sweeping up
    // true orphans (the owner gives up instead of retrying) is left to
    // future janitor work, not built here.
    setFlash("Couldn't add that system. Try again.", "error");
    return err(error?.message ?? "insert failed");
  }
  await attachPhotos(formData, property.id, row.id);
  setFlash(`Added ${labelFor(SYSTEM_TYPES, systemType)}`);
  revalidatePath("/dashboard");
  revalidatePath("/home-report");
  return ok({ id: row.id });
}

// Form-action wrapper, toast-only callers: a plain <form action> prop needs a
// void-returning function, but addSystemAction returns an ActionResult for
// SystemForm's programmatic await. This just discards the result; the flash
// set inside addSystemAction is the only feedback these callers show.
export async function addSystemFormAction(formData: FormData): Promise<void> {
  await addSystemAction(formData);
}

// One-tap add: create a system with just its type + default lifespan. The owner
// can fill in year/condition later. Powers the quick-add chips on the profile.
export async function quickAddSystemAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) {
    setFlash("Couldn't add that system. Try again.", "error");
    return;
  }
  const supabase = createClient();

  const systemType = formData.get("system_type") as string;
  const { error } = await supabase.from("home_systems").insert({
    property_id: property.id,
    system_type: systemType,
    expected_lifespan_years: DEFAULT_LIFESPANS[systemType] ?? null,
  });
  if (error) {
    setFlash("Couldn't add that system. Try again.", "error");
    return;
  }
  setFlash(`Added ${labelFor(SYSTEM_TYPES, systemType)}`);
  revalidatePath("/dashboard");
  revalidatePath("/home-report");
}

// Plain <form action>, not called programmatically anywhere, so a setFlash
// error (rather than an ActionResult no one reads) is the right signal.
export async function deleteSystemAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = createClient();
  // RLS guarantees the row belongs to the caller's property.
  const { error } = await supabase.from("home_systems").delete().eq("id", id);
  if (error) {
    setFlash("Couldn't remove that system. Try again.", "error");
    return;
  }
  setFlash("System removed", "info");
  revalidatePath("/dashboard");
  revalidatePath("/home-report");
}

// Called programmatically from SystemRow's edit form so it can keep the panel
// open with the owner's edits intact and show an inline error on failure.
export async function updateSystemAction(
  formData: FormData
): Promise<ActionResult> {
  const id = formData.get("id") as string;
  const supabase = createClient();
  const num = (k: string) => {
    const v = formData.get(k);
    return v ? Number(v) : null;
  };
  const baseUpdate = {
    material_or_model: (formData.get("material_or_model") as string) || null,
    install_year: num("install_year"),
    last_serviced: mmYyyyToDate(formData.get("last_serviced") as string),
    condition_rating: num("condition_rating"),
    notes: (formData.get("notes") as string) || null,
  };

  // Optional columns a live DB might not have yet (filter reminder fields,
  // migration 0042; model_number + capacity, migration 0102). Only written
  // when the edit form actually sent them; if the columns are missing
  // (migration not run), retry without them so saving never breaks.
  // RLS guarantees the row belongs to the caller's property.
  const filter = filterFields(formData);
  const modelCapacity = modelCapacityFields(formData);
  const extras =
    filter || modelCapacity
      ? { ...(filter ?? {}), ...(modelCapacity ?? {}) }
      : null;
  let { error } = extras
    ? await supabase
        .from("home_systems")
        .update({ ...baseUpdate, ...extras } as any)
        .eq("id", id)
    : await supabase.from("home_systems").update(baseUpdate).eq("id", id);
  if (error && extras) {
    ({ error } = await supabase
      .from("home_systems")
      .update(baseUpdate)
      .eq("id", id));
  }
  if (error) {
    // As with addSystemAction, any newly-picked photos already sit in
    // storage by this point; a failed update just leaves them unattached.
    // Simple path: report the error, keep the edit form open so the owner
    // can retry (same photo URLs re-attach on success). Orphan cleanup is
    // future janitor work, not built here.
    return err(error.message);
  }

  const property = await getActiveProperty();
  if (property) await attachPhotos(formData, property.id, id);
  setFlash("System updated");
  revalidatePath("/dashboard");
  revalidatePath("/home-report");
  return ok();
}

// Not called from anywhere today (no home-details form wires it up yet), but
// kept crash-proof to match the rest of this file rather than left throwing.
export async function updatePropertyAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) {
    setFlash("Couldn't save home details. Try again.", "error");
    return;
  }
  const supabase = createClient();

  const num = (k: string) => {
    const v = formData.get(k);
    return v ? Number(v) : null;
  };

  const { error } = await supabase
    .from("properties")
    .update({
      year_built: num("year_built"),
      sqft: num("sqft"),
      beds: num("beds"),
      baths: num("baths"),
      lot_size_sqft: num("lot_size_sqft"),
      purchase_date: validPurchaseDate(
        (formData.get("purchase_date") as string) || null
      ),
    })
    .eq("id", property.id);

  if (error) {
    setFlash("Couldn't save home details. Try again.", "error");
    return;
  }
  setFlash("Home details saved");
  revalidatePath("/dashboard");
  revalidatePath("/home-report");
}
