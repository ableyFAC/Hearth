import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPlus } from "@/lib/subscription";
import { countAiUsage } from "@/lib/aiUsage";
import { REPLACEMENT_INFO } from "@/lib/health";

export const runtime = "nodejs";

// Cap the incoming base64 image so a caller can't push huge payloads at the
// paid vision model (cost/DoS). ~14M base64 chars ≈ 10MB of binary.
const MAX_IMAGE_B64_CHARS = 14_000_000;

// AI Quote Analyzer (Hearth Plus): a homeowner uploads a photo of a
// contractor's quote or pastes the text, and Gemini reads every line item,
// compares the total against typical costs, flags padded/vague/duplicated
// charges, and drafts a negotiation message. This is the "$150 instead of an
// $800 quote" feature competitors use as their headline save.
//
// Input:  { image?: <base64, no data: prefix>, mime?: string, text?: string,
//           category?: string }
// Output: { analysis: { verdict, total, summary, line_items, red_flags,
//                        missing, negotiation } | null, reason? }

// A rough mapping from a job category to the closest system_type Hearth
// already keeps a national cost range for, so the model gets a grounded
// baseline instead of guessing. Categories with no clean match (structural,
// remodeling, landscaping, cleaning, painting, home_inspection, pest, other)
// fall back to no baseline, and the model is told to use its own general
// knowledge.
const CATEGORY_TO_SYSTEM: Record<string, string> = {
  roof: "roof",
  hvac: "hvac",
  plumbing: "plumbing",
  windows: "windows",
  electrical: "electrical_panel",
  garage_door: "garage_door",
};

function baselineFor(category: string | null): string | null {
  if (!category) return null;
  const systemType = CATEGORY_TO_SYSTEM[category];
  const info = systemType ? REPLACEMENT_INFO[systemType] : null;
  if (!info) return null;
  return `$${info.low.toLocaleString()}-$${info.high.toLocaleString()} (national ballpark for a full ${category} replacement job; smaller repairs cost less)`;
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    verdict: { type: "STRING", enum: ["fair", "high", "low", "unclear"] },
    total: { type: "STRING" },
    summary: { type: "STRING" },
    line_items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          amount: { type: "STRING" },
          note: { type: "STRING" },
        },
        required: ["label"],
      },
    },
    red_flags: { type: "ARRAY", items: { type: "STRING" } },
    missing: { type: "ARRAY", items: { type: "STRING" } },
    negotiation: { type: "STRING" },
  },
  required: [
    "verdict",
    "summary",
    "line_items",
    "red_flags",
    "missing",
    "negotiation",
  ],
};

const MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

export async function POST(req: NextRequest) {
  // Require a signed-in user before touching the paid vision model.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The quote analyzer is a Hearth Plus feature, but every homeowner gets
  // exactly one free check as a taste. A non-Plus user with an unused credit
  // (users.free_quote_used_at is null) claims it ATOMICALLY up front: a
  // conditional update that only matches while the column is still null, so
  // N parallel requests can't each pass a read-then-check and farm extra free
  // analyses. Only the one request that wins the claim proceeds; the rest get
  // the same 403 as before. If this request never produces an analysis, the
  // claim is refunded below so a blurry photo still doesn't burn the credit.
  const isPlus = await hasPlus();
  let claimedFreeCredit = false;
  if (!isPlus) {
    try {
      const admin = createAdminClient();
      const { data: claimed, error } = await admin
        .from("users")
        .update({ free_quote_used_at: new Date().toISOString() })
        .eq("id", user.id)
        .is("free_quote_used_at", null)
        .select("id");
      if (error) throw error;
      claimedFreeCredit = !!claimed && claimed.length > 0;
    } catch {
      // Column missing (migration 0027 not run yet) or write failed: fall
      // back to the old Plus-only behavior so nothing breaks.
      claimedFreeCredit = false;
    }
    if (!claimedFreeCredit) {
      return NextResponse.json({ error: "plus_required" }, { status: 403 });
    }
  }

  // Hand the claim back on any path that never delivers an analysis (missing
  // key, bad input, over the daily cap, every model failed), preserving the
  // promise that only a successful analysis spends the free check.
  // Best-effort: if the refund itself fails, the credit stays spent.
  const refundFreeCredit = async () => {
    if (!claimedFreeCredit) return;
    try {
      const admin = createAdminClient();
      await admin
        .from("users")
        .update({ free_quote_used_at: null })
        .eq("id", user.id);
    } catch {
      // ignore, the analysis outcome still goes back to the user
    }
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await refundFreeCredit();
    return NextResponse.json({ analysis: null, reason: "no_key" });
  }

  const body = await req.json().catch(() => ({}));
  const image = typeof body.image === "string" ? body.image : "";
  const mime = typeof body.mime === "string" ? body.mime : "image/jpeg";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const category = typeof body.category === "string" && body.category ? body.category : null;

  if (!image && !text) {
    await refundFreeCredit();
    return NextResponse.json(
      { error: "Add a photo of the quote or paste its text." },
      { status: 400 }
    );
  }
  if (image.length > MAX_IMAGE_B64_CHARS) {
    await refundFreeCredit();
    return NextResponse.json({ error: "Image too large." }, { status: 413 });
  }

  // Same per-user daily cap as /api/ask (same ai_usage table and limits), so
  // the quote analyzer can't be a side door around the abuse limits on the
  // paid model. Over the cap degrades like any other model failure.
  const { overLimit } = await countAiUsage(user.id, isPlus);
  if (overLimit) {
    await refundFreeCredit();
    return NextResponse.json({ analysis: null, reason: "rate_limited" });
  }

  const baseline = baselineFor(category);
  const today = new Date().toISOString().slice(0, 10);
  const instruction =
    "You are reading a contractor's quote, estimate, or invoice for a homeowner, acting as their advocate. " +
    "Read every line item and the total price closely, whether it comes from a photo or pasted text. " +
    "Itemize each charge in line_items: a short label, the amount as printed (including the currency symbol, or empty if no amount is given for that line), and a note only when something about that specific line is worth flagging. " +
    "Compare the total, and the individual line items where you can, against typical costs for this kind of job" +
    (baseline ? `. A rough national baseline for this category is ${baseline}, but adjust for the actual scope described` : ", using your general knowledge of home repair and remodeling costs") +
    ". " +
    "Decide an overall verdict: fair if the total is in a reasonable range, high if it looks padded or overpriced, low if it looks unusually cheap (which can also be a red flag, such as a bid that is too good to be true or omits scope), or unclear if there is not enough information in the quote to judge. " +
    "Look closely for line items that are padded (marked up well above a typical rate), vague (a charge like 'materials' or 'miscellaneous' with no detail behind it), duplicated (the same work billed twice under different names), or otherwise suspicious. Write each one as a short plain sentence in red_flags. If nothing looks wrong, leave red_flags empty. " +
    "Also note anything missing that a solid quote should include, such as a permit line, a materials versus labor breakdown, an itemized scope of work, a start or completion date, or a warranty on the work. List these in missing. If the quote is thorough, leave missing empty. " +
    "Write summary as two or three short, plain sentences giving the homeowner the bottom line: what the quote is for, the total, and why you reached that verdict. " +
    "Write negotiation as a short, polite message the homeowner can copy and send to the contractor as is. Reference the specific concerns you found (a vague line, a high total, a missing breakdown, and so on) and ask for a revised or itemized quote. Keep it to three or four sentences, and keep the tone friendly, not accusatory. " +
    "If what you are given is not actually a contractor's quote, or you cannot read enough of it to judge, set verdict to unclear, leave total empty, and explain why in summary. " +
    "Never invent numbers that are not shown or implied by the quote. " +
    `Today's date is ${today}. ` +
    "Write summary, notes, red_flags, missing, and negotiation in the language the quote is written in (for example, a Spanish quote gets a Spanish analysis and negotiation message), keeping the verdict field values in English. " +
    "Write in plain, complete sentences. Never use an em dash or a hyphen as a connector: use a comma, a colon, or a new sentence instead.";

  const userParts: any[] = [];
  const introBits: string[] = [];
  if (category) introBits.push(`The homeowner tagged this job as: ${category}.`);
  if (image) {
    introBits.push("Analyze the quote shown in this photo.");
    userParts.push({ text: introBits.join(" ") });
    userParts.push({ inlineData: { mimeType: mime, data: image } });
    if (text) userParts.push({ text: `The homeowner also typed this note or additional text:\n\n${text}` });
  } else {
    introBits.push("Analyze this quote:");
    userParts.push({ text: `${introBits.join(" ")}\n\n${text}` });
  }

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{ role: "user", parts: userParts }],
    generationConfig: {
      maxOutputTokens: 1200,
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
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
      // The analysis succeeded, so the credit claimed up front stays spent.
      return NextResponse.json({ analysis: normalize(parsed) });
    } catch {
      // network error - try the next model
    }
  }

  await refundFreeCredit();
  return NextResponse.json({
    analysis: null,
    reason: rateLimited ? "rate_limited" : "failed",
  });
}

const VERDICTS = ["fair", "high", "low", "unclear"] as const;

// Coerce the model's output into a clean, predictable shape rather than
// trusting arbitrary JSON straight into the UI.
function normalize(raw: any) {
  const str = (v: any) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length ? s : null;
  };
  const strArray = (v: any) =>
    Array.isArray(v)
      ? v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean)
      : [];

  const verdictRaw = str(raw?.verdict);
  const verdict = (VERDICTS as readonly string[]).includes(verdictRaw ?? "")
    ? (verdictRaw as (typeof VERDICTS)[number])
    : "unclear";

  const lineItems = Array.isArray(raw?.line_items)
    ? raw.line_items
        .map((li: any) => ({
          label: str(li?.label),
          amount: str(li?.amount),
          note: str(li?.note),
        }))
        .filter((li: any) => li.label)
    : [];

  return {
    verdict,
    total: str(raw?.total),
    summary: str(raw?.summary) ?? "",
    line_items: lineItems,
    red_flags: strArray(raw?.red_flags),
    missing: strArray(raw?.missing),
    negotiation: str(raw?.negotiation) ?? "",
  };
}
