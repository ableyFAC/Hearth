"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_HOME_COOKIE, getProperties } from "@/lib/property";
import { lookupParcel, type ParcelFacts } from "@/lib/parcel";
import { DEFAULT_LIFESPANS } from "@/lib/health";
import { hasPlus } from "@/lib/subscription";
import { setFlash } from "@/lib/flash";

// Systems virtually every home has - auto-added so the owner doesn't start from
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
const CURRENT_YEAR = new Date().getFullYear();

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
  if (!user) redirect("/signin");

  // Free vs Plus home limits: a free homeowner may claim 1 home; Plus unlocks
  // up to 5 so a landlord/multi-property owner can track them all in one place.
  const [existingHomes, plus] = await Promise.all([getProperties(), hasPlus()]);
  if (!plus && existingHomes.length >= 1) {
    redirect("/plus?reason=home_limit");
  }
  if (plus && existingHomes.length >= 5) {
    setFlash("Hearth Plus covers up to 5 homes.", "error");
    redirect("/dashboard");
  }

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
      if (age <= 0) {
        // Brand-new (or future-dated) build: everything installed at build.
        install_year = yearBuilt;
      } else {
        // Years since the most recent assumed replacement. When home age is
        // an exact multiple of the lifespan, the system is at the END of its
        // life, not brand new: a 75-year-old home does not get a brand-new
        // 75-year foundation.
        const yearsIntoCycle = age % lifespan || lifespan;
        install_year = CURRENT_YEAR - yearsIntoCycle;
      }
    }
    return {
      property_id: created.id,
      system_type,
      install_year,
      expected_lifespan_years: lifespan,
      // No per-system note - the "auto-estimated" notice lives at the top of
      // the Home Profile page instead.
      notes: null as string | null,
    };
  });
  await supabase.from("home_systems").insert(starterRows);

  revalidatePath("/", "layout");
  // Send them to their Home page to add systems next.
  redirect("/dashboard?welcome=1");
}
