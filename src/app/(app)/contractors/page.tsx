import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { JOB_CATEGORIES, TIMING_OPTIONS, labelFor, iconFor } from "@/lib/constants";
import { setFlash } from "@/lib/flash";
import { postJobAction, chooseApplicantAction } from "./actions";
import CategoryFilter from "./CategoryFilter";
import LeadChat from "@/components/LeadChat";
import PhoneInput from "@/components/PhoneInput";
import FadingBanner from "@/components/FadingBanner";
import CloseJobButton from "./CloseJobButton";
import EditJobForm from "./EditJobForm";
import PostJobButton from "./PostJobButton";
import ReviewButton from "./ReviewButton";
import ContractorReviews from "./ContractorReviews";

// Must match the markers LeadChat posts when either side closes a thread.
const isCloseMarker = (b: string) =>
  b.startsWith("Conversation closed") || b === "Chat closed by the contractor.";

// Save a homeowner's star rating + comment for a finished job. Goes through the
// leave_review() RPC, which derives the contractor from the lead, verifies the
// caller owns the job, and enforces one review per job, so the contractor being
// reviewed can't be forged from the form, and ratings can't be manipulated.
async function saveReviewAction(formData: FormData) {
  "use server";
  const supabase = createClient();
  const lead_id = String(formData.get("lead_id"));
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") || "").trim();
  if (!rating || rating < 1 || rating > 5) {
    setFlash("Please pick a star rating.", "error");
    return;
  }
  const { error } = await supabase.rpc("leave_review", {
    p_lead: lead_id,
    p_rating: rating,
    p_comment: comment,
  });
  setFlash(
    error ? error.message : "Thanks for your review!",
    error ? "error" : "success"
  );
  revalidatePath("/contractors");
}

export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: {
    issue?: string;
    category?: string;
    posted?: string;
    desc?: string;
    timing?: string;
  };
}) {
  const property = await getActiveProperty();
  if (!property) redirect("/onboarding");
  const supabase = createClient();

  const category = searchParams.category ?? "";
  const issueId = searchParams.issue ?? "";

  // Prefill the contact fields from the owner's saved profile.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, phone")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  // The owner's posted jobs (with the chosen pro's info, if one is picked yet).
  // Cast to any[]: the generated types don't model the contractor_leads ->
  // contractors join, so the nested relation reads as an error type otherwise.
  const { data: leadsData } = await supabase
    .from("contractor_leads")
    .select(
      "*, contractors(name, rating, review_count, service_area, license_number, contact_phone, contact_email)"
    )
    .eq("property_id", property.id)
    .order("created_at", { ascending: false });
  const leads = (leadsData ?? []) as any[];

  // Figure out which jobs are finished (chat-closed) and which already have a
  // review, so the row can show a "Leave a review" / "Edit review" button.
  const leadIds = leads.map((l) => l.id);
  const reviewByLead = new Map<
    string,
    { rating: number; comment: string | null }
  >();
  const closedIds = new Set<string>();
  if (leadIds.length) {
    const { data: revs } = await supabase
      .from("reviews")
      .select("lead_id, rating, comment")
      .in("lead_id", leadIds);
    for (const r of revs ?? [])
      reviewByLead.set(r.lead_id, { rating: r.rating, comment: r.comment });

    const { data: sys } = await supabase
      .from("messages")
      .select("lead_id, body, created_at")
      .eq("sender_role", "system")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: false });
    const lastSys = new Map<string, any>();
    for (const m of sys ?? []) if (!lastSys.has(m.lead_id)) lastSys.set(m.lead_id, m);
    for (const [lid, m] of lastSys)
      if (isCloseMarker(m.body)) closedIds.add(lid);
  }

  // Applications on the owner's jobs, with each applying pro's public info.
  // lead_applications isn't in the generated types yet, so query via any.
  const appsByLead = new Map<string, any[]>();
  if (leadIds.length) {
    const { data: apps } = await (supabase as any)
      .from("lead_applications")
      .select("*, contractors(name, rating, review_count, service_area, license_number)")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: true });
    for (const a of (apps ?? []) as any[]) {
      const list = appsByLead.get(a.lead_id) ?? [];
      list.push(a);
      appsByLead.set(a.lead_id, list);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Post a job</h1>
        <p className="mt-1 text-sm text-stone-500">
          Describe what you need and post it. Vetted local pros apply, then you
          review them and pick the one you want.
        </p>
      </div>

      {searchParams.posted && (
        <FadingBanner
          delay={2500}
          fadeMs={4500}
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        >
          ✅ Job posted. Matching pros can now apply. Their applications show up
          under your jobs below.
        </FadingBanner>
      )}

      <form
        key={searchParams.posted ?? "new"}
        action={postJobAction}
        className="card space-y-4"
      >
        <input type="hidden" name="issue_id" value={issueId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">What do you need?</label>
            <CategoryFilter category={category} />
          </div>
          <div>
            <label className="label">Preferred timing</label>
            <select
              name="timing"
              className="select"
              defaultValue={searchParams.timing || "few_weeks"}
            >
              {TIMING_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">First and last name</label>
            <input
              name="homeowner_name"
              className="input"
              placeholder="Jane Doe"
              defaultValue={profile?.full_name ?? ""}
              required
            />
          </div>
          <div>
            <label className="label">Email</label>
            <input
              name="homeowner_email"
              type="email"
              className="input"
              placeholder="you@example.com"
              defaultValue={profile?.email ?? user?.email ?? ""}
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <PhoneInput
              name="homeowner_phone"
              defaultValue={profile?.phone ?? ""}
            />
          </div>
        </div>

        <div>
          <label className="label">Details about your project (optional)</label>
          <textarea
            name="message"
            className="textarea"
            rows={3}
            defaultValue={searchParams.desc ?? ""}
            placeholder="What needs doing? Pros see this when deciding whether to apply."
          />
        </div>

        <PostJobButton />
        <p className="text-xs text-stone-400">
          Your contact stays private. Only the pro you choose from the applicants
          gets your name, address, and contact details.
        </p>
      </form>

      {leads && leads.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900">Your jobs</h2>
          <ul className="space-y-3">
            {leads.map((l) => {
              const apps = appsByLead.get(l.id) ?? [];
              const chosen = Boolean(l.contractor_id);
              return (
                <li key={l.id} className="card space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-stone-900">
                        {iconFor(JOB_CATEGORIES, l.category)}{" "}
                        {labelFor(JOB_CATEGORIES, l.category)}
                      </span>
                      {l.issue_description && (
                        <p className="text-sm text-stone-500">
                          {l.issue_description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-500">
                      {chosen
                        ? "Pro selected"
                        : `${apps.length} applicant${apps.length === 1 ? "" : "s"}`}
                    </span>
                  </div>

                  {!chosen && <EditJobForm job={l} />}

                  {chosen ? (
                    // A pro has been picked: show them + open the message thread.
                    <div className="space-y-2">
                      <div className="rounded-lg bg-stone-50 p-3 text-sm">
                        <p className="font-medium text-stone-900">
                          {l.contractors?.name ?? "Your pro"}
                          {l.contractors?.review_count > 0 ? (
                            <span className="ml-2 text-xs text-amber-600">
                              ★ {l.contractors.rating}
                              <span className="text-stone-400">
                                {" "}
                                · {l.contractors.review_count} review
                                {l.contractors.review_count === 1 ? "" : "s"}
                              </span>
                            </span>
                          ) : null}
                        </p>
                        <p className="text-stone-500">
                          {l.contractors?.contact_phone || ""}
                          {l.contractors?.contact_email
                            ? ` · ${l.contractors.contact_email}`
                            : ""}
                        </p>
                        {l.contractors?.review_count > 0 && (
                          <ContractorReviews
                            contractorId={l.contractor_id}
                            count={l.contractors.review_count}
                          />
                        )}
                      </div>
                      <LeadChat leadId={l.id} role="homeowner" />

                      {/* Review the pro once the conversation has been closed. */}
                      {closedIds.has(l.id) &&
                        (reviewByLead.has(l.id) ? (
                          <div className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 p-3">
                            <div className="text-sm">
                              <span className="text-amber-500">
                                {"★".repeat(reviewByLead.get(l.id)!.rating)}
                                <span className="text-stone-300">
                                  {"★".repeat(5 - reviewByLead.get(l.id)!.rating)}
                                </span>
                              </span>
                              {reviewByLead.get(l.id)!.comment && (
                                <p className="mt-0.5 text-stone-500">
                                  {reviewByLead.get(l.id)!.comment}
                                </p>
                              )}
                            </div>
                            <ReviewButton
                              leadId={l.id}
                              contractorName={l.contractors?.name ?? "your pro"}
                              action={saveReviewAction}
                              existing={reviewByLead.get(l.id)}
                            />
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-stone-300 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm text-stone-500">
                                Job wrapped up? Leave {l.contractors?.name ?? "your pro"} a
                                review.
                              </p>
                              <ReviewButton
                                leadId={l.id}
                                contractorName={l.contractors?.name ?? "your pro"}
                                action={saveReviewAction}
                              />
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : apps.length === 0 ? (
                    <div className="space-y-2">
                      <p className="rounded-lg border border-dashed border-stone-300 p-4 text-sm text-stone-500">
                        No applications yet. Matching pros in your area can see
                        this job and apply.
                      </p>
                      <CloseJobButton leadId={l.id} />
                    </div>
                  ) : (
                    // Review the applicants and pick one.
                    <ul className="space-y-2">
                      {apps.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-lg border border-stone-200 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-stone-900">
                                  {a.contractors?.name ?? "A pro"}
                                </span>
                                {a.contractors?.review_count > 0 ? (
                                  <span className="text-xs text-amber-600">
                                    ★ {a.contractors.rating}
                                    <span className="text-stone-400">
                                      {" "}
                                      · {a.contractors.review_count} review
                                      {a.contractors.review_count === 1 ? "" : "s"}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-stone-400">
                                    New
                                  </span>
                                )}
                              </div>
                              {a.contractors?.review_count > 0 && (
                                <ContractorReviews
                                  contractorId={a.contractor_id}
                                  count={a.contractors.review_count}
                                />
                              )}
                              <p className="text-xs text-stone-500">
                                {a.contractors?.service_area ?? ""}
                                {a.contractors?.license_number
                                  ? ` · Lic. ${a.contractors.license_number}`
                                  : ""}
                              </p>
                              {a.message && (
                                <p className="mt-1 text-sm text-stone-600">
                                  {a.message}
                                </p>
                              )}
                            </div>
                            <form action={chooseApplicantAction}>
                              <input
                                type="hidden"
                                name="application_id"
                                value={a.id}
                              />
                              <button className="btn-primary shrink-0 text-sm">
                                Choose
                              </button>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-center text-sm text-stone-400">
        <Link href="/issues" className="hover:underline">
          ← Back to issues
        </Link>
      </p>
    </div>
  );
}
