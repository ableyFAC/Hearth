import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { hasProPlan } from "@/lib/subscription";
import { countAiUsage } from "@/lib/aiUsage";

export const runtime = "nodejs";

// AI back office (Hearth Pro membership): three writing tools for the
// paperwork pros hate. The pro describes the job in plain words and Gemini
// drafts a clean estimate, invoice, or follow-up message they can copy and
// send. Members only: this is brand-new surface, nothing free moves behind it.
//
// Input:  { tool: "estimate", description, category?, price?, materials? }
//       | { tool: "invoice", description, amount, workDone? }
//       | { tool: "followup", situation: "no_reply" | "review" | "checkin", context? }
// Output: { result: string }
//       | { result: null, reason: "no_key" | "rate_limited" | "failed" }

const MAX_DESCRIPTION = 4000;
const MAX_NOTES = 2000;
const MAX_SHORT = 120;

// Same fallback list as /api/analyze-quote: each free-tier model has its own
// daily quota, so a 429 on one falls through to the next.
const MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

// The shared voice for every tool. The no-invented-prices rule matters most:
// these documents go straight to a real customer, so the only numbers allowed
// are the ones the pro typed in.
const VOICE =
  "You write back-office paperwork for a small trade contractor (the pro). " +
  "Voice: professional but friendly, the way a good tradesperson talks to a customer they respect. Plain sentences, no hype words, no exclamation marks. " +
  "Never invent prices, rates, totals, or dates: use only the numbers the pro provided, and if none were provided, write the document without numbers. " +
  "No placeholders like [name] or [date]: if a detail is missing, phrase around it naturally. " +
  "Never use an em dash; use a comma, a colon, or a new sentence instead.";

const ESTIMATE_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    scope: { type: "STRING" },
    line_items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          amount: { type: "STRING" },
        },
        required: ["label"],
      },
    },
    total: { type: "STRING" },
    terms: { type: "STRING" },
  },
  required: ["title", "scope", "line_items", "terms"],
};

const INVOICE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    amount_due: { type: "STRING" },
    payment_terms: { type: "STRING" },
  },
  required: ["summary", "amount_due", "payment_terms"],
};

const FOLLOWUP_SCHEMA = {
  type: "OBJECT",
  properties: {
    message: { type: "STRING" },
  },
  required: ["message"],
};

const FOLLOWUP_SITUATIONS: Record<string, string> = {
  no_reply:
    "The pro sent this customer a quote and hasn't heard back. Write a short, easy-going nudge: reference the quote, offer to answer questions or adjust scope, and make replying feel low-pressure. Never guilt-trip.",
  review:
    "The pro just finished this customer's job. Write a short thank-you that asks for a review: thank them for the work, mention you'd appreciate a quick review if they were happy, and invite them to reach out if anything needs a touch-up.",
  checkin:
    "The pro wants to check in with a past customer they haven't worked with in a while. Write a warm, no-pressure hello: reference the past work if described, ask how it's holding up, and mention you're around if anything needs attention. Not salesy.",
};

export async function POST(req: NextRequest) {
  // Require a signed-in user before touching the paid model.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Members-only perk: must be a contractor with an active Pro membership.
  const contractor = await getCurrentContractor();
  if (!contractor) {
    return NextResponse.json({ error: "Not a contractor" }, { status: 403 });
  }
  if (!(await hasProPlan())) {
    return NextResponse.json({ error: "pro_required" }, { status: 403 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ result: null, reason: "no_key" });
  }

  const body = await req.json().catch(() => ({}));
  const tool = typeof body.tool === "string" ? body.tool : "";

  // Trim and clamp a free-text field so a caller can't push huge payloads at
  // the paid model. Accepts plain numbers too, so a JSON-number price or
  // amount isn't silently treated as missing.
  const field = (v: unknown, max: number) => {
    if (typeof v === "number" && Number.isFinite(v)) v = String(v);
    return typeof v === "string" ? v.trim().slice(0, max) : "";
  };

  // Build the per-tool schema and prompt. Validation errors return before the
  // usage counter runs, so a bad form submit never burns quota.
  let schema: object;
  let userPrompt: string;
  let instruction: string;

  if (tool === "estimate") {
    const description = field(body.description, MAX_DESCRIPTION);
    const category = field(body.category, MAX_SHORT);
    const price = field(body.price, MAX_SHORT);
    const materials = field(body.materials, MAX_NOTES);
    if (!description) {
      return NextResponse.json(
        { error: "Describe the job first." },
        { status: 400 }
      );
    }
    schema = ESTIMATE_SCHEMA;
    instruction =
      VOICE +
      " Turn the pro's plain-words job description into a professional written estimate. " +
      "title: one short line naming the job (for example 'Water heater replacement'). " +
      "scope: two to five plain sentences describing exactly what work will be done, written so the customer knows what they are paying for. " +
      "line_items: break the work into 2 to 6 short labeled parts (labor, materials, haul-away, and so on). Put an amount on a line ONLY if the pro's notes give a number for that specific part; otherwise leave amount empty. " +
      "total: the pro's overall price exactly as they gave it, formatted cleanly with a dollar sign if it is a plain number. If they gave no price, leave total empty. " +
      "terms: two or three short sentences of standard estimate terms: how long the estimate is good for, that changes in scope may change the price, and anything the pro's notes call for. Do not invent deposit percentages or payment schedules the pro didn't mention.";
    const promptLines = [
      `The pro describes the job like this: ${description}`,
      category ? `Job category: ${category}` : "",
      price ? `The price the pro has in mind: ${price}` : "The pro gave no price, so write the estimate without amounts.",
      materials ? `Materials notes from the pro: ${materials}` : "",
      `The pro's company name: ${contractor.name}`,
    ].filter(Boolean);
    userPrompt = promptLines.join("\n") + "\n\nWrite the estimate.";
  } else if (tool === "invoice") {
    const description = field(body.description, MAX_DESCRIPTION);
    const amount = field(body.amount, MAX_SHORT);
    const workDone = field(body.workDone, MAX_NOTES);
    if (!description) {
      return NextResponse.json(
        { error: "Describe the job first." },
        { status: 400 }
      );
    }
    if (!amount) {
      return NextResponse.json(
        { error: "Enter the amount due." },
        { status: 400 }
      );
    }
    schema = INVOICE_SCHEMA;
    instruction =
      VOICE +
      " Turn the pro's notes into professional invoice text. " +
      "summary: two to four plain sentences describing the work that was completed, specific enough that the customer recognizes their job. " +
      "amount_due: the pro's amount EXACTLY as given, formatted cleanly with a dollar sign if it is a plain number. Never change or recompute it. " +
      "payment_terms: one or two short sentences: a friendly note that payment is due, how to reach the pro with questions, and any terms the pro's notes mention. Do not invent due dates, late fees, or payment methods the pro didn't mention.";
    const promptLines = [
      `The job: ${description}`,
      workDone ? `What was done: ${workDone}` : "",
      `Amount due: ${amount}`,
      `The pro's company name: ${contractor.name}`,
    ].filter(Boolean);
    userPrompt = promptLines.join("\n") + "\n\nWrite the invoice text.";
  } else if (tool === "followup") {
    const situation = field(body.situation, MAX_SHORT);
    const context = field(body.context, MAX_NOTES);
    // Own-key check so prototype names ("constructor", "toString") sent as the
    // situation can't resolve to inherited values and slip past validation.
    const situationBrief = Object.prototype.hasOwnProperty.call(
      FOLLOWUP_SITUATIONS,
      situation
    )
      ? FOLLOWUP_SITUATIONS[situation]
      : undefined;
    if (!situationBrief) {
      return NextResponse.json(
        { error: "Pick a situation first." },
        { status: 400 }
      );
    }
    schema = FOLLOWUP_SCHEMA;
    instruction =
      VOICE +
      " Write a short follow-up message from the pro to a customer, 3 to 5 sentences, ready to send as a text or email body. " +
      situationBrief +
      " No subject line, no signature block: end with the company name on its own line. Plain sentences only.";
    const promptLines = [
      context
        ? `Context from the pro: ${context}`
        : "The pro gave no extra context, so keep the message general but warm.",
      `The pro's company name: ${contractor.name}`,
    ].filter(Boolean);
    userPrompt = promptLines.join("\n") + "\n\nWrite the follow-up message.";
  } else {
    return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
  }

  // Members share the same per-user daily cap as the other AI routes (the
  // Plus-tier 250/day ceiling in the shared ai_usage table), so this can't be
  // a side door around the abuse limits on the paid model. Fails open.
  const { overLimit } = await countAiUsage(user.id, true);
  if (overLimit) {
    return NextResponse.json({ result: null, reason: "rate_limited" });
  }

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      maxOutputTokens: 1000,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  });

  let rateLimited = false;
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
        continue;
      }
      if (!resp.ok) continue;
      const data = await resp.json();
      const responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        continue; // malformed - try the next model
      }
      const result = assemble(tool, parsed, contractor.name);
      if (!result) continue; // missing required text - try the next model
      return NextResponse.json({ result });
    } catch {
      // network error - try the next model
    }
  }

  return NextResponse.json({
    result: null,
    reason: rateLimited ? "rate_limited" : "failed",
  });
}

// Coerce the model's JSON into one clean plain-text document per tool, rather
// than trusting arbitrary output straight into the UI. Returns null if the
// required pieces are missing so the caller can fall through to the next model.
function assemble(tool: string, raw: any, company: string): string | null {
  const str = (v: any) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length ? s : null;
  };
  const dateLine = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (tool === "estimate") {
    const title = str(raw?.title);
    const scope = str(raw?.scope);
    const terms = str(raw?.terms);
    if (!title || !scope || !terms) return null;
    const items = Array.isArray(raw?.line_items)
      ? raw.line_items
          .map((li: any) => ({ label: str(li?.label), amount: str(li?.amount) }))
          .filter((li: any) => li.label)
      : [];
    const total = str(raw?.total);
    const lines = ["ESTIMATE", company, dateLine, "", title, "", "Scope of work", scope];
    if (items.length) {
      lines.push("", "Line items");
      for (const li of items) {
        lines.push(li.amount ? `- ${li.label}: ${li.amount}` : `- ${li.label}`);
      }
    }
    if (total) lines.push("", `Estimated total: ${total}`);
    lines.push("", "Terms", terms);
    return lines.join("\n");
  }

  if (tool === "invoice") {
    const summary = str(raw?.summary);
    const amountDue = str(raw?.amount_due);
    const paymentTerms = str(raw?.payment_terms);
    if (!summary || !amountDue || !paymentTerms) return null;
    return [
      "INVOICE",
      company,
      dateLine,
      "",
      "Work summary",
      summary,
      "",
      `Amount due: ${amountDue}`,
      "",
      paymentTerms,
    ].join("\n");
  }

  // followup
  return str(raw?.message);
}
