"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { DEFAULT_LIFESPANS } from "@/lib/health";
import { setFlash } from "@/lib/flash";
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

export async function addSystemAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
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

  // HVAC filter reminder fields are migration 0042 columns not yet in the
  // generated types (hence the cast). If the migration has not run, retry
  // without them so adding a system never breaks - same pattern as
  // pro/actions.
  const filter = filterFields(formData);
  let { data: row, error } = filter
    ? await supabase
        .from("home_systems")
        .insert({ ...baseRow, ...filter } as any)
        .select("id")
        .single()
    : await supabase.from("home_systems").insert(baseRow).select("id").single();
  if (error && filter) {
    ({ data: row, error } = await supabase
      .from("home_systems")
      .insert(baseRow)
      .select("id")
      .single());
  }

  if (error || !row) throw new Error(error?.message ?? "insert failed");
  await attachPhotos(formData, property.id, row.id);
  setFlash(`Added ${labelFor(SYSTEM_TYPES, systemType)}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard");
}

// One-tap add: create a system with just its type + default lifespan. The owner
// can fill in year/condition later. Powers the quick-add chips on the profile.
export async function quickAddSystemAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
  const supabase = createClient();

  const systemType = formData.get("system_type") as string;
  const { error } = await supabase.from("home_systems").insert({
    property_id: property.id,
    system_type: systemType,
    expected_lifespan_years: DEFAULT_LIFESPANS[systemType] ?? null,
  });
  if (error) throw new Error(error.message);
  setFlash(`Added ${labelFor(SYSTEM_TYPES, systemType)}`);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard");
}

export async function deleteSystemAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = createClient();
  // RLS guarantees the row belongs to the caller's property.
  const { error } = await supabase.from("home_systems").delete().eq("id", id);
  if (error) throw new Error(error.message);
  setFlash("System removed", "info");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard");
}

export async function updateSystemAction(formData: FormData) {
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

  // HVAC filter reminder fields (migration 0042, not in generated types yet).
  // Only written when the edit form actually sent them; if the columns are
  // missing (migration not run), retry without them so saving never breaks.
  // RLS guarantees the row belongs to the caller's property.
  const filter = filterFields(formData);
  let { error } = filter
    ? await supabase
        .from("home_systems")
        .update({ ...baseUpdate, ...filter } as any)
        .eq("id", id)
    : await supabase.from("home_systems").update(baseUpdate).eq("id", id);
  if (error && filter) {
    ({ error } = await supabase
      .from("home_systems")
      .update(baseUpdate)
      .eq("id", id));
  }
  if (error) throw new Error(error.message);

  const property = await getActiveProperty();
  if (property) await attachPhotos(formData, property.id, id);
  setFlash("System updated");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard");
}

export async function updatePropertyAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
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

  if (error) throw new Error(error.message);
  setFlash("Home details saved");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard");
}
