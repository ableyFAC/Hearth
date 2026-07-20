import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveProperty } from "@/lib/property";
import {
  computeResponseTimeMinutesBatch,
  formatResponseTime,
} from "@/lib/responseTime";
import {
  JOB_CATEGORIES,
  TIMING_OPTIONS,
  BUDGET_RANGES,
  labelFor,
  COLD_START_FREE_POSTING,
} from "@/lib/constants";
import CategoryIcon from "@/components/CategoryIcon";
import { hasPlus } from "@/lib/subscription";
import {
  postJobAction,
  chooseApplicantAction,
  rehireProAction,
  saveReviewAction,
} from "./actions";
import CategoryFilter from "./CategoryFilter";
import LeadChat from "@/components/LeadChat";
import PhoneInput from "@/components/PhoneInput";
import FadingBanner from "@/components/FadingBanner";
import CloseJobButton from "./CloseJobButton";
import EditJobForm from "./EditJobForm";
import PostJobButton from "./PostJobButton";
import StrongPostMeter from "./StrongPostMeter";
import DraftablePhotoUpload from "./DraftablePhotoUpload";
import DescriptionField from "./DescriptionField";
import { DraftJobProvider } from "./DraftJobContext";
import { budgetBracketForCategory } from "@/lib/health";
import PhotoTips from "@/components/PhotoTips";
import ExistingJobPhotos from "./ExistingJobPhotos";
import ReviewButton from "./ReviewButton";
import ContractorReviews from "./ContractorReviews";
import HireAgainButton from "./HireAgainButton";
import ChooseApplicantButton from "./ChooseApplicantButton";
import { redactContact } from "@/lib/redact";
import { isMissingSchemaError } from "@/lib/dbErrors";

// Must match the markers LeadChat posts when either side closes a thread.
const isCloseMarker = (b: string) =>
  b.startsWith("Conversation closed") || b === "Chat closed by the contractor.";

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
  const supabase = createClient();

  // Nothing here depends on anything else on the page (property/plus/auth
  // are all independent lookups) - run them together instead of stacking
  // three round trips before any property- or user-scoped query can start.
  const [property, plus, authResult] = await Promise.all([
    getActiveProperty(),
    hasPlus(),
    supabase.auth.getUser(),
  ]);
  if (!property) redirect("/onboarding");
  const {
    data: { user },
  } = authResult;

  const category = searchParams.category ?? "";
  const issueId = searchParams.issue ?? "";

  // Pre-fill the budget dropdown with a sane bracket when the job arrives tied
  // to a known system or issue (both carry ?category=). Falls back to "" (the
  // "Prefer not to say" option) for a fresh manual post or a category we keep
  // no cost range for, and stays user-changeable either way.
  const budgetDefault = budgetBracketForCategory(category) ?? "";

  // The owner's posted jobs (with the chosen pro's info, if one is picked yet).
  // Cast to any[]: the generated types don't model the contractor_leads ->
  // contractors join, so the nested relation reads as an error type otherwise.
  // owner_closed_at (migration 0092) isn't in the generated types yet either,
  // so the client itself is cast to any for this call, same pattern as the
  // lead_applications reads below.
  const LEADS_SELECT_WITH_CLOSE =
    "id, category, issue_description, issue_id, contractor_id, status, timing, created_at, owner_closed_at, contractors(name, rating, review_count, service_area, license_number, contact_phone, contact_email)";

  // These three queries only need property.id / user.id (both already in
  // hand) and are independent of each other, so they run as one parallel
  // wave instead of three stacked round trips.
  const [existingIssuePhotos, { data: profile }, leadsData] =
    await Promise.all([
      // If this job is about an issue that already has photos on file (the
      // "Connect me with a local pro" link from the Issues page carries
      // ?issue=<id>), fetch them so the form can show what will ride along
      // automatically. postJobAction reuses this same issue_id for the lead,
      // so photos already tied to it are already visible to pros with no
      // extra upload step - this is purely about letting the owner SEE that
      // before posting, and remove one if they don't want it sent.
      issueId
        ? supabase
            .from("photos")
            .select("id, url")
            .eq("property_id", property.id)
            .eq("related_type", "issue")
            .eq("related_id", issueId)
            .then((r) => r.data ?? [])
        : Promise.resolve<{ id: string; url: string }[]>([]),
      // Prefill the contact fields from the owner's saved profile.
      supabase
        .from("users")
        .select("full_name, email, phone")
        .eq("id", user?.id ?? "")
        .maybeSingle(),
      (async () => {
        let { data: leadsData, error: leadsError } = await (
          supabase as any
        )
          .from("contractor_leads")
          .select(LEADS_SELECT_WITH_CLOSE)
          .eq("property_id", property.id)
          .order("created_at", { ascending: false });
        if (leadsError && isMissingSchemaError(leadsError)) {
          // Migration 0092 hasn't run against this database yet: retry
          // without the new column instead of showing an empty jobs list.
          ({ data: leadsData } = await (supabase as any)
            .from("contractor_leads")
            .select(
              "id, category, issue_description, issue_id, contractor_id, status, timing, created_at, contractors(name, rating, review_count, service_area, license_number, contact_phone, contact_email)"
            )
            .eq("property_id", property.id)
            .order("created_at", { ascending: false }));
        }
        return leadsData;
      })(),
    ]);
  const leads = (leadsData ?? []) as any[];

  // My Pros: distinct pros the homeowner previously hired on this property
  // (accepted = active, closed = completed), most recent job first, so each
  // shows what they were last hired for. `leads` is already newest-first, so
  // the first row seen per contractor is that pro's most recent job.
  const myPros: {
    contractorId: string;
    name: string;
    lastCategory: string;
    lastDescription: string | null;
    rating: number | null;
    reviewCount: number;
  }[] = [];
  const seenContractors = new Set<string>();
  for (const l of leads) {
    if (!l.contractor_id) continue;
    if (l.status !== "accepted" && l.status !== "closed") continue;
    if (seenContractors.has(l.contractor_id)) continue;
    seenContractors.add(l.contractor_id);
    myPros.push({
      contractorId: l.contractor_id,
      name: l.contractors?.name ?? "Your pro",
      lastCategory: l.category,
      lastDescription: l.issue_description ?? null,
      rating: l.contractors?.review_count > 0 ? l.contractors.rating : null,
      reviewCount: l.contractors?.review_count ?? 0,
    });
  }

  // Figure out which jobs are finished (chat-closed) and which already have a
  // review, so the row can show a "Leave a review" / "Edit review" button.
  const leadIds = leads.map((l) => l.id);
  const reviewByLead = new Map<
    string,
    { rating: number; comment: string | null }
  >();
  const closedIds = new Set<string>();
  // Applications on the owner's jobs, with each applying pro's public info.
  // lead_applications isn't in the generated types yet, so query via any.
  const appsByLead = new Map<string, any[]>();
  if (leadIds.length) {
    // None of these three depend on each other - only on leadIds - so they
    // run as one parallel wave instead of three stacked round trips.
    const [{ data: revs }, { data: sys }, { data: apps }] = await Promise.all([
      supabase
        .from("reviews")
        .select("lead_id, rating, comment")
        .in("lead_id", leadIds),
      supabase
        .from("messages")
        .select("lead_id, body, created_at")
        .eq("sender_role", "system")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false }),
      (supabase as any)
        .from("lead_applications")
        .select(
          "id, lead_id, contractor_id, message, created_at, status, refunded_at, contractors(name, rating, review_count, service_area, license_number, license_verified_at)"
        )
        .in("lead_id", leadIds)
        .order("created_at", { ascending: true }),
    ]);
    for (const r of revs ?? [])
      reviewByLead.set(r.lead_id, { rating: r.rating, comment: r.comment });

    const lastSys = new Map<string, any>();
    for (const m of sys ?? []) if (!lastSys.has(m.lead_id)) lastSys.set(m.lead_id, m);
    for (const [lid, m] of lastSys)
      if (isCloseMarker(m.body)) closedIds.add(lid);

    for (const a of (apps ?? []) as any[]) {
      const list = appsByLead.get(a.lead_id) ?? [];
      list.push(a);
      appsByLead.set(a.lead_id, list);
    }
  }

  // Reply-speed line on each applicant card: one batched computation for
  // every applying pro across every job on this page (never one query per
  // pro, never one query per job). Needs the admin client - a pro's reply
  // history spans jobs posted by other homeowners too, which this
  // homeowner's own RLS-scoped client has no way to read.
  const applicantContractorIds = Array.from(
    new Set(
      Array.from(appsByLead.values())
        .flat()
        .map((a: any) => a.contractor_id)
        .filter(Boolean)
    )
  );
  const replyMinutesByContractor =
    applicantContractorIds.length > 0
      ? await computeResponseTimeMinutesBatch(
          createAdminClient(),
          applicantContractorIds
        )
      : new Map<string, number | null>();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Post a job</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Describe what you need and post it. Local pros apply, then you review
          them and pick the one you want.
        </p>
      </div>

      <form
        key={searchParams.posted ?? "new"}
        action={postJobAction}
        className="card space-y-4"
      >
        <DraftJobProvider initialCategory={category}>
        <input type="hidden" name="issue_id" value={issueId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="job-category">
              What do you need?
            </label>
            <CategoryFilter category={category} id="job-category" />
          </div>
          <div>
            <label className="label" htmlFor="job-timing">
              Preferred timing
            </label>
            <select
              name="timing"
              id="job-timing"
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
            <label className="label" htmlFor="homeowner-name">
              First and last name
            </label>
            <input
              name="homeowner_name"
              id="homeowner-name"
              className="input"
              placeholder="Jane Doe"
              defaultValue={profile?.full_name ?? ""}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="homeowner-email">
              Email (optional)
            </label>
            <input
              name="homeowner_email"
              id="homeowner-email"
              type="email"
              className="input"
              placeholder="you@example.com"
              defaultValue={profile?.email ?? user?.email ?? ""}
            />
          </div>
          <div>
            <label className="label" htmlFor="homeowner-phone">
              Phone (optional)
            </label>
            <PhoneInput
              name="homeowner_phone"
              id="homeowner-phone"
              defaultValue={profile?.phone ?? ""}
            />
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              So pros can reach you faster (optional).
            </p>
          </div>
        </div>

        <DescriptionField initialDescription={searchParams.desc ?? ""} />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            {existingIssuePhotos.length > 0 && (
              <ExistingJobPhotos photos={existingIssuePhotos} />
            )}
            <DraftablePhotoUpload propertyId={property.id} id="job-photos" />
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Pros quote more accurately when they can see the job.
            </p>
            <PhotoTips />
          </div>
          <div>
            <label className="label" htmlFor="job-budget">
              Rough budget (optional)
            </label>
            <select
              name="budget_range"
              id="job-budget"
              className="select"
              defaultValue={budgetDefault}
            >
              <option value="">Prefer not to say</option>
              {BUDGET_RANGES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Helps pros give realistic quotes. Not a commitment.
            </p>
          </div>
        </div>

        <StrongPostMeter />

        <PostJobButton />
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Your contact stays private. Only the pro you choose from the applicants
          gets your name, address, and contact details.
        </p>
        </DraftJobProvider>
      </form>

      {myPros.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">My Pros</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Already worked with someone great? Hire them again, free, no
              apply fee.
            </p>
          </div>
          <ul className="space-y-2">
            {myPros.map((p) => (
              <li
                key={p.contractorId}
                className="card flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-stone-900 dark:text-stone-100">
                    {p.name}
                    {p.rating != null && (
                      <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                        ★ {p.rating}
                        <span className="text-stone-500 dark:text-stone-400">
                          {" "}
                          · {p.reviewCount} review{p.reviewCount === 1 ? "" : "s"}
                        </span>
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-stone-500 dark:text-stone-400">
                    Last hired for {labelFor(JOB_CATEGORIES, p.lastCategory)}
                    {p.lastDescription ? `: ${p.lastDescription}` : ""}
                  </p>
                </div>
                <HireAgainButton
                  contractorId={p.contractorId}
                  contractorName={p.name}
                  lastCategory={p.lastCategory}
                  action={rehireProAction}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* COLD START: while posting is free and uncapped for everyone, the
          "3 open jobs" upsell would be false advertising, so it stays hidden.
          Flip COLD_START_FREE_POSTING to bring it back with the cap. */}
      {!COLD_START_FREE_POSTING && !plus && (
        <div className="card flex items-center justify-between gap-4 border-bark-100 bg-bark-50 dark:border-bark-700/40 dark:bg-bark-700/30">
          <div>
            <p className="font-medium text-bark-700 dark:text-stone-300">
              Juggling more than one project?
            </p>
            <p className="text-sm text-bark-700 dark:text-stone-300">
              Free covers 3 open jobs at a time. Hearth Plus is unlimited, plus
              priority matching so pros see yours first. 3-day free trial, then
              $4.99/mo.
            </p>
          </div>
          <Link href="/plus" className="btn-primary shrink-0">
            Line up more pros
          </Link>
        </div>
      )}

      {searchParams.posted && (
        <FadingBanner
          delay={2500}
          fadeMs={4500}
          className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200"
        >
          Job posted. Matching pros can now apply, and we&apos;ll notify you
          the moment one does. Honest note: Hearth is still new in some areas,
          so if applications are slow it&apos;s our pro coverage catching up,
          not a problem with your post.
        </FadingBanner>
      )}

      {/* Renders nothing when there are no jobs yet; posting the first one
          is handled by the form above, not this section. */}
      {leads && leads.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Your jobs</h2>
          <ul className="space-y-3">
            {leads.map((l) => {
              const apps = appsByLead.get(l.id) ?? [];
              const chosen = Boolean(l.contractor_id);
              // closeJobAction only counts and notifies LIVE applicants
              // (status 'applied', not yet ghost-refunded), so the close
              // copy should match that, not the raw application count.
              const liveApplicantCount = apps.filter(
                (a: any) => a.status === "applied" && !a.refunded_at
              ).length;
              // Closed by the owner without picking anyone (migration 0092):
              // status/contractor_id are untouched by this, so `chosen` still
              // reads correctly even for a job closed this way.
              const closedByOwner = !chosen && Boolean(l.owner_closed_at);
              return (
                <li key={l.id} className="card space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-stone-900 dark:text-stone-100">
                        <CategoryIcon
                          list={JOB_CATEGORIES}
                          value={l.category}
                          className="mr-1 inline-block h-4 w-4 align-[-3px]"
                        />
                        {labelFor(JOB_CATEGORIES, l.category)}
                      </span>
                      {l.issue_description && (
                        <p className="text-sm text-stone-500 dark:text-stone-400">
                          {l.issue_description}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-xs font-medium text-stone-500 dark:border-white/10 dark:bg-stone-700 dark:text-stone-300">
                      {chosen
                        ? "Pro selected"
                        : closedByOwner
                        ? "Closed"
                        : `${apps.length} applicant${apps.length === 1 ? "" : "s"}`}
                    </span>
                  </div>

                  {!chosen && !closedByOwner && <EditJobForm job={l} />}

                  {chosen ? (
                    // A pro has been picked: show them + open the message thread.
                    <div className="space-y-2">
                      <div className="rounded-lg bg-stone-50 p-3 text-sm dark:bg-stone-700">
                        <p className="font-medium text-stone-900 dark:text-stone-100">
                          {l.contractors?.name ?? "Your pro"}
                          {l.contractors?.review_count > 0 ? (
                            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">
                              ★ {l.contractors.rating}
                              <span className="text-stone-500 dark:text-stone-400">
                                {" "}
                                · {l.contractors.review_count} review
                                {l.contractors.review_count === 1 ? "" : "s"}
                              </span>
                            </span>
                          ) : null}
                        </p>
                        <p className="text-stone-500 dark:text-stone-400">
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

                      {/* Review the pro once the conversation has been closed.
                          Both branches keep the SAME tree shape (outer div >
                          flex div > [content, ReviewButton]) so React updates
                          ReviewButton in place when the post-submit
                          revalidation flips this row from "no review" to
                          "reviewed": a shape change here would remount it and
                          wipe the just-shown "Share your pro" card. */}
                      {closedIds.has(l.id) && (
                        <div
                          className={
                            reviewByLead.has(l.id)
                              ? "rounded-lg border border-stone-200 p-3 dark:border-white/10"
                              : "rounded-lg border border-dashed border-stone-300 p-3 dark:border-stone-700"
                          }
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            {reviewByLead.has(l.id) ? (
                              <div className="text-sm">
                                <span className="text-amber-500">
                                  {"★".repeat(reviewByLead.get(l.id)!.rating)}
                                  <span className="text-stone-300 dark:text-stone-600">
                                    {"★".repeat(
                                      5 - reviewByLead.get(l.id)!.rating
                                    )}
                                  </span>
                                </span>
                                {reviewByLead.get(l.id)!.comment && (
                                  <p className="mt-0.5 text-stone-500 dark:text-stone-400">
                                    {reviewByLead.get(l.id)!.comment}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-stone-500 dark:text-stone-400">
                                Job wrapped up? Leave{" "}
                                {l.contractors?.name ?? "your pro"} a review.
                              </p>
                            )}
                            <ReviewButton
                              leadId={l.id}
                              contractorName={l.contractors?.name ?? "your pro"}
                              action={saveReviewAction}
                              existing={reviewByLead.get(l.id)}
                              proProfilePath={`/p/${l.contractor_id}`}
                              categoryLabel={labelFor(JOB_CATEGORIES, l.category)}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : closedByOwner ? (
                    // Owner closed the job without picking anyone (migration
                    // 0092): status is still 'new' underneath, so the applicants
                    // still refund on the normal ghost-protection schedule -
                    // this is purely the UI reflecting that decision.
                    <div className="rounded-lg border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
                      You closed this job without choosing a pro.
                      {apps.length > 0
                        ? " Applicants who already paid to apply were notified, and their fee is refunded automatically if you haven't picked anyone within a week of applying."
                        : ""}
                    </div>
                  ) : apps.length === 0 ? (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-dashed border-stone-300 p-4 text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
                        {/* An asap job shouldn't be told "a day or two": point
                            a real emergency at faster help instead. */}
                        {l.timing === "asap" ? (
                          <p>
                            Your job is live and marked urgent. For active
                            flooding or gas, don&apos;t wait: call a 24/7 pro
                            directly, and use the{" "}
                            <Link
                              href="/emergency"
                              className="font-medium text-bark-700 hover:underline dark:text-stone-300"
                            >
                              Emergency page
                            </Link>{" "}
                            for shutoff steps.
                          </p>
                        ) : (
                          <p>
                            Your job is live. Pros usually apply within a day or
                            two; we&apos;ll notify you the moment one does.
                          </p>
                        )}
                        {/* Photos ride on the lead's issue (photos rows keyed
                            to issue_id), so a lead with no issue_id definitely
                            has none. When issue_id exists we can't tell
                            without another query, so the tip stays quiet. */}
                        {!l.issue_id && (
                          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
                            Tip: adding photos or more detail helps pros decide
                            to apply and quote accurately.
                          </p>
                        )}
                      </div>
                      <CloseJobButton leadId={l.id} />
                    </div>
                  ) : (
                    // Review the applicants and pick one, or close the job
                    // without picking anyone (see closeJobAction for why that
                    // no longer refuses once applicants exist).
                    <div className="space-y-2">
                      <ul className="space-y-2">
                        {apps.map((a) => (
                        <li
                          key={a.id}
                          className="rounded-lg border border-stone-200 p-3 dark:border-white/10"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                {/* Name links to the pro's full public page
                                    (/p/<id>, new tab) so the owner can see
                                    reviews and project photos before choosing.
                                    Falls back to plain text if this row somehow
                                    has no contractor_id. */}
                                {a.contractor_id ? (
                                  <a
                                    href={`/p/${a.contractor_id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium text-stone-900 hover:underline dark:text-stone-100"
                                  >
                                    {a.contractors?.name ?? "A pro"}
                                  </a>
                                ) : (
                                  <span className="font-medium text-stone-900 dark:text-stone-100">
                                    {a.contractors?.name ?? "A pro"}
                                  </span>
                                )}
                                {a.contractors?.review_count > 0 ? (
                                  <span className="text-xs text-amber-600 dark:text-amber-400">
                                    ★ {a.contractors.rating}
                                    <span className="text-stone-500 dark:text-stone-400">
                                      {" "}
                                      · {a.contractors.review_count} review
                                      {a.contractors.review_count === 1 ? "" : "s"}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-stone-500 dark:text-stone-400">
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
                              {a.contractors?.service_area && (
                                <p className="text-xs text-stone-500 dark:text-stone-400">
                                  {a.contractors.service_area}
                                </p>
                              )}
                              {/* License trust: same honest distinction as the
                                  public profile (/p/<id>). A real CSLB-checked
                                  license (license_verified_at, migration 0055)
                                  gets the green "License verified" badge; a
                                  license the pro merely typed in gets the
                                  neutral gray "License on file" badge so it can
                                  never be mistaken for the verified one. The
                                  raw number stays visible either way so a wary
                                  owner can look it up at cslb.ca.gov. */}
                              {a.contractors?.license_verified_at ? (
                                <p className="mt-1">
                                  <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200">
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-3 w-3"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2.5"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M20 6L9 17l-5-5" />
                                    </svg>
                                    License verified
                                  </span>
                                  <span className="ml-1.5 text-xs text-stone-500 dark:text-stone-400">
                                    {a.contractors?.license_number
                                      ? `Lic. ${a.contractors.license_number} · `
                                      : ""}
                                    Checked against the CSLB public database.
                                  </span>
                                </p>
                              ) : a.contractors?.license_number ? (
                                <p className="mt-1">
                                  <span className="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 dark:border-white/10 dark:bg-stone-700 dark:text-stone-300">
                                    <svg
                                      viewBox="0 0 24 24"
                                      className="h-3 w-3"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 15l2 2 4-4" />
                                    </svg>
                                    License on file
                                  </span>
                                  <span className="ml-1.5 text-xs text-stone-500 dark:text-stone-400">
                                    Lic. {a.contractors.license_number} ·
                                    Reported by the business, not verified.
                                  </span>
                                </p>
                              ) : null}
                              {formatResponseTime(
                                replyMinutesByContractor.get(a.contractor_id) ??
                                  null
                              ) && (
                                <p className="text-xs font-medium text-green-700 dark:text-green-400">
                                  {formatResponseTime(
                                    replyMinutesByContractor.get(
                                      a.contractor_id
                                    ) ?? null
                                  )}
                                </p>
                              )}
                              {a.message && (
                                <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">
                                  {redactContact(a.message)}
                                </p>
                              )}
                            </div>
                            <form action={chooseApplicantAction}>
                              <input
                                type="hidden"
                                name="application_id"
                                value={a.id}
                              />
                              <ChooseApplicantButton
                                contractorName={a.contractors?.name ?? "this pro"}
                              />
                            </form>
                          </div>
                        </li>
                      ))}
                      </ul>
                      <CloseJobButton leadId={l.id} applicantCount={liveApplicantCount} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-center text-sm text-stone-500 dark:text-stone-400">
        <Link href="/issues" className="hover:underline">
          ← Back to issues
        </Link>
      </p>
    </div>
  );
}
