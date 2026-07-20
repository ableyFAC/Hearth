"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ACTIVE_HOME_COOKIE, getProperties } from "@/lib/property";
import { lookupParcel, type ParcelFacts } from "@/lib/parcel";
import { DEFAULT_LIFESPANS } from "@/lib/health";
import { hasPlus } from "@/lib/subscription";
import { setFlash } from "@/lib/flash";
import { safeNextPath } from "@/lib/safeNext";
import { isMissingSchemaError } from "@/lib/dbErrors";
import { isOrangeCountyZip } from "@/lib/serviceArea";
import { ok, err, type ActionResult } from "@/lib/actionResult";

// The one message shown by every OC-only gate (this file's two checks, plus
// the fast client-side copy in OnboardingForm.tsx) - kept as a single
// constant so the wording can never drift between them.
const OC_ONLY_MESSAGE =
  "Hearth is Orange County only right now. We added you to the waitlist and will email you the moment we expand to your area.";

// Systems virtually every home has, auto-added so the owner doesn't start from
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

// A trimmed length floor for "this is actually an address." An <input
// required> is not enough on its own: browsers treat a single space as a
// non-empty value, so a hasty Enter press (or a stray keystroke) could
// otherwise carry a blank/junk address all the way into a claimed home. This
// is the authoritative check - the matching one in OnboardingForm.tsx is
// only there for faster client-side feedback.
const MIN_ADDRESS_LENGTH = 5;

// Records an out-of-area lead in market_waitlist (0074) for the signed-in
// user, so Hearth can email them when it expands to their ZIP. Shared by
// every OC-only gate below AND by OnboardingForm.tsx's own faster
// client-side ZIP check: that check short-circuits before ever calling
// lookupParcelAction, so without a direct call here someone rejected right
// there would never actually land on the waitlist. Returns an honest
// ActionResult instead of throwing, since the caller needs to tell the user
// plainly if the save itself failed, not just that they're out of area.
export async function joinMarketWaitlistAction(
  zip: string
): Promise<ActionResult<null>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return err("Please sign in to join the waitlist.");
  }

  const admin = createAdminClient();
  const { error } = await (admin as any).from("market_waitlist").insert({
    role: "homeowner",
    email: user.email,
    zip: zip.trim().slice(0, 5) || null,
  });

  // 23505: the unique index on (lower(email), role) means this email is
  // already on the waitlist - that's the outcome we wanted anyway, not a
  // real failure. Any other error (including the table not existing yet on
  // a live DB that hasn't run 0074) is a genuine save failure.
  if (error && error.code !== "23505") {
    return err("We couldn't save you to the waitlist.");
  }
  return ok(null);
}

// Step 1: pull baseline facts from the parcel layer for the entered address.
export async function lookupParcelAction(
  street: string,
  zip: string
): Promise<ParcelFacts> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in to look up your address.");

  if (street.trim().length < MIN_ADDRESS_LENGTH) {
    throw new Error("Enter your home's street address to continue.");
  }
  if (!/^\d{5}(-\d{4})?$/.test(zip.trim())) {
    throw new Error("Enter a valid 5-digit ZIP code.");
  }
  // Launch-restriction gate: checked before the rate limiter/RentCast call
  // below so an out-of-area address never spends a billed RentCast lookup.
  // OnboardingForm.tsx runs the same check client-side first and normally
  // never lets a rejected ZIP reach this action at all - this is the
  // fallback path (JS disabled, a modified client, or a direct call), so it
  // still logs the lead to the waitlist rather than silently dropping it.
  if (!isOrangeCountyZip(zip.trim())) {
    await joinMarketWaitlistAction(zip.trim());
    throw new Error(OC_ONLY_MESSAGE);
  }

  // Each lookup can make up to 2 billed RentCast calls, so gate abuse per user
  // with a fixed-window limiter (migration 0068). A DB hiccup here fails open:
  // onboarding must never break on the rate limiter, so only an explicit
  // `allowed === false` blocks.
  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    p_bucket: `parcel:${user.id}`,
    p_limit: 10,
    p_window_seconds: 3600,
  });
  if (allowed === false) {
    throw new Error("Too many address lookups. Please try again in a bit.");
  }
  // Daily ceiling on top of the hourly one (security audit finding #6): the
  // hourly limiter alone still lets one account burn 10 * 24 = 240 lookups a
  // day, each up to 2 billed RentCast calls, against a 50-lookups/MONTH free
  // tier. 25/day is generous for any real household (nobody looks up 25
  // addresses in a day) but caps the worst case at ~50 billed calls/day/
  // account instead of ~480. Same fixed-window limiter, same fail-open
  // behavior as the hourly check above - a rate-limiter hiccup must never
  // block a legit onboarding lookup.
  const { data: allowedDay } = await admin.rpc("rate_limit_hit", {
    p_bucket: `parcel-day:${user.id}`,
    p_limit: 25,
    p_window_seconds: 86400,
  });
  if (allowedDay === false) {
    throw new Error(
      "Too many address lookups today. Please try again tomorrow."
    );
  }

  return lookupParcel(street.trim(), zip.trim());
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
  // Homes merely shared with the user as a household member do not count
  // against their own limit, so only owned homes are tallied here.
  const [existingHomes, plus] = await Promise.all([getProperties(), hasPlus()]);
  const ownedHomes = existingHomes.filter((h) => !h.isShared);
  if (!plus && ownedHomes.length >= 1) {
    redirect("/plus?reason=home_limit");
  }
  if (plus && ownedHomes.length >= 5) {
    setFlash("Hearth Plus covers up to 5 homes.", "error");
    redirect("/dashboard");
  }

  // The authoritative address check: an <input required> alone is not enough
  // (a browser treats a single space as a non-empty value), so without this a
  // hasty Enter press or a stray keystroke could carry a blank/junk address
  // all the way into a claimed home. The matching check in OnboardingForm.tsx
  // is only there for faster client-side feedback - this one is what actually
  // guards the insert below.
  const addressLine1 = ((formData.get("address_line1") as string) ?? "").trim();
  if (addressLine1.length < MIN_ADDRESS_LENGTH) {
    throw new Error("Enter your home's address before claiming it.");
  }

  // Launch-restriction gate: the authoritative one, since this is the step
  // that actually commits the address to a claimed home. Log the lead to the
  // waitlist (joinMarketWaitlistAction above) before rejecting - a failed
  // save (e.g. live DB hasn't run 0074 yet) must never block the message
  // itself from being shown, so its result is ignored here, not surfaced.
  const claimZip = ((formData.get("zip") as string) ?? "").trim().slice(0, 5);
  if (!isOrangeCountyZip(claimZip)) {
    await joinMarketWaitlistAction(claimZip);
    throw new Error(OC_ONLY_MESSAGE);
  }

  const num = (key: string) => {
    const v = formData.get(key);
    return v ? Number(v) : null;
  };
  // Empty string (an unset hidden input) must normalize to null, same as
  // num() does for the numeric fields - a "" purchase_date would otherwise
  // fail the `date` column type rather than just staying unset.
  const str = (key: string) => {
    const v = formData.get(key);
    return v ? (v as string) : null;
  };

  // The RentCast enrichment carried in as hidden JSON fields (see
  // OnboardingForm.tsx's confirm step): parsed defensively since it's still
  // client-controlled form input, not a trusted server value. A parse
  // failure degrades to "nothing extra to store" rather than failing the
  // whole claim.
  let propertyTaxHistory: { year: number; amount: number }[] | null = null;
  try {
    const raw = formData.get("property_tax_history") as string | null;
    propertyTaxHistory = raw ? JSON.parse(raw) : null;
  } catch {
    propertyTaxHistory = null;
  }
  let systemFacts: Record<string, string> | null = null;
  try {
    const raw = formData.get("system_facts") as string | null;
    systemFacts = raw ? JSON.parse(raw) : {};
  } catch {
    systemFacts = {};
  }

  // baseRow: the columns this insert has always written, guaranteed to exist
  // on every deployed DB regardless of whether migration 0066 has run yet.
  // purchase_date/purchase_price/assessed_value/assessed_year belong here too
  // (not in the 0066-only delta below): they're pre-existing columns from
  // 0001/0029/0039, unrelated to 0066, so a DB missing only 0066 can still
  // take them - dropping them into the fallback would lose data for no
  // reason.
  const baseRow = {
    user_id: user.id,
    parcel_id: (formData.get("parcel_id") as string) || null,
    address_line1: addressLine1,
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
    purchase_date: str("purchase_date"),
    purchase_price: num("purchase_price"),
    assessed_value: num("assessed_value"),
    assessed_year: num("assessed_year"),
  };
  // extendedRow: baseRow plus the columns migration 0066 actually adds.
  // Attempted first, with baseRow as the fallback below if the live DB
  // hasn't run 0066 yet.
  const extendedRow = {
    ...baseRow,
    latitude: num("latitude"),
    longitude: num("longitude"),
    hoa_fee: num("hoa_fee"),
    county: str("county"),
    property_tax_history: propertyTaxHistory,
    market_value: num("market_value"),
    market_value_low: num("market_value_low"),
    market_value_high: num("market_value_high"),
  };

  // extendedRow's enrichment fields (everything migration 0066 adds) aren't
  // in src/lib/database.types.ts yet, so this call is cast to any - same
  // pattern as saveHomeValueAction (value/actions.ts) and
  // saveTaxAssessmentAction (taxes/actions.ts) for their own not-yet-typed
  // columns, rather than widening the generated types by hand.
  let { data: created, error } = await (supabase.from("properties") as any)
    .insert(extendedRow)
    .select("id")
    .single();

  if (error && isMissingSchemaError(error)) {
    // Live DB hasn't run migration 0066 yet (one of the enrichment columns
    // is missing): fall back to the columns that have always existed so
    // onboarding still succeeds, same graceful-degradation convention as
    // confirmSystemAction (walkthrough/actions.ts). Cast to any for the same
    // reason as the extendedRow insert above: purchase_price/assessed_value/
    // assessed_year (0029/0039) aren't in database.types.ts either.
    ({ data: created, error } = await (supabase.from("properties") as any)
      .insert(baseRow)
      .select("id")
      .single());
  }

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
  // system was replaced around the end of its typical life). Every row is
  // created UNCONFIRMED: confirmed_at stays at its null default (migration
  // 0056: null = still an estimate), which is what lets the UI treat these
  // years as guesses rather than owner-verified facts. Don't set the column
  // explicitly here - the live DB may not have run 0056 yet (see the fallback
  // in walkthrough/actions.ts), and the default is already correct.
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
      // No per-system note: confirmed_at null already marks the row as an
      // estimate, and the "auto-estimated" notice lives at the top of the
      // Home Profile page instead.
      notes: null as string | null,
      // Real material read off the RentCast property record when available
      // (roof/foundation/hvac - see deriveSystemFacts in src/lib/parcel.ts),
      // otherwise left null same as before.
      material_or_model: systemFacts?.[system_type] ?? null,
    };
  });
  await supabase.from("home_systems").insert(starterRows);

  revalidatePath("/", "layout");
  // Send them where they were originally headed (?next=, carried here from
  // the sign-up funnel via a hidden field - see OnboardingForm.tsx), now that
  // they have a claimed home to get there with. Re-validate with the same
  // guard used everywhere else ?next= is read: a form field is still
  // attacker-influenced input, not any more trustworthy than a query string.
  // No original destination - the ordinary path - lands on the Home page to
  // add systems next.
  const next = safeNextPath(formData.get("next") as string | null);
  redirect(next ?? "/dashboard?welcome=1");
}
