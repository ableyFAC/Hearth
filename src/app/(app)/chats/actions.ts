"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveProperty } from "@/lib/property";
import { formatUSDCents } from "@/lib/quotes";

// Shared body for accept/decline: verifies the quote is really on a lead
// attached to the caller's own property before touching anything (the id
// arrives as client input; RLS backs this too, but a clean no-op beats a raw
// database error if someone tampers with it), flips status, then notifies
// the pro. Never touches choose_applicant or any money logic, only this
// row's status.
async function respondToQuote(
  formData: FormData,
  newStatus: "accepted" | "declined"
) {
  const property = await getActiveProperty();
  if (!property) return;

  const quoteId = String(formData.get("quote_id") || "");
  if (!quoteId) return;

  const supabase = createClient();

  const { data: quote } = await supabase
    .from("lead_quotes")
    .select("id, lead_id, contractor_id, total_cents, status")
    .eq("id", quoteId)
    .eq("status", "sent")
    .maybeSingle();
  if (!quote) return;

  const { data: lead } = await supabase
    .from("contractor_leads")
    .select("id")
    .eq("id", quote.lead_id)
    .eq("property_id", property.id)
    .maybeSingle();
  if (!lead) return;

  const { error } = await supabase
    .from("lead_quotes")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("status", "sent");
  if (error) return;

  // Tell the pro their quote was answered. Best-effort: a notification
  // hiccup should never undo a status change that already saved.
  try {
    const { data: contractor } = await supabase
      .from("contractors")
      .select("user_id")
      .eq("id", quote.contractor_id)
      .maybeSingle();
    if (contractor?.user_id) {
      const admin = createAdminClient();
      const amount = formatUSDCents(quote.total_cents);
      await admin.from("notifications").insert({
        user_id: contractor.user_id,
        kind: newStatus === "accepted" ? "quote_accepted" : "quote_declined",
        title:
          newStatus === "accepted"
            ? `Your ${amount} quote was accepted`
            : `Your ${amount} quote was declined`,
        body:
          newStatus === "accepted"
            ? "The homeowner accepted your quote. Check the chat to follow up."
            : "The homeowner declined your quote.",
        url: "/pro/chats",
      });
    }
  } catch (err) {
    console.error(
      "quote response notification:",
      err instanceof Error ? err.message : err
    );
  }

  revalidatePath("/chats");
  revalidatePath("/pro/chats");
}

export async function acceptQuoteAction(formData: FormData) {
  await respondToQuote(formData, "accepted");
}

export async function declineQuoteAction(formData: FormData) {
  await respondToQuote(formData, "declined");
}
