import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContractor, getRole } from "@/lib/contractor";
import {
  labelFor,
  JOB_CATEGORIES,
  TIMING_OPTIONS,
  BUDGET_RANGES,
  MAX_APPLICANTS_PER_JOB,
  COLD_START_FREE_ALERTS,
} from "@/lib/constants";
import CategoryIcon from "@/components/CategoryIcon";
import { Check } from "lucide-react";
import Link from "next/link";
import OpenChatButton from "@/components/OpenChatButton";
import ChatDrawer from "@/components/ChatDrawer";
import LeadsRealtime from "./LeadsRealtime";
import ApplyJobButton from "./ApplyJobButton";
import JobStatusSelect from "./JobStatusSelect";
import SetupChecklist, { type SetupItem } from "@/components/pro/SetupChecklist";
import { agingLeadFee } from "@/lib/leadPricing";
import { hasProPlan } from "@/lib/subscription";
import { findActiveJobConflicts } from "@/lib/activeJobConflicts";

const SEVERITY_STYLE: Record<string, string> = {
  low: "border-stone-200 bg-stone-50 text-stone-600 dark:border-white/10 dark:bg-stone-700 dark:text-stone-300",
  medium: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
  urgent: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
};

const STATUS_STYLE: Record<string, string> = {
  new: "border-hearth-200 bg-hearth-50 text-hearth-700 dark:border-hearth-500/30 dark:bg-hearth-500/15 dark:text-hearth-300",
  accepted: "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-300",
  closed: "border-green-600 bg-green-600 text-white",
  lost: "border-stone-200 bg-stone-100 text-stone-500 dark:border-white/10 dark:bg-stone-700 dark:text-stone-400",
};

// Friendly labels for the pipeline statuses a pro sets on their own jobs.
const STATUS_LABEL: Record<string, string> = {
  new: "New lead",
  accepted: "Active",
  closed: "Won",
  lost: "Lost",
};

function money(n: number | string | null) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "-";
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

// How long a job has been sitting open - shown on the card so a pro can see
// why an aging markdown exists (or that a listing is brand new).
function postedAgo(createdAt: string | null | undefined): string | null {
  const t = new Date(createdAt ?? "").getTime();
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "Posted today";
  return `Posted ${days} day${days === 1 ? "" : "s"} ago`;
}

// Tiny factual signals a pro can price-judge a posting with. No scores, just
// whether the homeowner gave pros something real to go on. Freshness already
// shows via the posted-ago line, so it isn't repeated here.
function qualityChips(j: any): string[] {
  const chips: string[] = [];
  if ((j.issue_description ?? "").trim().length >= 80)
    chips.push("Detailed description");
  if (j.has_photos) chips.push("Photos attached");
  if (j.timing) chips.push("Timing set");
  return chips;
}

// Leads-board sort options. Newest is the default (and the order the RPC
// already returns); the others are cheap client-side re-sorts.
const SORT_OPTIONS = [
  { value: "new", label: "Newest" },
  { value: "fee", label: "Cheapest fee" },
  { value: "deal", label: "Biggest deal" },
] as const;

export default async function ProDashboard({
  searchParams,
}: {
  searchParams?: { sort?: string };
}) {
  const contractor = await getCurrentContractor();
  if (!contractor) {
    // No company yet: a user who chose the contractor role finishes company
    // setup; one with no chosen role at all picks a side first instead of
    // being funneled into either onboarding flow.
    if ((await getRole()) === null) redirect("/get-started");
    redirect("/pro/onboarding");
  }

  const supabase = createClient();

  // Open jobs to apply to (safe fields only, category-matched, not yet applied),
  // the pro's own applications, and the jobs they were chosen for (full detail).
  const [{ data: openJobs }, { data: myApps }, { data: assignedData }] =
    await Promise.all([
      (supabase as any).rpc("open_jobs_for_me"),
      (supabase as any).rpc("my_applications"),
      supabase
        .from("contractor_leads")
        .select(
          "id, status, category, issue_severity, issue_description, homeowner_name, homeowner_email, homeowner_phone, property_address, created_at"
        )
        .eq("contractor_id", contractor.id)
        .order("created_at", { ascending: false }),
    ]);

  let open = (openJobs ?? []) as any[];
  const apps = (myApps ?? []) as any[];

  // Advisory signal only (see migration 0092's RESIDUAL note): apply_to_lead
  // has no awareness of owner_closed_at, so open_jobs_for_me - a DB function,
  // out of scope for this page - can still hand back a job the homeowner
  // already closed without picking anyone. Filtered out here, client-side,
  // rather than in the RPC body. Admin client: RLS only lets a pro SELECT a
  // lead once they're its assigned contractor ("leads contractor select",
  // 0005 migration), which an open, unassigned job never is. Best-effort and
  // fail-open: any error here (including migration 0092 not having run yet,
  // so owner_closed_at doesn't exist) leaves the board unchanged rather than
  // hiding jobs or breaking the page.
  if (open.length) {
    const admin = createAdminClient();
    const { data: closedRows, error: closedError } = await admin
      .from("contractor_leads")
      .select("id, owner_closed_at")
      .in(
        "id",
        open.map((j) => j.id)
      );
    if (!closedError) {
      const closedIds = new Set(
        (closedRows ?? [])
          .filter((r: any) => r.owner_closed_at)
          .map((r: any) => r.id)
      );
      if (closedIds.size) {
        open = open.filter((j) => !closedIds.has(j.id));
      }
    }
  }

  // Open jobs posted by a homeowner this pro already has an active job with,
  // in the same category. Those cards get "message them instead" in place of
  // the apply button: the pro already has the homeowner in Messages, so a
  // second apply fee would double-charge them for the same relationship.
  // Once the earlier job closes, the job becomes applyable again.
  const relationshipConflicts = await findActiveJobConflicts(
    contractor.id,
    open.map((j) => j.id)
  );

  // Sort the open-jobs board. The effective fee (after the aging markdown) is
  // what "cheapest" means to a pro, and "deal" surfaces the biggest markdowns.
  const sort =
    searchParams?.sort === "fee" || searchParams?.sort === "deal"
      ? searchParams.sort
      : "new";
  const effFee = (j: any) =>
    agingLeadFee(Number(j.payout_amount ?? 0), j.created_at);
  if (sort === "fee") open.sort((a, b) => effFee(a).fee - effFee(b).fee);
  else if (sort === "deal")
    open.sort(
      (a, b) => effFee(b).off - effFee(a).off || effFee(a).fee - effFee(b).fee
    );

  // Won/lost jobs sink to the bottom; active ones stay on top (newest first,
  // which the query already ordered). Array.sort is stable, so order holds.
  const isDone = (l: any) => l.status === "closed" || l.status === "lost";
  const assigned = ((assignedData ?? []) as any[]).sort(
    (a, b) => (isDone(a) ? 1 : 0) - (isDone(b) ? 1 : 0)
  );

  // Applications still waiting on the homeowner (not yet chosen for the job).
  const pendingApps = apps.filter((a) => a.status === "applied");
  const declinedApps = apps.filter((a) => a.status === "declined");

  const activeCount = assigned.filter(
    (l) => l.status !== "closed" && l.status !== "lost"
  ).length;

  const { data: wallet } = await (supabase as any)
    .from("wallets")
    .select("id, cash_balance_cents, bonus_balance_cents")
    .eq("contractor_id", contractor.id)
    .maybeSingle();
  // Spendable bonus is what apply_to_lead (migration 0058) actually honors:
  // only bonus backed by live, unexpired grants. The raw wallet counter can
  // overstate that for up to a day, because an expired grant lingers in the
  // counter until the daily expire-bonus sweep reconciles it. Cap at the live
  // grant sum so canAfford and the ?need= deposit amount below match what the
  // apply RPC will accept, instead of offering an Apply that gets refused or
  // under-asking on the add-funds prompt.
  const rawBonusCents = Number(wallet?.bonus_balance_cents ?? 0);
  let bonusAvailCents = rawBonusCents;
  if (wallet?.id && rawBonusCents > 0) {
    const { data: grants } = await (supabase as any)
      .from("bonus_grants")
      .select("remaining_cents")
      .eq("wallet_id", wallet.id)
      .gt("remaining_cents", 0)
      .gt("expires_at", new Date().toISOString());
    const grantSumCents = ((grants ?? []) as any[]).reduce(
      (sum: number, g: any) => sum + Number(g.remaining_cents ?? 0),
      0
    );
    bonusAvailCents = Math.min(rawBonusCents, grantSumCents);
  }
  const balanceCents =
    Number(wallet?.cash_balance_cents ?? 0) + bonusAvailCents;
  const balance = balanceCents / 100;
  const lowBalance = balanceCents < 5000;

  // First-session setup checklist. Every item comes from data this page
  // already loads (the contractor row, the wallet, my_applications), so it
  // costs nothing extra and hides itself once every step is done.
  const setupItems: SetupItem[] = [
    {
      label: "Complete your company profile",
      done: Boolean(contractor.name) && (contractor.categories ?? []).length > 0,
      href: "/pro/profile",
      linkLabel: "Complete profile",
    },
    {
      label: "Put your license on file",
      done: Boolean(contractor.license_number),
      href: "/pro/profile",
      linkLabel: "Add license",
    },
    {
      label: "Upload your logo",
      done: Boolean((contractor as any).logo_url),
      href: "/pro/profile",
      linkLabel: "Add logo",
    },
    {
      label: "Fund your wallet",
      done: balanceCents > 0,
      href: "/pro/billing",
      linkLabel: "Add funds",
    },
    {
      label: "Apply to your first job",
      done: apps.length > 0,
      href: "#open-jobs",
      linkLabel: "Browse jobs",
    },
  ];

  // "Your results" card: how the pro's applications have paid off so far.
  const { data: appRows } = wallet
    ? await (supabase as any)
        .from("lead_applications")
        .select("status")
        .eq("contractor_id", contractor.id)
    : { data: [] };
  const appliedCount = (appRows ?? []).length;
  const wonCount = (appRows ?? []).filter(
    (a: any) => a.status === "chosen"
  ).length;

  // Only the empty-state card needs membership status (to hide the Pro-alerts
  // suggestion from members), so skip the lookup when the board has jobs.
  const isProMember = open.length === 0 ? await hasProPlan() : false;

  const { data: txnRows } = wallet?.id
    ? await (supabase as any)
        .from("wallet_transactions")
        .select("cash_delta_cents, bonus_delta_cents")
        .eq("wallet_id", wallet.id)
    : { data: [] };
  const spentCents = (txnRows ?? []).reduce((sum: number, t: any) => {
    const delta =
      Number(t.cash_delta_cents ?? 0) + Number(t.bonus_delta_cents ?? 0);
    return delta < 0 ? sum + Math.abs(delta) : sum;
  }, 0);
  const spent = spentCents / 100;

  return (
    <div className="space-y-8">
      <LeadsRealtime contractorId={contractor.id} />
      <ChatDrawer role="contractor" />

      {/* The one true page heading; the sections below step down to h2. */}
      <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Your leads</h1>

      <SetupChecklist items={setupItems} />

      {lowBalance && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/15">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            You're low on funds. Add funds to keep applying, and deposits of
            $200+ earn bonus credit.
          </p>
          <Link href="/pro/billing" className="btn-primary shrink-0">
            Add funds
          </Link>
        </div>
      )}

      {/* Hero treatment only once there are results to celebrate; before the
          first application this is just a quiet pointer. */}
      <section
        className={`space-y-1 ${appliedCount === 0 ? "card" : "card-hero"}`}
      >
        <p className="stat-label">Your results</p>
        {appliedCount === 0 ? (
          <>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              You haven't applied to a job yet. Apply to an open job below to
              start winning work.
            </p>
            {apps.length === 0 && (
              // The canonical guarantee sentence: the 60 days mirrors the
              // bonus-grant expiry in migration 0041.
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {contractor.license_number
                  ? "Not chosen on your first application? The fee comes back as lead credit, spendable on any lead, and it expires after 60 days."
                  : "Adding your license unlocks the first-application guarantee. Not chosen on your first application? The fee comes back as lead credit, spendable on any lead, and it expires after 60 days."}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-xl font-semibold text-stone-900 dark:text-stone-100">
              You've won {wonCount} job{wonCount === 1 ? "" : "s"} from{" "}
              {appliedCount} application{appliedCount === 1 ? "" : "s"}.
            </p>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Total spent on applications:{" "}
              <span className="[font-variant-numeric:tabular-nums]">
                ${spent.toFixed(2)}
              </span>
              .
              {appliedCount >= 3 &&
                ` Win rate: ${Math.round((wonCount / appliedCount) * 100)}%.`}
            </p>
          </>
        )}
      </section>

      {/* Two stats only: the Open jobs section right below already shows its
          own count, so a third card would just repeat it. */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="stat-label">Active jobs</p>
          <p className="stat-number mt-1 text-4xl text-stone-900 dark:text-stone-100">
            {activeCount}
          </p>
        </div>
        <Link
          href="/pro/billing"
          className="card transition hover:border-hearth-400 hover:shadow-md"
        >
          <p className="stat-label">Wallet balance</p>
          <p className="stat-number mt-1 text-4xl text-stone-900 dark:text-stone-100">
            ${balance.toFixed(2)}
          </p>
          <p className="mt-1 text-xs font-medium text-hearth-700 dark:text-hearth-300">Add funds →</p>
        </Link>
      </section>

      {/* ---- Open jobs: posted by homeowners, pay the fee to apply ---- */}
      <section id="open-jobs" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
              Open jobs <span className="text-stone-500 dark:text-stone-400">({open.length})</span>
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Jobs homeowners posted in your categories. Apply to one and the
              homeowner reviews you. If they pick you, you get their contact.
            </p>
          </div>
          {open.length > 1 && (
            <div className="flex gap-2">
              {SORT_OPTIONS.map((o) => (
                <Link
                  key={o.value}
                  href={o.value === "new" ? "/pro" : `/pro?sort=${o.value}`}
                  className={`rounded-full border px-3 py-1.5 text-xs ${
                    sort === o.value
                      ? "border-hearth-300 bg-hearth-50 font-medium text-hearth-700 dark:border-hearth-500/40 dark:bg-hearth-500/15 dark:text-hearth-300"
                      : "border-stone-200 text-stone-500 hover:border-stone-300 dark:border-white/10 dark:text-stone-400 dark:hover:border-stone-600"
                  }`}
                >
                  {o.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {open.length === 0 ? (
          // Honest empty state: no fake urgency, no invented stats. Just the
          // truth about a young marketplace and three useful things to do
          // while waiting (each conditional line only shows when it applies).
          <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center dark:border-stone-700">
            <p className="font-medium text-stone-900 dark:text-stone-100">
              No open jobs in your trades right now.
            </p>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Hearth is growing; new jobs land here the moment homeowners post
              them.
            </p>
            <ul className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm">
              <li className="flex items-start gap-2 text-stone-600 dark:text-stone-400">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-hearth-600" aria-hidden="true" />
                <span>
                  Make your page worth picking:{" "}
                  <Link
                    href="/pro/profile"
                    className="font-medium text-hearth-700 hover:underline dark:text-hearth-300"
                  >
                    complete your public page
                  </Link>{" "}
                  (categories, license, logo) so you stand out when jobs
                  arrive.
                </span>
              </li>
              {apps.length === 0 && (
                <li className="flex items-start gap-2 text-stone-600 dark:text-stone-400">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-hearth-600" aria-hidden="true" />
                  <span>
                    Not chosen on your first application? The fee comes back
                    as lead credit, spendable on any lead, and it expires
                    after 60 days.{" "}
                    <Link
                      href="/pro/billing"
                      className="font-medium text-hearth-700 hover:underline dark:text-hearth-300"
                    >
                      Fund your wallet
                    </Link>{" "}
                    so you can apply the moment something posts.
                  </span>
                </li>
              )}
              {/* COLD START: while COLD_START_FREE_ALERTS is on, every pro
                  gets instant alerts, so the honest line is a plain statement.
                  The membership upsell version returns when the flag flips. */}
              {COLD_START_FREE_ALERTS ? (
                <li className="flex items-start gap-2 text-stone-600 dark:text-stone-400">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-hearth-600" aria-hidden="true" />
                  <span>
                    You&apos;ll be alerted the moment a job posts in your
                    trades, so you never check an empty board.
                  </span>
                </li>
              ) : (
                !isProMember && (
                  <li className="flex items-start gap-2 text-stone-600 dark:text-stone-400">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-hearth-600" aria-hidden="true" />
                    <span>
                      <Link
                        href="/pro/plus"
                        className="font-medium text-hearth-700 hover:underline dark:text-hearth-300"
                      >
                        Get alerts the moment a job posts
                      </Link>{" "}
                      with a Pro membership, so you never check an empty board.
                    </span>
                  </li>
                )
              )}
            </ul>
          </div>
        ) : (
          <ul className="space-y-3">
            {open.map((j) => {
              const { fee, off } = agingLeadFee(
                Number(j.payout_amount ?? 0),
                j.created_at
              );
              const feeStr = money(fee);
              const baseStr = money(j.payout_amount);
              const spots = Number(j.application_count ?? 0);
              const full = spots >= MAX_APPLICANTS_PER_JOB;
              const conflict = relationshipConflicts.get(j.id);
              const chips = qualityChips(j);
              // Homeowner's rough budget band (0047): a pricing signal, not a
              // quote. "not-sure" carries no signal, so no chip for it.
              const budgetLabel =
                j.budget_range && j.budget_range !== "not-sure"
                  ? labelFor(BUDGET_RANGES, j.budget_range)
                  : null;
              return (
                <li key={j.id} className="card space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-2 font-medium text-stone-900 dark:text-stone-100">
                      <span className="icon-chip">
                        <CategoryIcon list={JOB_CATEGORIES} value={j.category} />
                      </span>{" "}
                      {labelFor(JOB_CATEGORIES, j.category)}
                      {/* Locality: open_jobs_for_me (0074) returns the
                          property city. Pros price a lead by where it is. */}
                      {j.city ? (
                        <span className="font-normal text-stone-500 dark:text-stone-400">
                          in {j.city}
                        </span>
                      ) : null}
                    </span>
                    {j.issue_severity && (
                      <span
                        className={`chip border ${SEVERITY_STYLE[j.issue_severity] ?? ""}`}
                      >
                        {j.issue_severity}
                      </span>
                    )}
                    {j.ownership_verified && (
                      <span
                        className="chip-ok"
                        title="The poster's account name matches the county assessor's owner record for this address."
                      >
                        Ownership verified
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-2 text-sm font-semibold text-stone-700 dark:text-stone-300">
                      {off > 0 && (
                        <span className="chip border border-amber-200 bg-amber-100 font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                          {off}% off, aging deal
                        </span>
                      )}
                      <span className="[font-variant-numeric:tabular-nums]">
                        Apply fee{" "}
                        {off > 0 && (
                          <span className="text-stone-500 line-through dark:text-stone-400">
                            {baseStr}
                          </span>
                        )}{" "}
                        {feeStr}
                      </span>
                    </span>
                  </div>

                  {j.issue_description ? (
                    <p className="text-sm text-stone-600 dark:text-stone-400">
                      {j.issue_description}
                    </p>
                  ) : (
                    <p className="text-sm italic text-stone-500 dark:text-stone-400">
                      No details provided yet
                    </p>
                  )}
                  {(chips.length > 0 || budgetLabel) && (
                    <div className="flex flex-wrap gap-1">
                      {budgetLabel && (
                        <span className="chip bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-400">
                          Budget: {budgetLabel}
                        </span>
                      )}
                      {chips.map((c) => (
                        <span
                          key={c}
                          className="chip bg-stone-100 text-stone-600 dark:bg-stone-700 dark:text-stone-400"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  {(postedAgo(j.created_at) || j.timing) && (
                    <div className="flex flex-wrap gap-4 text-xs text-stone-500 dark:text-stone-400">
                      {postedAgo(j.created_at) && (
                        <span className="text-xs text-stone-500 dark:text-stone-400">
                          {postedAgo(j.created_at)}
                        </span>
                      )}
                      {j.timing && (
                        <span>
                          Timing: {labelFor(TIMING_OPTIONS, j.timing)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Applicant count: shown on every card so a pro can judge
                      competition before paying the apply fee, not just once
                      the cap is already hit. */}
                  <p
                    className={`text-xs font-semibold ${
                      full ? "text-red-600 dark:text-red-400" : "text-stone-500 dark:text-stone-400"
                    }`}
                  >
                    {spots} of {MAX_APPLICANTS_PER_JOB} spots taken
                  </p>

                  {conflict ? (
                    // No apply button: the pro already has this homeowner in
                    // Messages for this trade, so buying a second lead would
                    // just double-charge them for the same relationship. The
                    // card reopens for applying once that job wraps up.
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-hearth-200 bg-hearth-50 px-3 py-2 text-sm text-hearth-800 dark:border-hearth-500/30 dark:bg-hearth-500/15 dark:text-hearth-300">
                      <span>
                        You already have an active{" "}
                        {labelFor(JOB_CATEGORIES, conflict.category)} job with
                        this homeowner.
                      </span>
                      <OpenChatButton
                        leadId={conflict.activeLeadId}
                        name={conflict.homeownerName || "Homeowner"}
                        label="Message them instead"
                      />
                    </div>
                  ) : full ? (
                    <p className="rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-center text-sm font-medium text-stone-500 dark:border-white/10 dark:bg-stone-700 dark:text-stone-400">
                      Job full
                    </p>
                  ) : (
                    <ApplyJobButton
                      leadId={j.id}
                      fee={feeStr}
                      category={labelFor(JOB_CATEGORIES, j.category)}
                      canAfford={balance >= fee}
                      billingHref={`/pro/billing?need=${Math.max(
                        0,
                        fee - balance
                      ).toFixed(2)}&category=${encodeURIComponent(
                        j.category ?? ""
                      )}`}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- Active jobs: ones the homeowner picked you for ---- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold text-stone-900 dark:text-stone-100">
            Your jobs <span className="text-stone-500 dark:text-stone-400">({assigned.length})</span>
          </h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Jobs a homeowner chose you for. Their contact is unlocked and you can
            message them.
          </p>
        </div>

        {assigned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
            No jobs yet. Apply to an open job above and a homeowner can pick you.
          </p>
        ) : (
          <ul className="space-y-3">
            {assigned.map((l) => (
              <AssignedJobCard key={l.id} l={l} />
            ))}
          </ul>
        )}
      </section>

      {/* ---- Applications still waiting on a homeowner's decision ---- */}
      {pendingApps.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              Pending applications{" "}
              <span className="text-stone-500 dark:text-stone-400">({pendingApps.length})</span>
            </h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Ghost protection: if the homeowner never responds and no one is
              picked, your fee comes back automatically after 7 days. A single
              reply from them ends it.
            </p>
          </div>
          <ul className="space-y-2">
            {pendingApps.map((a) => (
              <li
                key={a.application_id}
                className="card flex items-center justify-between gap-3"
              >
                <div>
                  <span className="flex items-center gap-2 font-medium text-stone-900 dark:text-stone-100">
                    <span className="icon-chip">
                      <CategoryIcon list={JOB_CATEGORIES} value={a.category} />
                    </span>{" "}
                    {labelFor(JOB_CATEGORIES, a.category)}
                  </span>
                  {a.issue_description && (
                    <p className="text-sm text-stone-500 dark:text-stone-400">
                      {a.issue_description}
                    </p>
                  )}
                </div>
                {a.refunded_at ? (
                  <span className="chip shrink-0 border border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-300">
                    Fee returned
                  </span>
                ) : (
                  <span className="chip shrink-0 border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
                    Waiting for homeowner
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {declinedApps.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Not selected{" "}
            <span className="text-stone-500 dark:text-stone-400">({declinedApps.length})</span>
          </h2>
          <ul className="space-y-2">
            {declinedApps.map((a) => (
              <li
                key={a.application_id}
                className="card flex items-center justify-between gap-3 opacity-70"
              >
                <span className="flex items-center gap-2 font-medium text-stone-700 dark:text-stone-300">
                  <span className="icon-chip">
                    <CategoryIcon list={JOB_CATEGORIES} value={a.category} />
                  </span>{" "}
                  {labelFor(JOB_CATEGORIES, a.category)}
                </span>
                <span className="chip shrink-0 border border-stone-200 bg-stone-100 text-stone-500 dark:border-white/10 dark:bg-stone-700 dark:text-stone-400">
                  Homeowner chose another pro
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// A job the homeowner picked this pro for: contact revealed + chat + pipeline.
function AssignedJobCard({ l }: { l: any }) {
  return (
    <li className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 font-medium text-stone-900 dark:text-stone-100">
          <span className="icon-chip">
            <CategoryIcon list={JOB_CATEGORIES} value={l.category} />
          </span>{" "}
          {labelFor(JOB_CATEGORIES, l.category)}
        </span>
        {l.issue_severity && (
          <span
            className={`chip border ${SEVERITY_STYLE[l.issue_severity] ?? ""}`}
          >
            {l.issue_severity}
          </span>
        )}
        <span className={`chip border ${STATUS_STYLE[l.status] ?? ""}`}>
          {STATUS_LABEL[l.status] ?? l.status}
        </span>
      </div>

      {l.issue_description ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">{l.issue_description}</p>
      ) : (
        <p className="text-sm italic text-stone-500 dark:text-stone-400">No details provided yet</p>
      )}

      <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600 dark:bg-stone-900 dark:text-stone-400">
        <p>
          <span className="text-stone-500 dark:text-stone-400">Homeowner:</span>{" "}
          {l.homeowner_name || "-"}
        </p>
        <p>
          <span className="text-stone-500 dark:text-stone-400">Address:</span>{" "}
          {l.property_address || "-"}
        </p>
        <p>
          <span className="text-stone-500 dark:text-stone-400">Contact:</span>{" "}
          {l.homeowner_email || "-"}
          {l.homeowner_phone ? ` · ${l.homeowner_phone}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <OpenChatButton
          leadId={l.id}
          name={l.homeowner_name || "Homeowner"}
          label="Message"
        />
        <JobStatusSelect id={l.id} status={l.status} />
      </div>
    </li>
  );
}
