"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { setFlash } from "@/lib/flash";

// Saves (or updates) what the owner paid, the year they bought, and what they
// still owe. purchase_price and mortgage_balance are new columns from
// migration 0029 that are not yet in src/lib/database.types.ts, so the update
// payload is cast to any (same pattern as the ai_usage route) rather than
// widening the generated types by hand. purchase_year is not a new column:
// it reuses properties.purchase_date, stored as YYYY-01-01 since only the
// year matters for the appreciation math.
//
// Returns { ok } so the client form only collapses on a save that actually
// stuck: a validation reject or soft-fail resolves the promise too, and
// closing on that would show stale values as if the save succeeded.
export async function saveHomeValueAction(
  formData: FormData
): Promise<{ ok: boolean }> {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");

  const priceRaw = formData.get("purchase_price");
  const yearRaw = formData.get("purchase_year");
  const balanceRaw = formData.get("mortgage_balance");

  const purchasePrice = priceRaw ? Number(priceRaw) : null;
  const purchaseYear = yearRaw ? Number(yearRaw) : null;
  const mortgageBalance = balanceRaw ? Number(balanceRaw) : null;

  if (!purchasePrice || purchasePrice <= 0 || !purchaseYear) {
    setFlash(
      "Add what you paid and the year you bought your home to continue.",
      "error"
    );
    revalidatePath("/value");
    return { ok: false };
  }

  // Server-side bounds (the form's min/max is client-only and can be
  // bypassed): a purchase year outside 1900..this year, or a wild price or
  // balance, would compound into an absurd "estimated value" shown in a big
  // confident font. Reject rather than clamp so the owner notices.
  const currentYear = new Date(Date.now()).getFullYear();
  if (
    !Number.isInteger(purchaseYear) ||
    purchaseYear < 1900 ||
    purchaseYear > currentYear ||
    !Number.isFinite(purchasePrice) ||
    purchasePrice > 100_000_000 ||
    (mortgageBalance != null &&
      (!Number.isFinite(mortgageBalance) ||
        mortgageBalance < 0 ||
        mortgageBalance > 100_000_000))
  ) {
    setFlash(
      "Those numbers don't look right. Double-check the year and amounts.",
      "error"
    );
    revalidatePath("/value");
    return { ok: false };
  }

  const supabase = createClient();
  try {
    // RLS's existing "owner selects/updates own property" policy covers this,
    // same as updatePropertyAction in profile/actions.ts.
    const { error } = await (supabase.from("properties") as any)
      .update({
        purchase_price: purchasePrice,
        purchase_date: `${purchaseYear}-01-01`,
        mortgage_balance: mortgageBalance,
      })
      .eq("id", property.id);
    if (error) throw error;
    setFlash("Home value saved");
  } catch {
    // Migration 0029 may not have run yet against this database, or the
    // write failed for some other reason. Fail soft: the page just shows the
    // setup form again instead of a 500.
    setFlash("Couldn't save right now. Please try again in a bit.", "error");
    revalidatePath("/value");
    revalidatePath("/dashboard");
    return { ok: false };
  }
  revalidatePath("/value");
  revalidatePath("/dashboard");
  return { ok: true };
}
