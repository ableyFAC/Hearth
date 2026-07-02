import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_TYPES } from "@/lib/constants";

export const runtime = "nodejs";

// Read the facts off a home document (a warranty, manual, receipt, or the
// model/serial data plate on an appliance) so they can auto-fill the digital
// twin. This is the "feed the AI" half of the vault: the same Gemini vision the
// chat uses, but pinned to a JSON shape so the answer is data, not prose - the
// thing a web search can never do for THEIR specific unit.
//
// Input:  { image: <base64, no data: prefix>, mime?: string }
// Output: { doc: { doc_type, title, brand, model, install_year,
//                  warranty_expires, system_type, summary } }  (any field null
//          if it isn't on the document - we never invent facts).

const SYSTEM_VALUES = SYSTEM_TYPES.map((s) => s.value);

// Gemini structured-output schema. Keeping system_type an enum means the value
// drops straight into home_systems without a mapping step.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    doc_type: {
      type: "STRING",
      enum: ["warranty", "manual", "receipt", "inspection_report", "other"],
    },
    title: { type: "STRING" },
    brand: { type: "STRING" },
    model: { type: "STRING" },
    install_year: { type: "INTEGER" },
    warranty_expires: { type: "STRING" }, // YYYY-MM-DD
    system_type: { type: "STRING", enum: [...SYSTEM_VALUES, ""] },
    summary: { type: "STRING" },
  },
  required: ["doc_type", "title", "summary"],
};

const MODELS = [
  "gemini-2.5-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // No key: the vault still works, the owner just fills fields in by hand.
    return NextResponse.json({ doc: null, reason: "no_key" });
  }

  const body = await req.json().catch(() => ({}));
  const image = typeof body.image === "string" ? body.image : "";
  const mime = typeof body.mime === "string" ? body.mime : "image/jpeg";
  if (!image) {
    return NextResponse.json({ error: "No image." }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const instruction =
    "You are reading a single home-related document a homeowner uploaded to their records: it may be an appliance/HVAC/water-heater DATA PLATE or model-and-serial label, a WARRANTY certificate, an owner's MANUAL cover, a paid RECEIPT/INVOICE, or a home INSPECTION report. " +
    "Extract ONLY what is actually printed on it - never guess or invent. Leave a field empty if it isn't shown. " +
    "For brand and model, read them exactly off the label. " +
    "For install_year, use the purchase/installation/manufacture date if present (4-digit year only). " +
    "For warranty_expires, compute the expiry date as YYYY-MM-DD if the document gives a start date plus a warranty length; otherwise leave empty. " +
    "For system_type, choose the ONE code that best matches what the document is about, or empty if none fits. " +
    "Write title as a short human label like 'Rheem water heater warranty' or 'LG dishwasher manual'. " +
    "Write summary as one plain sentence a homeowner would find useful (what it is, and the single most important fact - e.g. the filter size, the covered period, or the total paid). " +
    `Today's date is ${today}.`;

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: "Extract the fields from this document." },
          { inlineData: { mimeType: mime, data: image } },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 600,
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
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) continue;

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        continue; // malformed - try the next model
      }
      return NextResponse.json({ doc: normalize(parsed) });
    } catch {
      // network error - try the next model
    }
  }

  return NextResponse.json({
    doc: null,
    reason: rateLimited ? "rate_limited" : "failed",
  });
}

// Coerce the model's output into clean, storable values. Anything off-spec
// (a bad year, an unknown system code, a not-a-date) becomes null rather than
// polluting the home record.
function normalize(raw: any) {
  const str = (v: any) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length ? s : null;
  };
  const yearNum = Number(raw?.install_year);
  const install_year =
    Number.isInteger(yearNum) && yearNum >= 1900 && yearNum <= 2100
      ? yearNum
      : null;
  const warrantyStr = str(raw?.warranty_expires);
  const warranty_expires =
    warrantyStr && /^\d{4}-\d{2}-\d{2}$/.test(warrantyStr) ? warrantyStr : null;
  const sys = str(raw?.system_type);
  const system_type =
    sys && (SYSTEM_VALUES as readonly string[]).includes(sys) ? sys : null;

  return {
    doc_type: str(raw?.doc_type) ?? "other",
    title: str(raw?.title) ?? "Home document",
    brand: str(raw?.brand),
    model: str(raw?.model),
    install_year,
    warranty_expires,
    system_type,
    summary: str(raw?.summary),
  };
}
