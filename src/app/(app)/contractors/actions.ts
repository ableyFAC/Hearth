"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveProperty } from "@/lib/property";
import {
  leadFeeFor,
  labelFor,
  JOB_CATEGORIES,
  ISSUE_CATEGORIES,
  BUDGET_RANGES,
  COLD_START_FREE_POSTING,
} from "@/lib/constants";
import { setFlash } from "@/lib/flash";
import { hasPlus } from "@/lib/subscription";
import { alertProsForNewLead } from "@/lib/proAlerts";
import { isMissingSchemaError } from "@/lib/dbErrors";
import { redactContact } from "@/lib/redact";

// Photo URLs come from our own upload component (PhotoUpload), so anything
// oversized is not a real URL; drop it quietly instead of storing a broken
// link. Same rule as the issue tracker's photo handling.
function validPhotoUrls(formData: FormData): string[] {
  return (formData.getAll("photo_urls") as string[]).filter(
    (u) => typeof u === "string" && u.length > 0 && u.length <= 1000
  );
}

// Homeowner posts a job (Indeed-style). No pro is picked here: the lead is left
// unassigned (contractor_id null) so matching pros can apply to it. The chosen
// pro is selected later from the applicants.
export async function postJobAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  // Abuse gate: a post fans out up to ~250 pro notification writes (and, once
  // COLD_START_FREE_POSTING/COLD_START_FREE_ALERTS flip real providers on, up
  // to 200 real SMS/email sends) per submission, and posting is currently free
  // and uncapped during cold start (the open-job-count cap below is skipped
  // entirely while COLD_START_FREE_POSTING is on). Without a limiter here, a
  // looped/scripted poster could spam every matched pro at will. Fixed-window
  // limiter (migration 0068), same pattern as onboarding's parcel lookup and
  // account/help's support message. Fails open on a DB hiccup: only an
  // explicit `allowed === false` blocks, so a rate-limiter outage never stops
  // a legit homeowner from posting.
  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    p_bucket: `post:${user.id}`,
    p_limit: 8,
    p_window_seconds: 3600,
  });
  if (allowed === false) {
    setFlash("You're posting jobs too quickly, please wait a bit.", "error");
    redirect("/contractors");
  }
  // Daily cap on top of the hourly one (security audit finding #3): the hourly
  // limiter alone still lets one account post up to 8 * 24 = 192 times a day,
  // each fanning out up to ~200 pro emails/SMS with no consent gate on the
  // email side - a real cost/reputation cannon. 20/day is far above what any
  // real household could ever need (the free-tier open-job cap below is 3
  // OPEN jobs at once, not a daily count) but stops a scripted/looped poster
  // cold. Same fixed-window limiter, same fail-open-on-DB-hiccup behavior as
  // the hourly check above.
  const { data: allowedDay } = await admin.rpc("rate_limit_hit", {
    p_bucket: `post-day:${user.id}`,
    p_limit: 20,
    p_window_seconds: 86400,
  });
  if (allowedDay === false) {
    setFlash(
      "You've reached today's posting limit. Please try again tomorrow.",
      "error"
    );
    redirect("/contractors");
  }

  const category = formData.get("category") as string;
  const issueId = (formData.get("issue_id") as string) || null;
  const timing = (formData.get("timing") as string) || null;
  const message = ((formData.get("message") as string) || "").trim() || null;

  // Optional budget band: a signal for pros, never a commitment. Only accept a
  // known band value; never write arbitrary client input.
  const budgetRaw = (formData.get("budget_range") as string) || "";
  const budgetRange = BUDGET_RANGES.some((b) => b.value === budgetRaw)
    ? budgetRaw
    : null;

  const photoUrls = validPhotoUrls(formData);

  // Contact details are captured on the form and snapshotted onto the job,
  // since a lead is a frozen packet: pros read only contractor_leads, never the
  // homeowner's account. The signed-in user's auth email is the fallback when
  // the form field is left blank.
  const homeownerName = (formData.get("homeowner_name") as string) || null;
  const homeownerEmail =
    (formData.get("homeowner_email") as string) || user.email || null;
  const homeownerPhone = (formData.get("homeowner_phone") as string) || null;

  // The job description pros see: the homeowner's own words, falling back to the
  // linked issue's text.
  let issueDescription: string | null = message;
  let issueSeverity: string | null = null;
  if (issueId) {
    const { data: issue } = await supabase
      .from("issues")
      .select("description, severity")
      .eq("id", issueId)
      .maybeSingle();
    issueDescription = message ?? issue?.description ?? null;
    issueSeverity = issue?.severity ?? null;
  }

  // Pros pay to apply, so a posting has to give them something to go on:
  // require a real description (at least 20 characters) before it goes live.
  // The redirect carries what they typed back as query params (the page
  // already prefills category/timing/desc/issue from searchParams), so a
  // rejected post keeps the text fields. Contact fields re-prefill from the
  // saved profile as usual. Photos are the one thing the round-trip can't
  // keep: they live in PhotoUpload's client state, which the redirect
  // remounts empty. So the already-uploaded objects are removed from storage
  // (they'd be unreachable orphans otherwise) and the flash says plainly that
  // photos need re-attaching.
  if ((issueDescription ?? "").trim().length < 20) {
    if (photoUrls.length) {
      // Best-effort cleanup, same pattern as saveDocumentAction: a storage
      // hiccup here should never block the validation redirect.
      const paths = photoUrls
        .map((u) => u.split("/home-photos/")[1])
        .filter((p): p is string => Boolean(p));
      if (paths.length) {
        await supabase.storage.from("home-photos").remove(paths);
      }
    }
    setFlash(
      photoUrls.length
        ? "Please describe the job in at least 20 characters so pros know what they're applying to. Your photos weren't kept, so please re-attach them."
        : "Please describe the job in at least 20 characters so pros know what they're applying to.",
      "error"
    );
    const keep = new URLSearchParams();
    if (category) keep.set("category", category);
    if (timing) keep.set("timing", timing);
    if (message) keep.set("desc", message);
    if (issueId) keep.set("issue", issueId);
    const query = keep.toString();
    redirect(query ? `/contractors?${query}` : "/contractors");
  }

  // Scrub contact info out of the description before it's stored anywhere:
  // pros pay to apply through the marketplace, and a homeowner's "call me at
  // ..." dropped into the free-text field would let a pro take the job
  // off-platform before ever paying to apply. The 20-character check above
  // ran on the real text (so a description that's mostly a phone number still
  // has to carry enough real content), but everything stored on the lead, fed
  // to the carrier issue, and pushed to pro alerts uses the redacted version.
  issueDescription = issueDescription ? redactContact(issueDescription) : issueDescription;

  const address = [property.address_line1, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  // Guard against a double-submit posting the same job twice: if an identical
  // open posting was just created (same property + category), reuse it.
  const { data: recent } = await supabase
    .from("contractor_leads")
    .select("id, created_at")
    .eq("property_id", property.id)
    .eq("category", category)
    .is("contractor_id", null)
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 15000) {
    redirect("/contractors?posted=1");
  }

  // Free vs Plus open-job limits: a free homeowner may have 3 open jobs at a
  // time (plenty for any normal household, and it keeps junk postings down);
  // Plus removes the cap. An open listing is one no pro has been picked for yet.
  // COLD START: while COLD_START_FREE_POSTING is on, posting is free for
  // everyone and the cap is skipped entirely. Flip the constant to restore it.
  if (!COLD_START_FREE_POSTING) {
    const plus = await hasPlus();
    const limit = plus ? Infinity : 3;
    const { count: openCount } = await supabase
      .from("contractor_leads")
      .select("id", { count: "exact", head: true })
      .eq("property_id", property.id)
      .is("contractor_id", null)
      .eq("status", "new");
    if ((openCount ?? 0) >= limit) {
      // Only free homeowners can reach this: Plus is unlimited.
      redirect("/plus?reason=job_limit");
    }
  }

  // Photos ride on an issue (photos rows with related_type 'issue'), which is
  // exactly what the pro board's has_photos signal reads (0028's
  // open_jobs_for_me checks photos against the lead's issue_id). A job posted
  // straight from this form has no issue yet, so create a lightweight one to
  // carry the photos. Born converted_to_lead so the issue tracker never nudges
  // the owner about it, and severity stays off the lead (issueSeverity is
  // untouched) so no bogus severity chip appears on the pro's card.
  // Best-effort: if the carrier issue can't be created, the post still goes
  // through, just without photos.
  let photoIssueId = issueId;
  if (photoUrls.length && !photoIssueId) {
    const issueCategory = ISSUE_CATEGORIES.some((c) => c.value === category)
      ? category
      : "other";
    const { data: carrier } = await supabase
      .from("issues")
      .insert({
        property_id: property.id,
        category: issueCategory,
        severity: "low",
        description: (issueDescription ?? "").slice(0, 4000) || null,
        converted_to_lead: true,
      })
      .select("id")
      .single();
    if (carrier) photoIssueId = carrier.id;
  }

  const leadRow = {
    property_id: property.id,
    issue_id: photoIssueId,
    contractor_id: null, // open job: pros apply, homeowner picks later
    category,
    status: "new",
    payout_amount: leadFeeFor(category),
    homeowner_name: homeownerName,
    homeowner_email: homeownerEmail,
    homeowner_phone: homeownerPhone,
    property_address: address,
    issue_description: issueDescription,
    issue_severity: issueSeverity,
    timing,
  };

  // budget_range isn't in the generated types (and migration 0047 may not have
  // run against this database yet): write it via `as any`, and on the
  // missing-column fingerprint specifically, retry without it so posting never
  // breaks. Same pattern as the contractors insert in pro/actions.
  let { data: inserted, error } = await supabase
    .from("contractor_leads")
    .insert(
      (budgetRange ? { ...leadRow, budget_range: budgetRange } : leadRow) as any
    )
    .select("id, created_at")
    .single();
  if (error && budgetRange && isMissingSchemaError(error)) {
    ({ data: inserted, error } = await supabase
      .from("contractor_leads")
      .insert(leadRow as any)
      .select("id, created_at")
      .single());
  }
  if (error) throw new Error(error.message);

  // Second half of the double-submit guard. The pre-insert check above is
  // check-then-act: two truly concurrent submits (two tabs, a network retry
  // landing in a second lambda) can both pass it before either insert lands.
  // So re-check AFTER the insert: among identical open postings created within
  // the same 15s window, every duplicate submit sees the same deterministic
  // order (created_at, then id as the tiebreak), the first row is the keeper,
  // and any submit whose own row isn't the keeper deletes its row (plus the
  // carrier issue it just created, if any) and lands on the same "posted"
  // redirect. App-level best effort, not a DB constraint: a residual race
  // remains if a read misses a not-yet-visible concurrent commit, but the
  // window shrinks from the whole action to the moments around the insert.
  if (inserted?.id) {
    const windowStart = new Date(
      new Date(inserted.created_at).getTime() - 15000
    ).toISOString();
    const { data: twins } = await supabase
      .from("contractor_leads")
      .select("id")
      .eq("property_id", property.id)
      .eq("category", category)
      .is("contractor_id", null)
      .eq("status", "new")
      .gte("created_at", windowStart)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    const keeper = twins?.[0];
    if (keeper && keeper.id !== inserted.id) {
      await supabase.from("contractor_leads").delete().eq("id", inserted.id);
      // The keeper submit attaches photos to its own carrier issue; ours
      // would be an orphan, so drop it (only if this submit created it: a
      // pre-existing linked issue is never touched).
      if (photoIssueId && photoIssueId !== issueId) {
        await supabase.from("issues").delete().eq("id", photoIssueId);
      }
      redirect("/contractors?posted=1");
    }
  }

  // Attach the uploaded photos to the (existing or carrier) issue, exactly like
  // the issue tracker does, so pros see the "Photos attached" quality chip.
  // Best-effort: a photo hiccup should never break the post.
  if (photoUrls.length && photoIssueId) {
    await supabase.from("photos").insert(
      photoUrls.map((url) => ({
        property_id: property.id,
        related_type: "issue",
        related_id: photoIssueId!,
        url,
      }))
    );
  }

  // Mark the originating issue so we don't keep nudging the owner about it.
  if (issueId) {
    await supabase
      .from("issues")
      .update({ converted_to_lead: true })
      .eq("id", issueId);
  }

  // Instant new-job alerts through the full notification stack (in-app now,
  // email/SMS once those providers are configured). Normally a Hearth Pro
  // member perk; while COLD_START_FREE_ALERTS is on, every category-matched
  // pro gets one. Pros not alerted keep the nudge below unchanged.
  // alertProsForNewLead catches everything internally and returns the ids it
  // reached, so this can never break the post and members aren't pinged twice.
  const alertedPros = await alertProsForNewLead({
    category,
    timing,
    issue_description: issueDescription,
    // For the cold-start free-alerts path's state-level locality check
    // (null-safe, mirroring 0046: missing data never hides a job).
    property_state: property.state ?? null,
  });

  // Nudge matching pros that a fresh job just came in, so they see it while
  // it's still open and worth racing other applicants for. Best-effort only:
  // a notification hiccup should never break the homeowner's post.
  try {
    const { data: matches } = await admin
      .from("contractors")
      .select("user_id")
      .not("user_id", "is", null)
      .contains("categories", [category])
      .limit(50);
    const categoryLabel = labelFor(JOB_CATEGORIES, category);
    // Collect rows and send a single batched insert instead of awaiting one
    // insert per matched pro sequentially: up to 50 round-trips in series was
    // adding latency to the post and amplifying it per-post.
    const rows = (matches ?? []).flatMap((match) => {
      if (!match.user_id || alertedPros.has(match.user_id)) return [];
      return [
        {
          user_id: match.user_id,
          kind: "new_lead",
          title: `New ${categoryLabel} job posted nearby`,
          body: "A homeowner just posted a job. Apply before other pros do.",
          url: "/pro",
        },
      ];
    });
    if (rows.length) {
      await admin.from("notifications").insert(rows);
    }
  } catch {
    // Notifications are a nice-to-have here, not part of the posting flow.
  }

  revalidatePath("/contractors");
  revalidatePath("/issues");
  // Unique token so the post form remounts and the job fields reset for the next
  // posting (contact stays, since it's prefilled from the profile).
  redirect(`/contractors?posted=${Date.now()}`);
}

// Homeowner edits a posted job (category, timing, details, contact). RLS limits
// the update to a lead on a property the caller owns. An edit re-applies the
// posting guards from postJobAction (pros pay to apply, so an edit must not
// degrade the posting below what a fresh post is allowed to be), and once any
// pro has paid the non-refundable apply fee the category (and with it the
// payout tier) is frozen, mirroring closeJobAction's refusal to cancel.
export async function updateJobAction(formData: FormData) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const leadId = String(formData.get("lead_id"));
  const category = formData.get("category") as string;
  const timing = (formData.get("timing") as string) || null;
  const message = ((formData.get("message") as string) || "").trim() || null;
  const homeownerName = (formData.get("homeowner_name") as string) || null;
  // Mirror postJobAction: the signed-in user's auth email is the fallback when
  // the form field is left blank, so an edit never strips the contact email
  // off the frozen lead packet.
  const homeownerEmail =
    (formData.get("homeowner_email") as string) || user.email || null;
  const homeownerPhone = (formData.get("homeowner_phone") as string) || null;

  // Only a real category may set the payout tier: a forged value would fall
  // back to the cheapest "other" fee in leadFeeFor.
  if (!JOB_CATEGORIES.some((c) => c.value === category)) {
    setFlash("Please pick a valid job category.", "error");
    revalidatePath("/contractors");
    return;
  }

  // Same 20-character description floor as postJobAction: pros pay to apply,
  // so an edit can't blank out what they're applying to.
  if ((message ?? "").length < 20) {
    setFlash(
      "Please describe the job in at least 20 characters so pros know what they're applying to.",
      "error"
    );
    revalidatePath("/contractors");
    return;
  }

  // RLS scopes this read to a lead the caller owns, same as the update below.
  const { data: lead } = await supabase
    .from("contractor_leads")
    .select("id, category")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    setFlash("Something went wrong. Please try again.", "error");
    revalidatePath("/contractors");
    return;
  }

  // Once a pro has paid the (non-refundable) apply fee, the job they paid for
  // can't morph into a different, differently-priced one: refuse a category
  // swap, exactly as closeJobAction refuses a cancel. Timing/details/contact
  // edits on the same category are still fine.
  if (category !== lead.category) {
    const { count } = await (supabase as any)
      .from("lead_applications")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId);
    if ((count ?? 0) > 0) {
      setFlash(
        "Pros have already paid to apply to this job, so its category can't change. Edit the details, or post the new work as a separate job.",
        "error"
      );
      revalidatePath("/contractors");
      return;
    }
  }

  // Scrub contact info out of the description before it's stored, mirroring
  // postJobAction: pros pay to apply through the marketplace, and a "call me
  // at ..." dropped into an edit would let a pro take the job off-platform
  // before ever paying to apply. The 20-character floor above ran on the raw
  // text; only the stored value is redacted.
  const redactedMessage = message ? redactContact(message) : message;

  const { error } = await supabase
    .from("contractor_leads")
    .update({
      category,
      payout_amount: leadFeeFor(category),
      timing,
      issue_description: redactedMessage,
      homeowner_name: homeownerName,
      homeowner_email: homeownerEmail,
      homeowner_phone: homeownerPhone,
    })
    .eq("id", leadId);
  if (error) setFlash("Something went wrong. Please try again.", "error");
  else setFlash("Job updated.", "success");
  revalidatePath("/contractors");
}

// Homeowner closes (cancels) a job posting. Only allowed before any pro has
// applied - once a pro has paid the apply fee, the owner must pick from the
// applicants rather than cancel (the fee is non-refundable).
export async function closeJobAction(formData: FormData) {
  const supabase = createClient();
  const leadId = String(formData.get("lead_id"));
  const reason = (formData.get("reason") as string) || "";

  const { count } = await (supabase as any)
    .from("lead_applications")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);
  if ((count ?? 0) > 0) {
    setFlash(
      "Pros have already applied, so this job can't be closed. Pick one from the applicants.",
      "error"
    );
    revalidatePath("/contractors");
    return;
  }

  // RLS limits the delete to a lead on a property the caller owns.
  const { error } = await supabase
    .from("contractor_leads")
    .delete()
    .eq("id", leadId);
  if (error) setFlash("Something went wrong. Please try again.", "error");
  else setFlash(reason ? `Job closed: ${reason}.` : "Job closed.", "info");
  revalidatePath("/contractors");
  revalidatePath("/dashboard");
}

// Homeowner picks a pro from the applicants. The DB function assigns + unlocks
// the chosen pro (they get contact + chat) and declines the rest.
export async function chooseApplicantAction(formData: FormData) {
  const supabase = createClient() as any;
  const applicationId = String(formData.get("application_id"));
  const { error } = await supabase.rpc("choose_applicant", {
    p_application: applicationId,
  });
  if (error) setFlash("Something went wrong. Please try again.", "error");
  else
    setFlash(
      "Pro selected. They now have your contact and can message you.",
      "success"
    );
  revalidatePath("/contractors");
}

// Review comment length cap: generous enough for real feedback, short enough to
// keep the pro's review list scannable.
const REVIEW_COMMENT_MAX = 600;

// Homeowner leaves (or edits) a star rating + comment for a job. Goes through
// the leave_review() RPC (0017), which derives the contractor from the lead,
// verifies the caller owns the job, and enforces one review per job, so the
// contractor being reviewed can't be forged from the form and ratings can't be
// manipulated. The RPC upserts (one row per lead_id), so resubmitting just
// edits the existing review instead of being rejected: there is no unhappy
// path to steer around, which is exactly the point. This is the only place a
// review is written, so both /contractors and /chats can share it.
export async function saveReviewAction(formData: FormData) {
  const supabase = createClient();
  const leadId = String(formData.get("lead_id") || "");
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") || "").trim();

  if (!leadId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    setFlash("Please pick a star rating between 1 and 5.", "error");
    return;
  }
  if (comment.length > REVIEW_COMMENT_MAX) {
    setFlash(
      `Reviews are capped at ${REVIEW_COMMENT_MAX} characters. Please shorten yours.`,
      "error"
    );
    return;
  }

  // Check whether this lead already has a review before the upsert, so the pro
  // is notified once, on the first review, not on every later edit.
  const { data: already } = await supabase
    .from("reviews")
    .select("id")
    .eq("lead_id", leadId)
    .maybeSingle();

  const { error } = await supabase.rpc("leave_review", {
    p_lead: leadId,
    p_rating: rating,
    p_comment: comment,
  });

  if (error) {
    setFlash(error.message, "error");
    revalidatePath("/contractors");
    revalidatePath("/chats");
    return;
  }
  setFlash("Thanks for your review!", "success");

  // Tell the pro a review came in. Best-effort: a notification hiccup should
  // never undo a review that already saved. Only on the first review for this
  // job, not on later edits.
  if (!already) {
    try {
      const { data: lead } = await supabase
        .from("contractor_leads")
        .select("contractor_id, homeowner_name")
        .eq("id", leadId)
        .maybeSingle();
      if (lead?.contractor_id) {
        const { data: contractor } = await supabase
          .from("contractors")
          .select("user_id")
          .eq("id", lead.contractor_id)
          .maybeSingle();
        if (contractor?.user_id) {
          const admin = createAdminClient();
          // A 4 or 5 star review gets a ready-made share card (see
          // src/app/api/review-card/[reviewId]/route.tsx), so its
          // notification points straight at the share spot instead of the
          // generic message below. This REPLACES the generic notification
          // rather than adding to it, so a first 4/5-star review still
          // produces exactly one notification, not two.
          if (rating >= 4) {
            // Capped: homeowner_name has no length limit at the source, and
            // this is a notification title, not a place for a 500-char "name".
            const firstName =
              (lead.homeowner_name ?? "").trim().split(/\s+/)[0].slice(0, 40) ||
              "A homeowner";
            await admin.from("notifications").insert({
              user_id: contractor.user_id,
              kind: "new_review",
              title: `New ${rating}-star review from ${firstName}, your share card is ready`,
              body: "Download a share card and a ready-to-post caption for social media.",
              url: "/pro/business#share-reviews",
            });
          } else {
            await admin.from("notifications").insert({
              user_id: contractor.user_id,
              kind: "new_review",
              title: "You received a new review",
              body: "A homeowner just reviewed a completed job. Check your profile to see it.",
              url: "/pro",
            });
          }
        }
      }
    } catch (err) {
      console.error(
        "review notification:",
        err instanceof Error ? err.message : err
      );
    }
  }

  revalidatePath("/contractors");
  revalidatePath("/chats");
}

// Homeowner re-hires a pro they've already worked with (My Pros). The repeat
// lead is free for the pro: rehire_pro() inserts it already assigned, with no
// apply fee and no wallet charge, so nobody pays to work together again.
// rehire_pro isn't in the generated types yet, so the rpc client is cast to
// any (same pattern as choose_applicant/apply_to_lead above).
export async function rehireProAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const contractorId = String(formData.get("contractor_id") || "");
  const category = String(formData.get("category") || "");
  const description = ((formData.get("description") as string) || "").trim();

  if (!contractorId || !category) {
    setFlash("Something went wrong. Please try again.", "error");
    redirect("/contractors");
  }

  // Mirror postJobAction: the pro needs a real description to go on, even on a
  // repeat job.
  if (description.length < 20) {
    setFlash(
      "Please describe the job in at least 20 characters so your pro knows what to expect.",
      "error"
    );
    redirect("/contractors");
  }

  const rpc = supabase as any;
  const { data: leadId, error } = await rpc.rpc("rehire_pro", {
    p_property: property.id,
    p_contractor: contractorId,
    p_category: category,
    p_description: description,
  });

  if (error) {
    // Migration 0030 may not have run against this database yet: degrade to a
    // soft message instead of crashing the page.
    const missingFn =
      error.code === "PGRST202" ||
      (/rehire_pro/i.test(error.message ?? "") &&
        /(does not exist|schema cache|not find)/i.test(error.message ?? ""));
    setFlash(
      missingFn
        ? "Hiring a pro again isn't available yet. Please check back soon."
        : "Something went wrong. Please try again.",
      "error"
    );
    revalidatePath("/contractors");
    redirect("/contractors");
  }

  // Nudge the pro that a free repeat lead just came in. Best-effort only, same
  // as the new-job notification in postJobAction: a hiccup here should never
  // break the rehire itself.
  try {
    const { data: profile } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
    const homeownerName = profile?.full_name || "A homeowner";

    const { data: contractor } = await supabase
      .from("contractors")
      .select("user_id")
      .eq("id", contractorId)
      .maybeSingle();
    if (contractor?.user_id) {
      const admin = createAdminClient();
      await admin.from("notifications").insert({
        user_id: contractor.user_id,
        kind: "new_lead",
        title: `${homeownerName} wants to hire you again: free repeat lead`,
        body: "No apply fee, they already trust your work. Check your jobs to say hi.",
        url: "/pro",
      });
    }
  } catch {
    // Notifications are a nice-to-have here, not part of the rehire flow.
  }

  revalidatePath("/contractors");
  redirect(`/chats?lead=${leadId}`);
}
