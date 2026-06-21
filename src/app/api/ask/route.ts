import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";

export const runtime = "nodejs";

// "Ask Hearth": answer a homeowner's question grounded in their own home. We
// pull their systems + ages so the answer is specific (the thing Google can't
// do), then ask Gemini. Calls the API directly so there's no SDK dep.
export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      answer:
        "Ask Hearth isn't set up yet. Add a GEMINI_API_KEY to .env.local to enable it.",
    });
  }

  const body = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages : null;
  const question = typeof body.question === "string" ? body.question : "";
  if (!history?.length && !question) {
    return NextResponse.json({ error: "No question." }, { status: 400 });
  }

  // Build the home context (name + systems). If any DB/auth step fails, fall
  // back to a minimal prompt rather than erroring the whole request.
  let firstName: string | null = null;
  let context = "The homeowner hasn't added their home details yet.";
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const full =
        profile?.full_name ?? (user.user_metadata?.full_name as string) ?? null;
      firstName = full ? full.trim().split(/\s+/)[0] : null;
    }

    const property = await getActiveProperty();
    if (property) {
      const { data: systems } = await supabase
        .from("home_systems")
        .select("system_type, install_year, material_or_model, condition_rating")
        .eq("property_id", property.id);
      const lines = (systems ?? [])
        .map(
          (s) =>
            `- ${s.system_type}` +
            (s.material_or_model ? ` (${s.material_or_model})` : "") +
            (s.install_year ? `, installed ${s.install_year}` : "") +
            (s.condition_rating ? `, condition ${s.condition_rating}/5` : "")
        )
        .join("\n");
      const addr = [property.address_line1, property.city, property.state]
        .filter(Boolean)
        .join(", ");
      context =
        `Home: ${addr || "unknown address"}, built ${property.year_built ?? "unknown"}.\n` +
        `Systems on file:\n${lines || "(none added yet)"}`;
    }
  } catch {
    /* keep the minimal context */
  }

  const system =
    "You are Hearth, a friendly, practical home-maintenance assistant. " +
    (firstName
      ? `The homeowner's name is ${firstName}; greet and address them by their first name naturally, without overusing it. `
      : "") +
    "Answer the homeowner's question about THEIR specific home, concisely, in short paragraphs or bullet points. " +
    "Reference their specific systems and ages when relevant. " +
    "Talk like a normal helpful person having a back-and-forth conversation. " +
    "When you need more info, ask only ONE short follow-up question at a time and wait for the answer before asking the next - never list several questions at once. " +
    "If a job is risky, large, or code-regulated, recommend hiring a vetted pro (they can post a job in the app).\n\n" +
    // When the owner wants to hire, emit a machine-readable block the app turns
    // into a prefilled job posting. Keep it out of the visible prose.
    "When the homeowner wants to hire a pro or find a service for a specific job, help them and then append a block on its own line at the VERY END of your reply, in EXACTLY this format with nothing after it:\n" +
    '[[POSTJOB]]{"category":"<one of: roof, plumbing, electrical, hvac, structural, other>","timing":"<one of: asap, few_weeks, flexible, or empty if unknown>","summary":"<a short bullet-point summary of what they need, with \\n between bullet lines like \'- item\'>"}[[/POSTJOB]]\n' +
    "Only include that block once they actually want to hire someone, and never mention the block or its format in your visible reply.\n\n" +
    "Only use home details provided below; don't invent specifics.\n\n" +
    context;

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: history
      ? history
          .filter(
            (m: any) => m && typeof m.content === "string" && m.content.trim()
          )
          .map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }))
      : [{ role: "user", parts: [{ text: question }] }],
    generationConfig: { maxOutputTokens: 800 },
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
      const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (answer) return NextResponse.json({ answer });
      // No text (blocked/empty) - try the next model.
    } catch {
      // Network error - try the next model.
    }
  }

  return NextResponse.json({
    answer: rateLimited
      ? "Ask Hearth has hit today's free usage limit on all models. Please try again later."
      : "Sorry, I couldn't generate an answer. Please try again.",
  });
}
