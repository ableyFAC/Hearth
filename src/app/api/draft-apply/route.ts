import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContractor } from "@/lib/contractor";
import { hasPlus } from "@/lib/subscription";
import { labelFor, JOB_CATEGORIES, TIMING_OPTIONS } from "@/lib/constants";

export const runtime = "nodejs";

// Apply-message drafter for pros: given an open job, Gemini writes a short
// first-pass apply message from the posting's details plus the contractor's
// own company profile. The pro edits it before sending - it fills the
// textarea, it doesn't send anything.
//
// Input:  { leadId }
// Output: { message } | { message: null, reason: "no_key" | "rate_limited" | "failed" }
export async function POST(req: NextRequest) {
  // Require a signed-in user before touching the paid model. Gating here (not
  // just in middleware) stops anonymous abuse that would run up Gemini cost.
  const authClient = createClient();
  const {
    data: { user: authUser },
  } = await authClient.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only a contractor drafts apply messages, and only for jobs in their
  // categories (the same match open_jobs_for_me applies to the board).
  const contractor = await getCurrentContractor();
  if (!contractor) {
    return NextResponse.json({ error: "Not a contractor" }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: null, reason: "no_key" });
  }

  const body = await req.json().catch(() => ({}));
  const leadId = typeof body.leadId === "string" ? body.leadId : "";
  if (!leadId) {
    return NextResponse.json({ error: "No job given." }, { status: 400 });
  }

  // Load the job server-side with the admin client, but only the safe fields a
  // pro can already see on the board - never the homeowner's contact info.
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from("contractor_leads")
    .select(
      "id, category, timing, issue_description, issue_severity, status, contractor_id, created_at"
    )
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (lead.status !== "new" || lead.contractor_id !== null) {
    return NextResponse.json(
      { error: "This job is no longer open." },
      { status: 400 }
    );
  }
  const cats = contractor.categories ?? [];
  if (cats.length > 0 && !cats.includes(lead.category)) {
    return NextResponse.json(
      { error: "This job isn't in your categories." },
      { status: 403 }
    );
  }

  // Per-user daily cap so a single account can't run up the paid Gemini bill.
  // Shares the ai_usage counter (and the Plus ceiling) with Ask Hearth, so it
  // resets cleanly at midnight and one pro can't farm drafts all day.
  const isPlus = await hasPlus();
  const dailyLimit = isPlus ? 250 : 25;
  let usageCount = 1;
  try {
    const usageDate = new Date(Date.now()).toISOString().slice(0, 10);
    // Supabase-js has no atomic "increment" helper, so read the current count
    // for today and write it back one higher. A missed race under this route's
    // low traffic just undercounts by one, which is fine for an abuse cap.
    const { data: existing } = await (admin as any)
      .from("ai_usage")
      .select("count")
      .eq("user_id", authUser.id)
      .eq("usage_date", usageDate)
      .maybeSingle();
    usageCount = (existing?.count ?? 0) + 1;
    await (admin as any)
      .from("ai_usage")
      .upsert(
        { user_id: authUser.id, usage_date: usageDate, count: usageCount },
        { onConflict: "user_id,usage_date" }
      );
  } catch (err) {
    // A broken counter should never block the pro from drafting; log it and
    // let this request through uncounted.
    console.error("ai_usage upsert failed", err);
    usageCount = 0;
  }

  if (usageCount > dailyLimit) {
    return NextResponse.json({ message: null, reason: "rate_limited" });
  }

  const system =
    "You write a short application message from a contractor to a homeowner who posted a job. " +
    "Write 3 to 5 sentences, first person as the company (use 'we', or 'I' if the company reads like a one-person shop). " +
    "Open with a brief greeting and reference the SPECIFIC details of their job in the first sentence, so they can tell this isn't a template. " +
    "Include exactly one line of relevant credibility drawn from the company profile below, such as the trade, service area, or license on file. " +
    "Close with one concrete next step: offer a time window to talk or come take a look. " +
    "Warm and human, never salesy: no hype words, no exclamation marks, no 'we pride ourselves'. " +
    "Do not mention prices unless the job description itself asks about price or budget. " +
    "Plain sentences only: no bullet points, no subject line, no signature, no placeholders like [name] or [date]. " +
    "Never use an em dash or a hyphen as a connector: use a comma, a colon, or a new sentence instead. " +
    "Return ONLY the message text, nothing else.";

  const jobLines = [
    `Category: ${labelFor(JOB_CATEGORIES, lead.category)}`,
    lead.issue_description
      ? `The homeowner wrote: ${lead.issue_description}`
      : "The homeowner gave no written details, so keep the job reference general to their service category.",
    lead.timing ? `Their timing: ${labelFor(TIMING_OPTIONS, lead.timing)}` : "",
    lead.issue_severity ? `Severity they marked: ${lead.issue_severity}` : "",
  ].filter(Boolean);

  const companyLines = [
    `Name: ${contractor.name}`,
    cats.length
      ? `Trades: ${cats.map((c) => labelFor(JOB_CATEGORIES, c)).join(", ")}`
      : "",
    contractor.service_area ? `Service area: ${contractor.service_area}` : "",
    contractor.license_number ? "License on file: yes" : "",
  ].filter(Boolean);

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              `The job posting:\n${jobLines.join("\n")}\n\n` +
              `The company applying:\n${companyLines.join("\n")}\n\n` +
              "Draft the apply message.",
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 400 },
  });

  // Each free-tier model has its OWN daily quota, so cycle through them: if one
  // is rate-limited (429), fall through to the next.
  const MODELS = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash-lite",
  ];

  let rateLimited = false;
  // If a model's reply was cut off or blocked (finishReason MAX_TOKENS,
  // SAFETY, RECITATION, ...), keep the longest partial text so the pro still
  // gets something editable if every model fails to finish cleanly.
  let bestMessage = "";
  for (const model of MODELS) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: requestBody,
        }
      );
      if (resp.status === 429) {
        rateLimited = true;
        continue; // this model is out of quota; try the next
      }
      if (!resp.ok) continue;
      const data = await resp.json();
      const candidate = data?.candidates?.[0];
      const message = candidate?.content?.parts?.[0]?.text;
      const finishReason = candidate?.finishReason;
      // Only a clean STOP (or no reported reason) with text is a complete
      // draft; anything else was truncated or blocked, so keep the partial
      // and try the next model.
      if (message && (!finishReason || finishReason === "STOP")) {
        return NextResponse.json({ message: message.trim() });
      }
      if (typeof message === "string" && message.length > bestMessage.length) {
        bestMessage = message;
      }
      // No text or a non-STOP finish - try the next model.
    } catch {
      // Network error - try the next model.
    }
  }

  // Every model came back truncated, blocked, or empty. A partial draft the
  // pro can finish still beats an error.
  if (bestMessage) return NextResponse.json({ message: bestMessage.trim() });

  return NextResponse.json({
    message: null,
    reason: rateLimited ? "rate_limited" : "failed",
  });
}
