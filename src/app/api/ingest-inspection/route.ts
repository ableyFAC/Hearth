import { NextRequest, NextResponse } from "next/server";
import { SYSTEM_TYPES, ISSUE_CATEGORIES, SEVERITIES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { hasPlus } from "@/lib/subscription";
import { countAiUsage } from "@/lib/aiUsage";

export const runtime = "nodejs";

// Cap the incoming base64 image so a caller can't push huge payloads at the
// paid vision model (cost/DoS). ~14M base64 chars ≈ 10MB of binary.
const MAX_IMAGE_B64_CHARS = 14_000_000;
// Cap the number of pages a single report can submit in one call.
const MAX_IMAGES = 12;

// Read an existing home inspection report (photos of its pages, pasted text,
// or both) and propose the systems and issues it describes, so an owner who
// already paid for an inspection doesn't have to retype it by hand. This is
// the "feed the AI" half of the inspection feature: structured JSON, not
// prose, straight into the shape home_systems and issues expect.
//
// Input:  { images?: string[] (base64, no data: prefix), text?: string }
// Output: { result: { summary, systems: [{ system_type, condition_rating,
//           install_year, notes }], issues: [{ category, severity,
//           description }] } | null, reason? }

const SYSTEM_VALUES = SYSTEM_TYPES.map((s) => s.value);
const ISSUE_VALUES = ISSUE_CATEGORIES.map((c) => c.value);
const SEVERITY_VALUES = SEVERITIES.map((s) => s.value);

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    systems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          system_type: { type: "STRING", enum: SYSTEM_VALUES },
          condition_rating: { type: "INTEGER" },
          install_year: { type: "INTEGER" },
          notes: { type: "STRING" },
        },
        required: ["system_type"],
      },
    },
    issues: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING", enum: ISSUE_VALUES },
          severity: { type: "STRING", enum: SEVERITY_VALUES },
          description: { type: "STRING" },
        },
        required: ["category", "severity", "description"],
      },
    },
  },
  required: ["summary", "systems", "issues"],
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ result: null, reason: "no_key" });
  }

  const body = await req.json().catch(() => ({}));
  const images: string[] = Array.isArray(body.images)
    ? body.images.filter((v: unknown): v is string => typeof v === "string" && v.length > 0)
    : [];
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (!images.length && !text) {
    return NextResponse.json(
      { error: "Add a photo of the report or paste its text." },
      { status: 400 }
    );
  }
  if (images.length > MAX_IMAGES) {
    return NextResponse.json(
      { error: `Please add at most ${MAX_IMAGES} pages at a time.` },
      { status: 413 }
    );
  }
  if (images.some((img) => img.length > MAX_IMAGE_B64_CHARS)) {
    return NextResponse.json({ error: "One of those images is too large." }, { status: 413 });
  }

  // Same per-user daily cap as /api/ask (same ai_usage table and limits), so
  // report ingestion can't be a side door around the abuse limits on the paid
  // model. One request counts once, however many pages it carries; the page
  // cap above already bounds the cost of a single call.
  const { overLimit } = await countAiUsage(user.id, await hasPlus());
  if (overLimit) {
    return NextResponse.json({ result: null, reason: "rate_limited" });
  }

  const today = new Date().toISOString().slice(0, 10);
  const instruction =
    "You are reading a home inspection report a homeowner is adding to their records. It may be given as one or more photos of the report's pages, as pasted text, or both. " +
    "Read all of it and pull out two kinds of findings. " +
    "First, systems: any major home system or component the report describes with enough detail to judge its condition, such as the roof, HVAC, water heater, electrical panel, plumbing, windows, foundation, a major appliance, gutters, siding, garage door, deck or patio, driveway, sump pump, sewer or septic line, or fence. For each one, choose the single system_type code that best matches what the report describes. Set condition_rating on a 1 to 5 scale by translating the inspector's own language: good or excellent means 4 or 5, fair, serviceable, or adequate means 3, poor, deficient, or marginal means 2, and safety hazard, failed, or needs immediate replacement means 1. Include install_year only if the report states or clearly implies it, as a 4-digit year. Write notes as one short plain sentence summarizing what the inspector said about that system. " +
    "Second, issues: any specific problem, defect, or safety concern the report calls out, whether or not it is tied to one of the systems above. For each one, choose the category that fits best: roof, plumbing, electrical, hvac, structural, or other. Set severity to low, medium, or urgent based on how the inspector frames it: a safety hazard or something needing immediate attention is urgent, a real but non-emergency defect is medium, and a minor or cosmetic note is low. Write description as one clear plain sentence describing the problem. " +
    "Only include a system or issue the report actually supports. Never invent a finding that is not in the report, and leave a field out rather than guessing at a value it does not give. " +
    "Write summary as two or three short plain sentences giving the homeowner the overall picture of the home's condition from this report. " +
    `Today's date is ${today}. ` +
    "Write in plain, complete sentences. Never use an em dash: use a comma, a colon, or a new sentence instead.";

  const userParts: any[] = [
    { text: "Read this home inspection report and extract its findings." },
  ];
  for (const img of images) {
    userParts.push({ inlineData: { mimeType: "image/jpeg", data: img } });
  }
  if (text) {
    userParts.push({ text: `The homeowner also provided this text:\n\n${text}` });
  }

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{ role: "user", parts: userParts }],
    generationConfig: {
      maxOutputTokens: 2500,
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
      return NextResponse.json({ result: normalize(parsed) });
    } catch {
      // network error - try the next model
    }
  }

  return NextResponse.json({
    result: null,
    reason: rateLimited ? "rate_limited" : "failed",
  });
}

type NormalizedSystem = {
  system_type: string;
  condition_rating: number | null;
  install_year: number | null;
  notes: string | null;
};

type NormalizedIssue = {
  category: string;
  severity: string;
  description: string | null;
};

// Coerce the model's output into clean, storable values. Anything off-spec
// (an unknown code, a bad rating, a missing required field) is dropped
// rather than let it pollute the home record.
function normalize(raw: any): {
  summary: string;
  systems: NormalizedSystem[];
  issues: NormalizedIssue[];
} {
  const str = (v: any) => {
    const s = typeof v === "string" ? v.trim() : "";
    return s.length ? s : null;
  };

  const systems: NormalizedSystem[] = [];
  if (Array.isArray(raw?.systems)) {
    for (const s of raw.systems) {
      const systemType = str(s?.system_type);
      if (!systemType || !(SYSTEM_VALUES as readonly string[]).includes(systemType)) continue;

      const ratingNum = Number(s?.condition_rating);
      const condition_rating =
        Number.isInteger(ratingNum) && ratingNum >= 1 && ratingNum <= 5 ? ratingNum : null;

      const yearNum = Number(s?.install_year);
      const install_year =
        Number.isInteger(yearNum) && yearNum >= 1900 && yearNum <= 2100 ? yearNum : null;

      systems.push({
        system_type: systemType,
        condition_rating,
        install_year,
        notes: str(s?.notes),
      });
    }
  }

  const issues: NormalizedIssue[] = [];
  if (Array.isArray(raw?.issues)) {
    for (const i of raw.issues) {
      const category = str(i?.category);
      const severity = str(i?.severity);
      const description = str(i?.description);
      if (!category || !(ISSUE_VALUES as readonly string[]).includes(category)) continue;
      if (!severity || !(SEVERITY_VALUES as readonly string[]).includes(severity)) continue;
      if (!description) continue;

      issues.push({ category, severity, description });
    }
  }

  return {
    summary: str(raw?.summary) ?? "",
    systems,
    issues,
  };
}
