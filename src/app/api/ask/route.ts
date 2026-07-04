import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveProperty } from "@/lib/property";
import { hasPlus } from "@/lib/subscription";
import { REPLACEMENT_INFO } from "@/lib/health";

export const runtime = "nodejs";

// "Ask Hearth": answer a homeowner's question grounded in their own home. We
// pull their systems + ages so the answer is specific (the thing Google can't
// do), then ask Gemini. Calls the API directly so there's no SDK dep.
// Cap each attached image (base64 chars) so a caller can't push huge payloads
// at the paid vision model. ~4M chars ≈ 3MB; the client already downscales to
// ~1024px JPEG, so real attachments are far smaller than this.
const MAX_IMAGE_B64_CHARS = 4_000_000;

export async function POST(req: NextRequest) {
  // Require a signed-in user before touching the paid model. Ask Hearth is an
  // authenticated feature; gating here (not just in middleware) stops anonymous
  // abuse that would run up Gemini cost.
  const authClient = createClient();
  const {
    data: { user: authUser },
  } = await authClient.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      // The town (or full address) used to ground cost answers locally.
      const locale =
        [property.city, property.state].filter(Boolean).join(", ") ||
        "their area";

      // Ballpark replacement cost ranges for the systems they actually own, so
      // "what does this cost?" gets a grounded number instead of a guess.
      const costLines = (systems ?? [])
        .map((s) => {
          const info = REPLACEMENT_INFO[s.system_type];
          return info
            ? `- ${s.system_type}: about $${info.low.toLocaleString()}-$${info.high.toLocaleString()} to replace (national ballpark)`
            : null;
        })
        .filter(Boolean)
        .join("\n");

      const { data: rems } = await supabase
        .from("maintenance_tasks")
        .select("title, due_date")
        .eq("property_id", property.id)
        .eq("status", "open");
      const remLines = (rems ?? [])
        .map((r) => `- ${r.title}${r.due_date ? ` (due ${r.due_date})` : ""}`)
        .join("\n");

      // Recently logged issues (any status) so the assistant can REMEMBER and
      // follow up on the home's history - the thing a search engine can't do.
      const { data: recentIssues } = await supabase
        .from("issues")
        .select("category, severity, description, status, created_at")
        .eq("property_id", property.id)
        .order("created_at", { ascending: false })
        .limit(6);
      const issueLines = (recentIssues ?? [])
        .map(
          (i) =>
            `- ${(i.created_at ?? "").slice(0, 10)}: ${i.severity ?? ""} ${
              i.category
            } - ${i.description ?? "(no detail)"} [${i.status}]`
        )
        .join("\n");

      context =
        `Home: ${addr || "unknown address"} (area for pricing: ${locale}), built ${property.year_built ?? "unknown"}.\n` +
        `Systems on file:\n${lines || "(none added yet)"}` +
        (costLines ? `\nReplacement cost ballparks for these systems:\n${costLines}` : "") +
        (remLines ? `\nThe homeowner's open reminders:\n${remLines}` : "") +
        (issueLines ? `\nRecently logged issues (most recent first):\n${issueLines}` : "");
    }
  } catch {
    /* keep the minimal context */
  }

  const today = new Date().toISOString().slice(0, 10);
  const system =
    "You are Hearth: a warm, real person the homeowner is chatting with about their home, never a robotic or corporate-sounding assistant. " +
    (firstName
      ? `The homeowner's name is ${firstName}; greet and address them by their first name naturally, without overusing it. `
      : "") +
    "Give a genuinely detailed, useful answer, but break it up so it is easy to skim. Lead with one short sentence that answers the question directly. Then, if there is more to say, add a few short bullets or two to three sentence steps, with a line break between chunks and a small header before a list when it helps, like 'Likely cause:' or 'Next steps:'. Never write a long wall of text. Each chunk should be short enough to read in a few seconds. " +
    "Write in plain, complete sentences. Do NOT use dashes as connectors: no em dashes, and never a hyphen used as a dash. Use a comma, a colon, or a new sentence instead. " +
    "ALWAYS reply in the language the homeowner writes in. If they write in Spanish, answer entirely in Spanish; same for any other language. Match their language even if the home details below are in English. The machine-readable blocks at the end (POSTJOB, LOGISSUE, REMINDER, OPTIONS) keep their exact English field values for category, timing, severity, and system_type, but any human-readable text inside them (summary, description, title, option labels) should be in the homeowner's language. " +
    "Always capitalize the first letter of every sentence, bullet point, and button label. " +
    "Lead with their specific home details, the relevant system, its age, and any open issues or reminders, rather than generic advice. " +
    "If the homeowner attaches a PHOTO, examine it closely: describe what you see, identify the system or problem, diagnose the likely cause, and recommend next steps (a DIY fix, or hiring a pro). " +
    "If the photo shows a MODEL/SERIAL label, data plate, or a filter, read the text and numbers off it and tell them the EXACT thing they need, for example the air-filter size (like 16x25x1), the replacement part or model number, or the capacity, and where to get it (a hardware/home store or online). This is something a web search can't do for their specific unit. " +
    "If the photo is a CONTRACTOR'S QUOTE, ESTIMATE, or INVOICE, act as the homeowner's advocate: read the line items and total, compare each against typical costs for their area, and give a clear verdict: is the total fair, high, or low? Call out any line items that look padded, vague, duplicated, or unusually priced, flag missing details (permits, materials, labor breakdown, warranty), and note anything that reads like a red flag or scam. End by offering to post the job so they can get competing quotes from vetted local pros to compare. " +
    "When the homeowner asks what a repair or replacement COSTS, give a concrete price RANGE for their area (named in the home details below), using the replacement ballparks below as a baseline and noting local prices can vary; then offer to post the job so vetted local pros send real quotes. Never refuse to estimate. " +
    "You have a record of their recently logged issues below, with dates. Refer back to them naturally and follow up (for example, 'last month you logged a leaking water heater, did that get sorted?') so it feels like you remember their home. " +
    "Talk like a real person having a genuine back-and-forth conversation: warm, casual, never stiff. Be PROACTIVELY useful, don't just state a fact and stop, and don't end with a hollow 'anything else?'. Always move things forward with a concrete next step or suggestion. " +
    "Keep the homeowner engaged: end almost every reply with a natural, SPECIFIC follow-up question that draws out more about their home or their goal, about the system in question, its age or symptoms, what they've noticed, or what they want to happen next, so the conversation feels genuinely two-way. Make it easy and inviting to answer, never generic. " +
    `Today's date is ${today}. ` +
    "When you mention a reminder or issue, say whether it is overdue, explain what to do about it, and offer to help (find a vetted pro, set or adjust a reminder, or mark it done). " +
    "When you need more info, ask only ONE short follow-up question at a time and wait for the answer before asking the next, never list several questions at once. Keep each question quick and casual, the way you would text a friend, for example 'Got it. How old is the water heater, roughly?' or 'Gotcha, is it making any noise?'. " +
    "If a job is risky, large, or code-regulated, recommend hiring a vetted pro (they can post a job in the app).\n\n" +
    // When the owner wants to hire, emit a machine-readable block the app turns
    // into a prefilled job posting. Keep it out of the visible prose.
    "When the homeowner wants to hire a pro or find a service for a specific job, help them and then append a block on its own line at the VERY END of your reply, in EXACTLY this format with nothing after it:\n" +
    '[[POSTJOB]]{"category":"<one of: roof, plumbing, electrical, hvac, structural, remodeling, landscaping, cleaning, windows, painting, other>","timing":"<one of: asap, few_weeks, flexible, or empty if unknown>","summary":"<a thorough, detailed description for the pro: what the problem is, the affected system with its type/brand and age if known, the specific symptoms the homeowner described, anything already tried, and what they want done. Clear bullet points with \\n between lines like \'- item\'. Be detailed, not terse - give the pro enough to quote accurately.>"}[[/POSTJOB]]\n' +
    "Only include that block once they actually want to hire someone, and never mention the block or its format in your visible reply.\n\n" +
    // Log a problem to the home record + adjust the system's condition.
    "When the conversation reveals a real problem with the home worth recording, append this block at the END:\n" +
    '[[LOGISSUE]]{"category":"<roof, plumbing, electrical, hvac, structural, other>","severity":"<low, medium, urgent>","description":"<one short sentence>","system_type":"<the matching system type like roof, hvac, water_heater, or empty>","condition":<1-5 reflecting how bad it is, or null>}[[/LOGISSUE]]\n' +
    // Set a maintenance reminder.
    "When the homeowner wants to be reminded of a maintenance task, append this block at the END:\n" +
    '[[REMINDER]]{"title":"<short task>","due_date":"<YYYY-MM-DD or empty>"}[[/REMINDER]]\n' +
    // Offer tappable choices so the homeowner rarely has to type.
    "Whenever you ask the homeowner to choose between options, or you offer next steps, present the choices as tappable buttons. Append a block at the END in EXACTLY this format:\n" +
    '[[OPTIONS]]{"options":["First choice","Second choice"]}[[/OPTIONS]]\n' +
    "Use 2 to 5 short, capitalized labels (a few words each) that match the choices in your visible question. This includes simple yes or no questions: offer 'Yes' and 'No' buttons. Do NOT add your own 'Other' choice, because the app adds one automatically that lets them type. After the homeowner picks one, offer the next set of options the same way, for example the specific system they named, then choices like 'Ask a question about it', 'Find a pro', or 'Set a reminder'. Never mention the block.\n" +
    "Use each block only when clearly appropriate, at most one of each per reply, and never mention any block in your visible text.\n\n" +
    "Only use home details provided below; don't invent specifics.\n\n" +
    context;

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: history
      ? history
          .filter(
            (m: any) =>
              m && (typeof m.content === "string" || typeof m.image === "string")
          )
          .map((m: any) => {
            const parts: any[] = [];
            if (m.content && m.content.trim()) parts.push({ text: m.content });
            // A homeowner can attach a downscaled photo - send it to vision.
            // Drop anything over the cap rather than forwarding a huge payload.
            if (
              typeof m.image === "string" &&
              m.image.length <= MAX_IMAGE_B64_CHARS
            )
              parts.push({
                inlineData: {
                  mimeType: m.mime || "image/jpeg",
                  data: m.image,
                },
              });
            if (parts.length === 0) parts.push({ text: "" });
            return {
              role: m.role === "assistant" ? "model" : "user",
              parts,
            };
          })
      : [{ role: "user", parts: [{ text: question }] }],
    generationConfig: { maxOutputTokens: 800 },
  });

  // Per-user daily cap so a single account can't run up the paid Gemini bill.
  // Hearth Plus gets a higher ceiling. Counted via the service-role client so
  // it works regardless of RLS, and tracked by calendar date (not a rolling
  // window) so it resets cleanly at midnight.
  const isPlus = await hasPlus();
  const dailyLimit = isPlus ? 250 : 25;
  let usageCount = 1;
  try {
    const admin = createAdminClient();
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
    // A broken counter should never block the homeowner from using the
    // assistant; log it and let this request through uncounted.
    console.error("ai_usage upsert failed", err);
    usageCount = 0;
  }

  if (usageCount > dailyLimit) {
    return NextResponse.json({
      answer: isPlus
        ? "You have reached today's Ask Hearth limit. It resets tomorrow."
        : "You have reached today's Ask Hearth limit. It resets tomorrow. Hearth Plus raises your daily limit if you want more room.",
    });
  }

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
