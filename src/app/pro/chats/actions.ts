"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";
import { getCurrentContractor } from "@/lib/contractor";
import { dollarsToCents, formatUSDCents } from "@/lib/quotes";
import type { QuoteLineItem, InvoiceLineItem } from "@/lib/database.types";

const MAX_LINE_ITEMS = 20;
const MAX_LABEL = 80;
const MAX_NOTE = 1000;

// A pro composes and sends a structured quote inside a lead's chat thread.
// Inserts the lead_quotes row plus a plain companion message ("Sent a quote:
// $X total") in the same messages table everything else already reads, so
// unread badges, notifiers, and the applicant-nudge cron need no changes.
export async function sendQuoteAction(formData: FormData) {
  const contractor = await getCurrentContractor();
  if (!contractor) return;

  const leadId = String(formData.get("lead_id") || "");
  if (!leadId) return;

  const supabase = createClient();

  // The lead must really be one of this contractor's own jobs. The id
  // arrives as client input, so re check here rather than trust it, same
  // pattern as trackLeadAction in pro/crm/actions.ts. RLS backs this too.
  const { data: ownLead } = await supabase
    .from("contractor_leads")
    .select("id")
    .eq("id", leadId)
    .eq("contractor_id", contractor.id)
    .maybeSingle();
  if (!ownLead) return;

  const labels = formData.getAll("label").map((v) => String(v).trim());
  const amounts = formData.getAll("amount").map((v) => String(v));
  const note =
    String(formData.get("note") || "")
      .trim()
      .slice(0, MAX_NOTE) || null;

  // Dollar-to-cents conversion happens exactly once, here, per line item.
  // The total is a sum of those already-converted cents, never a separate
  // re-parse of the typed strings.
  const lineItems: QuoteLineItem[] = [];
  for (let i = 0; i < labels.length && lineItems.length < MAX_LINE_ITEMS; i++) {
    const label = labels[i].slice(0, MAX_LABEL);
    const cents = dollarsToCents(amounts[i] ?? "");
    if (!label || cents === null || cents <= 0) continue;
    lineItems.push({ label, amount_cents: cents });
  }
  if (lineItems.length === 0) return;

  const totalCents = lineItems.reduce((sum, li) => sum + li.amount_cents, 0);
  if (totalCents <= 0) return;

  const { data: quote, error } = await supabase
    .from("lead_quotes")
    .insert({
      lead_id: leadId,
      contractor_id: contractor.id,
      total_cents: totalCents,
      line_items: lineItems,
      note,
    })
    .select("id")
    .single();
  if (error || !quote) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Companion plain message: this is what every existing unread badge,
  // notifier, and the applicant-nudge cron already read off `messages`.
  await supabase.from("messages").insert({
    lead_id: leadId,
    sender_role: "contractor",
    sender_id: user?.id ?? null,
    body: `Sent a quote: ${formatUSDCents(totalCents)} total`,
  });

  // Tell the homeowner a quote came in. Best-effort: a notification hiccup
  // should never undo a quote that already saved.
  try {
    const { data: lead } = await supabase
      .from("contractor_leads")
      .select("property_id")
      .eq("id", leadId)
      .maybeSingle();
    if (lead?.property_id) {
      const { data: property } = await supabase
        .from("properties")
        .select("user_id")
        .eq("id", lead.property_id)
        .maybeSingle();
      if (property?.user_id) {
        const admin = createAdminClient();
        // "Messages from pros" (pro_messages) gates the email/SMS channels
        // only, never the in-app row: an unset pref reads as enabled, same
        // default as the notification settings form.
        const { data: owner } = await admin
          .from("users")
          .select("email, phone, sms_consent, notification_prefs")
          .eq("id", property.user_id)
          .maybeSingle();
        const wantsProMessages = owner?.notification_prefs?.pro_messages ?? true;
        await sendNotification(admin, {
          userId: property.user_id,
          kind: "quote_sent",
          title: `${contractor.name} sent you a quote`,
          body: `${formatUSDCents(totalCents)} total. Check the chat to see the details.`,
          url: `/chats?lead=${leadId}`,
          email: wantsProMessages ? owner?.email ?? null : null,
          phone: wantsProMessages ? owner?.phone ?? null : null,
          smsConsent: wantsProMessages ? owner?.sms_consent === true : false,
        });
      }
    }
  } catch (err) {
    console.error(
      "quote sent notification:",
      err instanceof Error ? err.message : err
    );
  }

  revalidatePath("/pro/chats");
  revalidatePath("/chats");
}

// A pro withdraws their own quote. RLS also enforces contractor_id ownership
// and the sent -> withdrawn only transition; the .eq() chain here is a
// friendly no-op guard, not the only line of defense.
export async function withdrawQuoteAction(formData: FormData) {
  const contractor = await getCurrentContractor();
  if (!contractor) return;

  const quoteId = String(formData.get("quote_id") || "");
  if (!quoteId) return;

  const supabase = createClient();
  const { data: quote } = await supabase
    .from("lead_quotes")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("contractor_id", contractor.id)
    .eq("status", "sent")
    .select("lead_id")
    .maybeSingle();
  if (!quote) return;

  revalidatePath("/pro/chats");
  revalidatePath("/chats");
}

// A pro sends an invoice inside a lead's chat thread once an agreement is
// reached. Same shape as sendQuoteAction: inserts the invoices row plus a
// plain companion message, so unread badges/notifiers need no changes.
export async function createInvoiceAction(formData: FormData) {
  const contractor = await getCurrentContractor();
  if (!contractor) return;

  const leadId = String(formData.get("lead_id") || "");
  if (!leadId) return;

  const supabase = createClient();

  // The lead must really be one of this contractor's own jobs. The id
  // arrives as client input, so re check here rather than trust it, same
  // pattern as sendQuoteAction above. RLS backs this too.
  const { data: ownLead } = await supabase
    .from("contractor_leads")
    .select("id, property_id")
    .eq("id", leadId)
    .eq("contractor_id", contractor.id)
    .maybeSingle();
  if (!ownLead) return;

  const descriptions = formData.getAll("description").map((v) => String(v).trim());
  const amounts = formData.getAll("amount").map((v) => String(v));

  // Dollar-to-cents conversion happens exactly once, here, per line item.
  // subtotal/total are a sum of those already-converted cents, never a
  // separate re-parse of the typed strings. subtotal and total are equal
  // today (no discount/tax line yet); the columns are kept separate in the
  // schema for that future without a migration.
  const lineItems: InvoiceLineItem[] = [];
  for (let i = 0; i < descriptions.length && lineItems.length < MAX_LINE_ITEMS; i++) {
    const description = descriptions[i].slice(0, MAX_LABEL);
    const cents = dollarsToCents(amounts[i] ?? "");
    if (!description || cents === null || cents <= 0) continue;
    lineItems.push({ description, amount_cents: cents });
  }
  if (lineItems.length === 0) return;

  const totalCents = lineItems.reduce((sum, li) => sum + li.amount_cents, 0);
  if (totalCents <= 0) return;

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      lead_id: leadId,
      contractor_id: contractor.id,
      property_id: ownLead.property_id,
      line_items: lineItems,
      subtotal_cents: totalCents,
      total_cents: totalCents,
    })
    .select("id")
    .single();
  if (error || !invoice) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Companion plain message: this is what every existing unread badge and
  // notifier already reads off `messages`.
  await supabase.from("messages").insert({
    lead_id: leadId,
    sender_role: "contractor",
    sender_id: user?.id ?? null,
    body: `Sent an invoice: ${formatUSDCents(totalCents)} total`,
  });

  // Tell the homeowner an invoice came in. Best-effort: a notification
  // hiccup should never undo an invoice that already saved.
  try {
    const { data: property } = await supabase
      .from("properties")
      .select("user_id")
      .eq("id", ownLead.property_id)
      .maybeSingle();
    if (property?.user_id) {
      const admin = createAdminClient();
      // "Messages from pros" (pro_messages) gates the email/SMS channels
      // only, never the in-app row: an unset pref reads as enabled, same
      // default as the notification settings form.
      const { data: owner } = await admin
        .from("users")
        .select("email, phone, sms_consent, notification_prefs")
        .eq("id", property.user_id)
        .maybeSingle();
      const wantsProMessages = owner?.notification_prefs?.pro_messages ?? true;
      await sendNotification(admin, {
        userId: property.user_id,
        kind: "invoice_sent",
        title: `${contractor.name} sent you an invoice`,
        body: `${formatUSDCents(totalCents)} total. Check the chat to review and sign.`,
        url: `/chats?lead=${leadId}`,
        email: wantsProMessages ? owner?.email ?? null : null,
        phone: wantsProMessages ? owner?.phone ?? null : null,
        smsConsent: wantsProMessages ? owner?.sms_consent === true : false,
      });
    }
  } catch (err) {
    console.error(
      "invoice sent notification:",
      err instanceof Error ? err.message : err
    );
  }

  revalidatePath("/pro/chats");
  revalidatePath("/chats");
}

// A pro voids their own unsigned invoice. RLS also enforces contractor_id
// ownership and the sent -> void only transition; the .eq() chain here is a
// friendly no-op guard, not the only line of defense.
export async function voidInvoiceAction(formData: FormData) {
  const contractor = await getCurrentContractor();
  if (!contractor) return;

  const invoiceId = String(formData.get("invoice_id") || "");
  if (!invoiceId) return;

  const supabase = createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .update({ status: "void", updated_at: new Date().toISOString() })
    .eq("id", invoiceId)
    .eq("contractor_id", contractor.id)
    .eq("status", "sent")
    .select("lead_id")
    .maybeSingle();
  if (!invoice) return;

  revalidatePath("/pro/chats");
  revalidatePath("/chats");
}
