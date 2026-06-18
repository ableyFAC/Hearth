"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_HOME_COOKIE } from "@/lib/property";
import { lookupParcel, type ParcelFacts } from "@/lib/parcel";
import { DEFAULT_LIFESPANS } from "@/lib/health";

// Systems virtually every home has — auto-added so the owner doesn't start from
// a blank inventory. Install years are ESTIMATED from the build year; real
// install/repair/remodel dates come from permit data once that API is wired.
const STARTER_SYSTEMS = [
  "foundation",
  "plumbing",
  "electrical_panel",
  "roof",
  "hvac",
  "water_heater",
  "windows",
];
const CURRENT_YEAR = 2026; // keep in sync with src/lib/health.ts

// Step 1: pull baseline facts from the parcel layer for the entered address.
export async function lookupParcelAction(
  address: string
): Promise<ParcelFacts> {
  return lookupParcel(address);
}

// Step 2: create the property (self-attested ownership for MVP).
export async function claimPropertyAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const num = (key: string) => {
    const v = formData.get(key);
    return v ? Number(v) : null;
  };

  const { data: created, error } = await supabase
    .from("properties")
    .insert({
      user_id: user.id,
      parcel_id: (formData.get("parcel_id") as string) || null,
      address_line1: formData.get("address_line1") as string,
      city: (formData.get("city") as string) || null,
      state: (formData.get("state") as string) || null,
      zip: (formData.get("zip") as string) || null,
      year_built: num("year_built"),
      sqft: num("sqft"),
      beds: num("beds"),
      baths: num("baths"),
      lot_size_sqft: num("lot_size_sqft"),
      property_type: (formData.get("property_type") as string) || null,
      // Self-attestation for MVP. Tighten later (postcard / utility-bill check).
      ownership_verified: true,
    })
    .select("id")
    .single();

  if (error || !created) {
    throw new Error(`Could not claim property: ${error?.message ?? "unknown"}`);
  }

  // Make the new home the active one.
  cookies().set(ACTIVE_HOME_COOKIE, created.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Surface research: pre-build a starter inventory so the owner doesn't add
  // every system manually. Year is estimated from the build year (assuming each
  // system was replaced around the end of its typical life).
  const yearBuilt = num("year_built");
  const starterRows = STARTER_SYSTEMS.map((system_type) => {
    const lifespan = DEFAULT_LIFESPANS[system_type] ?? 20;
    let install_year: number | null = null;
    if (yearBuilt) {
      const age = CURRENT_YEAR - yearBuilt;
      install_year = age <= 0 ? yearBuilt : CURRENT_YEAR - (age % lifespan);
    }
    return {
      property_id: created.id,
      system_type,
      install_year,
      expected_lifespan_years: lifespan,
      notes: "Auto-added from your address — update the year if you know it.",
    };
  });
  await supabase.from("home_systems").insert(starterRows);

  revalidatePath("/", "layout");
  // Send them to build their Home Profile next.
  redirect("/profile?welcome=1");
}
