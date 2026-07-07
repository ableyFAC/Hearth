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
  iconFor,
  COLD_START_FREE_POSTING,
} from "@/lib/constants";
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
import PhotoUpload from "@/components/PhotoUpload";
import ReviewButton from "./ReviewButton";
import ContractorReviews from "./ContractorReviews";
import HireAgainButton from "./HireAgainButton";
import { redactContact } from "@/lib/redact";

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
  const property = await getActiveProperty();
  if (!property) redirect("/onboarding");
  const supabase = createClient();
  const plus = await hasPlus();

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
        <h1 className="text-2xl font-semibold text-stone-900">Post a job</h1>
        <p className="mt-1 text-sm text-stone-500">
          Describe what you need and post it. Vetted local pros apply, then you
          review them and pick the one you want.
        </p>
      </div>

      {myPros.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">My Pros</h2>
            <p className="text-sm text-stone-500">
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
                  <p className="font-medium text-stone-900">
                    {p.name}
                    {p.rating != null && (
                      <span className="ml-2 text-xs text-amber-600">
                        ★ {p.rating}
                        <span className="text-stone-400">
                          {" "}
                          · {p.reviewCount} review{p.reviewCount === 1 ? "" : "s"}
                        </span>
                      </span>
                    )}
                  </p>
                  <p className="truncate text-sm text-stone-500">
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
        <div className="card flex items-center justify-between gap-4 border-hearth-200 bg-hearth-50">
          <div>
            <p className="font-medium text-hearth-800">
              Juggling more than one project?
            </p>
            <p className="text-sm text-hearth-700">
              Free covers 3 open jobs at a time. Hearth Plus is unlimited, plus
              priority matching so pros see yours first. Free first month, then
              $4.99.
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
            <label className="label">Email (optional)</label>
            <input
              name="homeowner_email"
              type="email"
              className="input"
              placeholder="you@example.com"
              defaultValue={profile?.email ?? user?.email ?? ""}
            />
          </div>
          <div>
            <label className="label">Phone (optional)</label>
            <PhoneInput
              name="homeowner_phone"
              defaultValue={profile?.phone ?? ""}
            />
            <p className="mt-1 text-xs text-stone-400">
              So pros can reach you faster (optional).
            </p>
          </div>
        </div>

        <div>
          {/* Not labeled optional: postJobAction enforces a 20-character floor
              on the description for a standalone post (a post linked to an
              issue can fall back to the issue's own description). */}
          <label className="label">Details about your project</label>
          <textarea
            name="message"
            className="textarea"
            rows={3}
            defaultValue={searchParams.desc ?? ""}
            placeholder="What needs doing? A sentence or two helps pros give you an accurate quote."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <PhotoUpload propertyId={property.id} />
            <p className="mt-1 text-xs text-stone-400">
              Pros quote more accurately when they can see the job.
            </p>
          </div>
          <div>
            <label className="label">Rough budget (optional)</label>
            <select name="budget_range" className="select" defaultValue="">
              <option value="">Prefer not to say</option>
              {BUDGET_RANGES.map((b) => (
                <option key={b.value} value={b.value}>
                  {b.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-stone-400">
              Helps pros give realistic quotes. Not a commitment.
            </p>
          </div>
        </div>

        <StrongPostMeter />

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
                              ? "rounded-lg border border-stone-200 p-3"
                              : "rounded-lg border border-dashed border-stone-300 p-3"
                          }
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            {reviewByLead.has(l.id) ? (
                              <div className="text-sm">
                                <span className="text-amber-500">
                                  {"★".repeat(reviewByLead.get(l.id)!.rating)}
                                  <span className="text-stone-300">
                                    {"★".repeat(
                                      5 - reviewByLead.get(l.id)!.rating
                                    )}
                                  </span>
                                </span>
                                {reviewByLead.get(l.id)!.comment && (
                                  <p className="mt-0.5 text-stone-500">
                                    {reviewByLead.get(l.id)!.comment}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-stone-500">
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
                  ) : apps.length === 0 ? (
                    <div className="space-y-2">
                      <div className="rounded-lg border border-dashed border-stone-300 p-4 text-sm text-stone-500">
                        <p>
                          Your job is live. Pros usually apply within a day or
                          two; we&apos;ll notify you the moment one does.
                        </p>
                        {/* Photos ride on the lead's issue (photos rows keyed
                            to issue_id), so a lead with no issue_id definitely
                            has none. When issue_id exists we can't tell
                            without another query, so the tip stays quiet. */}
                        {!l.issue_id && (
                          <p className="mt-1 text-xs text-stone-400">
                            Tip: adding photos or more detail helps pros decide
                            to apply and quote accurately.
                          </p>
                        )}
                      </div>
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
                              {formatResponseTime(
                                replyMinutesByContractor.get(a.contractor_id) ??
                                  null
                              ) && (
                                <p className="text-xs font-medium text-green-700">
                                  {formatResponseTime(
                                    replyMinutesByContractor.get(
                                      a.contractor_id
                                    ) ?? null
                                  )}
                                </p>
                              )}
                              {a.message && (
                                <p className="mt-1 text-sm text-stone-600">
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
