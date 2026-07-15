import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { hasProPlan } from "@/lib/subscription";
import { countAiUsage } from "@/lib/aiUsage";
import {
  LEAD_TIER_FEES,
  PRO_PLAN,
  PRO_DEPOSIT_BOOST_PTS,
  GHOST_PROTECTION_DAYS,
  MAX_APPLICANTS_PER_JOB,
  leadFeeFor,
  labelFor,
  SERVICE_CATEGORIES,
  JOB_CATEGORIES,
  TIMING_OPTIONS,
} from "@/lib/constants";

export const runtime = "nodejs";

// "Ask Hearth for Pros": a business copilot for a contractor, grounded in their
// own company (trades, service area, license status, wallet, open leads). It
// mirrors the homeowner /api/ask route's structure and robustness, but talks
// from the pro's side of the marketplace and stays strictly in the pro lane.
// Calls Gemini directly so there's no SDK dep.
// Cap each attached image (base64 chars) so a caller can't push huge payloads
// at the paid vision model. ~4M chars ≈ 3MB; the client already downscales to
// ~1024px JPEG, so real attachments are far smaller than this.
const MAX_IMAGE_B64_CHARS = 4_000_000;

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // The setup detail belongs in the server logs, never in the chat.
    console.error(
      "Ask Hearth for Pros: GEMINI_API_KEY is not set in the environment."
    );
    return NextResponse.json({
      answer: "Ask Hearth is temporarily unavailable. Please try again soon.",
    });
  }

  const body = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages : null;
  const question = typeof body.question === "string" ? body.question : "";
  if (!history?.length && !question) {
    return NextResponse.json({ error: "No question." }, { status: 400 });
  }

  // Build the contractor context defensively. If any DB/auth step fails, fall
  // back to a minimal prompt rather than erroring the whole request. Whether
  // they are a paying Pro member also decides the higher daily cap below.
  let companyName: string | null = null;
  let isProMember = false;
  let context = "This pro hasn't finished setting up their company yet.";
  try {
    const contractor = await getCurrentContractor();
    if (contractor) {
      companyName = contractor.name ?? null;

      // Trades they advertise, humanized against the canonical service list.
      const cats = contractor.categories ?? [];
      const trades = cats.length
        ? cats.map((c) => labelFor(SERVICE_CATEGORIES, c)).join(", ")
        : "none selected yet";

      // Per-lead fee for each of their trades, so ROI answers use real numbers.
      const feeLines = cats.length
        ? cats
            .map((c) => `- ${labelFor(SERVICE_CATEGORIES, c)}: $${leadFeeFor(c)} per lead`)
            .join("\n")
        : "";

      const serviceArea = contractor.service_area || "not set";

      // License number + verification state, and what the verified badge means.
      const licenseStatus = contractor.license_verified_status ?? "unverified";
      const licenseLine =
        licenseStatus === "verified"
          ? `License ${contractor.license_number ?? "on file"} is CSLB verified, so their profile shows the verified badge homeowners trust.`
          : licenseStatus === "failed"
            ? `License ${contractor.license_number ?? "(none on file)"} did NOT match CSLB records, so there is no verified badge yet. They should double check the license number and CSLB status.`
            : licenseStatus === "pending"
              ? `License ${contractor.license_number ?? "(none on file)"} is being checked against CSLB right now.`
              : contractor.license_number
                ? `License ${contractor.license_number} is on file but not verified yet. The verified badge requires a matching, active CSLB license.`
                : "No license number on file. Adding an active CSLB license and getting it verified earns the verified badge that wins more homeowners.";

      // Background check state (Checkr), and what homeowners see from it.
      const bgStatus = contractor.background_check_status ?? "none";
      const bgLine =
        bgStatus === "clear"
          ? "Their background check is clear, shown to homeowners as an extra trust signal."
          : bgStatus === "consider"
            ? "Their background check came back with items to review."
            : bgStatus === "pending" || bgStatus === "invited"
              ? "Their background check is in progress."
              : "No background check yet. It is optional and Hearth paid, and a clear result adds a trust signal on their profile.";

      // Pro membership status (perks only, never gates lead access).
      isProMember = await hasProPlan();

      // Wallet balance, cash + bonus, if easily available. Never fatal.
      let walletLine = "";
      try {
        const supabase = createClient();
        const { data: wallet } = await (supabase as any)
          .from("wallets")
          .select("cash_balance_cents, bonus_balance_cents")
          .eq("contractor_id", contractor.id)
          .maybeSingle();
        if (wallet) {
          const cash = Number(wallet.cash_balance_cents ?? 0) / 100;
          const bonus = Number(wallet.bonus_balance_cents ?? 0) / 100;
          walletLine = `Wallet balance: $${(cash + bonus).toFixed(2)} (cash $${cash.toFixed(2)}, bonus $${bonus.toFixed(2)}).`;
        }
      } catch {
        /* wallet is optional context */
      }

      // Open leads matching their trades, and pending applications still waiting
      // on a homeowner. Each guarded so a missing RPC never 500s. open_jobs_for_me
      // is already filtered server-side to THIS pro's own categories, so a
      // plumber only ever gets plumbing jobs here, never roofing. We list a
      // handful with the trade, fee, timing, and a short description so the
      // copilot can talk about the pro's real available jobs instead of drifting
      // to a generic example from another trade.
      let openLeadsLine = "";
      let openJobsDetail = "";
      let pendingAppsLine = "";
      try {
        const supabase = createClient();
        const [{ data: openJobs }, { data: myApps }] = await Promise.all([
          (supabase as any).rpc("open_jobs_for_me"),
          (supabase as any).rpc("my_applications"),
        ]);
        if (Array.isArray(openJobs)) {
          openLeadsLine = `Open leads matching their trades right now: ${openJobs.length}.`;
          const top = openJobs
            .slice(0, 6)
            .map((j: any) => {
              const label = labelFor(JOB_CATEGORIES, j.category);
              const fee = leadFeeFor(j.category);
              const timing = j.timing ? labelFor(TIMING_OPTIONS, j.timing) : "";
              const desc = String(j.issue_description ?? "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 140);
              return `- ${label} ($${fee} lead fee)${timing ? `, ${timing}` : ""}: ${desc || "(no description given)"}`;
            })
            .join("\n");
          if (top)
            openJobsDetail = `The exact open leads they can apply to right now, already matched to their trades (only these, never invent others):\n${top}`;
        }
        if (Array.isArray(myApps)) {
          const pending = myApps.filter((a: any) => a.status === "applied").length;
          pendingAppsLine = `Applications still waiting on a homeowner: ${pending}.`;
        }
      } catch {
        /* counts are optional context */
      }

      context =
        `Company name: ${companyName ?? "unknown"}.\n` +
        `Trades they work in: ${trades}.\n` +
        (feeLines ? `Per-lead fee for their trades:\n${feeLines}\n` : "") +
        `Service area: ${serviceArea}.\n` +
        `${licenseLine}\n` +
        `${bgLine}\n` +
        `Pro membership: ${isProMember ? "active Hearth Pro member" : "not a Pro member (on the free tier)"}.\n` +
        (walletLine ? `${walletLine}\n` : "") +
        (openLeadsLine ? `${openLeadsLine}\n` : "") +
        (openJobsDetail ? `${openJobsDetail}\n` : "") +
        (pendingAppsLine ? `${pendingAppsLine}\n` : "");
    }
  } catch {
    /* keep the minimal context */
  }

  const today = new Date().toISOString().slice(0, 10);
  const system =
    "You are Hearth for Pros, a warm, sharp business copilot for a contractor who sells their services on the Hearth marketplace. " +
    (companyName
      ? `Their company is ${companyName}; greet and address them by it naturally, without overusing it. `
      : "") +
    "Lead with one direct sentence that answers their question. Then, if there is more to say, add a few short bullets or two to three sentence steps, with a line break between chunks and a small header before a list when it helps, like 'Line items:' or 'Next steps:'. Never write a long wall of text. Each chunk should be short enough to read in a few seconds. " +
    "Write in plain, complete sentences. Do NOT use dashes as connectors: no em dashes, and never a hyphen used as a dash. Use a comma, a colon, or a new sentence instead. " +
    "Always capitalize the first letter of every sentence, bullet point, and button label. " +
    "ALWAYS reply in the language the pro writes in. If they write in Spanish, answer entirely in Spanish; same for any other language. Match their language even if the company details below are in English. " +
    "Ground your answer in their specific company details below: their trades, service area, license and background status, membership, wallet, and open leads, rather than generic advice. " +
    "STAY IN THEIR TRADES: only ever talk about the trades listed under 'Trades they work in' below. Never bring up or give an example in a trade they do not work in (for instance, never mention roofing to a plumber). When they ask what jobs are available or what they can apply to, use ONLY the specific open leads listed in their company details below (those are already matched to their trades); never invent a job or name one in another trade. " +
    "Talk like a real person having a genuine back-and-forth: warm, direct, never stiff or corporate. Be proactively useful, do not just state a fact and stop. Always move things forward with a concrete next step. " +
    `Today's date is ${today}. ` +
    "You help this contractor grow their business, and ONLY with pro topics. Those are:\n" +
    "Winning work: read a posted lead and draft a persuasive, specific apply message; draft or sharpen a quote or estimate with sensible line items priced to compete locally in the Fountain Valley and Huntington Beach, California area; and give speed-to-lead and follow-up advice, since replying fast wins jobs.\n" +
    `The marketplace money model: the per-lead fee to apply is tiered by job value, light work is $${LEAD_TIER_FEES.light}, skilled trades are $${LEAD_TIER_FEES.skilled}, and big-ticket work is $${LEAD_TIER_FEES.major} per lead. The wallet holds cash plus bonus credit, and larger deposits earn a deposit bonus. Ghost protection auto-refunds a lead fee after ${GHOST_PROTECTION_DAYS} days of homeowner silence. A posted job fills at ${MAX_APPLICANTS_PER_JOB} applicants, so applying early matters. Do the simple ROI math when it helps, framed around THEIR own trade and a realistic job value for it: a lead fee is usually a small fraction of the job it can win. Never illustrate with a trade that is not one of theirs.\n` +
    `Pro membership: Hearth Pro is $${PRO_PLAN.monthly} per month or $${PRO_PLAN.yearly} per year, and its main perk is an extra ${PRO_DEPOSIT_BOOST_PTS} percentage points of deposit bonus on every wallet deposit. Membership is perks only, it never changes which leads they can see or apply to. Weigh it against their volume: if they deposit and apply often, the deposit boost can pay for itself.\n` +
    "Trust and compliance: how to earn the CSLB verified badge and what each license status means (verified, failed, pending, or unverified); background checks through Checkr and what homeowners see; and insurance and bonding basics as general guidance, not legal advice. Also how to improve their public profile at /p/<their id> with photos, reviews, and a complete listing to win more homeowners.\n" +
    "Growing locally: gathering reviews, seasonal demand, and using the app well, setting their categories and service area, managing notifications and applications, and marking jobs won.\n\n" +
    "SCOPING: You are the CONTRACTOR's business copilot, not a homeowner's home assistant. Do NOT act as their personal home helper: never diagnose the pro's own house as a project, and never tell them to post a job to hire someone. You may share trade knowledge when it helps them win or do work, but keep the frame on their business. If they ask something that clearly belongs to the homeowner side, gently steer back to growing their business on Hearth.\n\n" +
    // Tappable quick replies. Role-neutral: the shared chat renders these.
    "Whenever you ask the pro to choose between options, or you offer next steps, present the choices as tappable buttons. Append a block at the END in EXACTLY this format:\n" +
    '[[OPTIONS]]{"options":["First choice","Second choice"]}[[/OPTIONS]]\n' +
    "Use 2 to 5 short, capitalized labels (a few words each) that match the choices in your visible question. This includes simple yes or no questions: offer 'Yes' and 'No' buttons. Do NOT add your own 'Other' choice, because the app adds one automatically that lets them type. Never mention the block or its format in your visible reply.\n\n" +
    "Only use the company details provided below; don't invent specifics.\n\n" +
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
            // A pro can attach a photo (a quote, a job site, a label) for vision.
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
  // A paying Pro member gets the higher ceiling. Counted in the shared ai_usage
  // table (fails open, resets at midnight); see src/lib/aiUsage.ts.
  const { overLimit } = await countAiUsage(authUser.id, isProMember);
  if (overLimit) {
    return NextResponse.json({
      answer: isProMember
        ? "You have reached today's Ask Hearth limit. It resets tomorrow."
        : "You have reached today's Ask Hearth limit. It resets tomorrow. Hearth Pro raises your daily limit if you want more room.",
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
  // If a model's reply was cut off or blocked (finishReason MAX_TOKENS,
  // SAFETY, RECITATION, ...), keep the longest partial text so the user still
  // sees something if every model fails to finish cleanly.
  let bestAnswer = "";
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
      const answer = candidate?.content?.parts?.[0]?.text;
      const finishReason = candidate?.finishReason;
      // Only a clean STOP (or no reported reason) with text is a complete
      // answer; anything else was truncated or blocked, so keep the partial
      // and try the next model.
      if (answer && (!finishReason || finishReason === "STOP")) {
        return NextResponse.json({ answer });
      }
      if (typeof answer === "string" && answer.length > bestAnswer.length) {
        bestAnswer = answer;
      }
      // No text or a non-STOP finish, so try the next model.
    } catch {
      // Network error, so try the next model.
    }
  }

  // Every model came back truncated, blocked, or empty. A partial answer
  // still beats an apology.
  if (bestAnswer) return NextResponse.json({ answer: bestAnswer });

  return NextResponse.json({
    answer: rateLimited
      ? "Ask Hearth for Pros has hit today's free usage limit on all models. Please try again later."
      : "Sorry, I couldn't generate an answer. Please try again.",
  });
}
