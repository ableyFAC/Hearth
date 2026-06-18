"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { DEFAULT_LIFESPANS } from "@/lib/health";
import { setFlash } from "@/lib/flash";
import { labelFor, SYSTEM_TYPES } from "@/lib/constants";

export async function addSystemAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
  const supabase = createClient();

  const num = (k: string) => {
    const v = formData.get(k);
    return v ? Number(v) : null;
  };
  const systemType = formData.get("system_type") as string;

  const { error } = await supabase.from("home_systems").insert({
    property_id: property.id,
    system_type: systemType,
    material_or_model: (formData.get("material_or_model") as string) || null,
    install_year: num("install_year"),
    last_serviced: (formData.get("last_serviced") as string) || null,
    condition_rating: num("condition_rating"),
    // Seed the expected lifespan from the type default so the dashboard works
    // immediately; the owner never has to know typical lifespans.
    expected_lifespan_years: DEFAULT_LIFESPANS[systemType] ?? null,
    notes: (formData.get("notes") as string) || null,
  });

  if (error) throw new Error(error.message);
  setFlash(`Added ${labelFor(SYSTEM_TYPES, systemType)}`);
  revalidatePath("/profile");
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
  revalidatePath("/profile");
  revalidatePath("/dashboard");
}

export async function deleteSystemAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = createClient();
  // RLS guarantees the row belongs to the caller's property.
  const { error } = await supabase.from("home_systems").delete().eq("id", id);
  if (error) throw new Error(error.message);
  setFlash("System removed", "info");
  revalidatePath("/profile");
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
      purchase_date: (formData.get("purchase_date") as string) || null,
    })
    .eq("id", property.id);

  if (error) throw new Error(error.message);
  setFlash("Home details saved");
  revalidatePath("/profile");
  revalidatePath("/dashboard");
}
