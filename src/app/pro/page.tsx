import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor, getRole } from "@/lib/contractor";
import {
  labelFor,
  iconFor,
  JOB_CATEGORIES,
  TIMING_OPTIONS,
  BUDGET_RANGES,
  MAX_APPLICANTS_PER_JOB,
  COLD_START_FREE_ALERTS,
} from "@/lib/constants";
import Link from "next/link";
import OpenChatButton from "@/components/OpenChatButton";
import ChatDrawer from "@/components/ChatDrawer";
import LeadsRealtime from "./LeadsRealtime";
import ApplyJobButton from "./ApplyJobButton";
import JobStatusSelect from "./JobStatusSelect";
import SetupChecklist, { type SetupItem } from "@/components/pro/SetupChecklist";
import { agingLeadFee } from "@/lib/leadPricing";
import { hasProPlan } from "@/lib/subscription";

const SEVERITY_STYLE: Record<string, string> = {
  low: "border-stone-200 bg-stone-50 text-stone-600",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_STYLE: Record<string, string> = {
  new: "border-hearth-200 bg-hearth-50 text-hearth-700",
  accepted: "border-green-200 bg-green-50 text-green-700",
  closed: "border-green-600 bg-green-600 text-white",
  lost: "border-stone-200 bg-stone-100 text-stone-500",
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
        .select("*")
        .eq("contractor_id", contractor.id)
        .order("created_at", { ascending: false }),
    ]);

  const open = (openJobs ?? []) as any[];
  const apps = (myApps ?? []) as any[];

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
  const balanceCents =
    Number(wallet?.cash_balance_cents ?? 0) +
    Number(wallet?.bonus_balance_cents ?? 0);
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

      <SetupChecklist items={setupItems} />

      {lowBalance && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-800">
            You're low on funds. Add funds to keep applying, and deposits of
            $200+ earn bonus credit.
          </p>
          <Link href="/pro/billing" className="btn-primary shrink-0">
            Add funds
          </Link>
        </div>
      )}

      <section className="card-hero space-y-1">
        <p className="stat-label">Your results</p>
        {appliedCount === 0 ? (
          <>
            <p className="text-sm text-stone-600">
              You haven't applied to a job yet. Apply to an open job below to
              start winning work.
            </p>
            {apps.length === 0 && (
              <p className="text-xs text-stone-400">
                {contractor.license_number
                  ? "Your first application is guaranteed: if you're not chosen, the fee comes back as credit."
                  : "Adding your license unlocks the first-application guarantee: if you're not chosen for your first job, the fee comes back as credit."}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-xl font-semibold text-stone-900">
              You've won {wonCount} job{wonCount === 1 ? "" : "s"} from{" "}
              {appliedCount} application{appliedCount === 1 ? "" : "s"}.
            </p>
            <p className="text-sm text-stone-500">
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

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="stat-label">Open jobs</p>
          <p className="stat-number mt-1 text-4xl text-stone-900">
            {open.length}
          </p>
        </div>
        <div className="card">
          <p className="stat-label">Active jobs</p>
          <p className="stat-number mt-1 text-4xl text-stone-900">
            {activeCount}
          </p>
        </div>
        <Link
          href="/pro/billing"
          className="card transition hover:border-hearth-400 hover:shadow-md"
        >
          <p className="stat-label">Wallet balance</p>
          <p className="stat-number mt-1 text-4xl text-stone-900">
            ${balance.toFixed(2)}
          </p>
          <p className="mt-1 text-xs font-medium text-hearth-700">Add funds →</p>
        </Link>
      </section>

      {/* ---- Open jobs: posted by homeowners, pay the fee to apply ---- */}
      <section id="open-jobs" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900">
              Open jobs <span className="text-stone-400">({open.length})</span>
            </h1>
            <p className="text-sm text-stone-500">
              Jobs homeowners posted in your categories. Apply to one and the
              homeowner reviews you. If they pick you, you get their contact.
            </p>
          </div>
          {open.length > 1 && (
            <div className="flex gap-1">
              {SORT_OPTIONS.map((o) => (
                <Link
                  key={o.value}
                  href={o.value === "new" ? "/pro" : `/pro?sort=${o.value}`}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    sort === o.value
                      ? "border-hearth-300 bg-hearth-50 font-medium text-hearth-700"
                      : "border-stone-200 text-stone-500 hover:border-stone-300"
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
          <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center">
            <p className="font-medium text-stone-900">
              No open jobs in your trades right now.
            </p>
            <p className="mt-1 text-sm text-stone-500">
              Hearth is growing; new jobs land here the moment homeowners post
              them.
            </p>
            <ul className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm">
              <li className="flex items-start gap-2 text-stone-600">
                <span aria-hidden>✔️</span>
                <span>
                  Make your page worth picking:{" "}
                  <Link
                    href="/pro/profile"
                    className="font-medium text-hearth-700 hover:underline"
                  >
                    complete your public page
                  </Link>{" "}
                  (categories, license, logo) so you stand out when jobs
                  arrive.
                </span>
              </li>
              {apps.length === 0 && (
                <li className="flex items-start gap-2 text-stone-600">
                  <span aria-hidden>✔️</span>
                  <span>
                    Your first application is guaranteed: if you&apos;re not
                    chosen, the fee comes back as credit.{" "}
                    <Link
                      href="/pro/billing"
                      className="font-medium text-hearth-700 hover:underline"
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
                <li className="flex items-start gap-2 text-stone-600">
                  <span aria-hidden>✔️</span>
                  <span>
                    You&apos;ll be alerted the moment a job posts in your
                    trades, so you never check an empty board.
                  </span>
                </li>
              ) : (
                !isProMember && (
                  <li className="flex items-start gap-2 text-stone-600">
                    <span aria-hidden>✔️</span>
                    <span>
                      <Link
                        href="/pro/plus"
                        className="font-medium text-hearth-700 hover:underline"
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
                    <span className="flex items-center gap-2 font-medium text-stone-900">
                      <span className="icon-chip">
                        {iconFor(JOB_CATEGORIES, j.category)}
                      </span>{" "}
                      {labelFor(JOB_CATEGORIES, j.category)}
                    </span>
                    {j.issue_severity && (
                      <span
                        className={`chip border ${SEVERITY_STYLE[j.issue_severity] ?? ""}`}
                      >
                        {j.issue_severity}
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-2 text-sm font-semibold text-stone-700">
                      {off > 0 && (
                        <span className="chip border border-amber-200 bg-amber-100 font-semibold text-amber-700">
                          {off}% off, aging deal
                        </span>
                      )}
                      <span className="[font-variant-numeric:tabular-nums]">
                        Apply fee{" "}
                        {off > 0 && (
                          <span className="text-stone-400 line-through">
                            {baseStr}
                          </span>
                        )}{" "}
                        {feeStr}
                      </span>
                    </span>
                  </div>

                  {j.issue_description ? (
                    <p className="text-sm text-stone-600">
                      {j.issue_description}
                    </p>
                  ) : (
                    <p className="text-sm italic text-stone-400">
                      No details provided yet
                    </p>
                  )}
                  {(chips.length > 0 || budgetLabel) && (
                    <div className="flex flex-wrap gap-1">
                      {budgetLabel && (
                        <span className="chip bg-stone-100 text-stone-600">
                          Budget: {budgetLabel}
                        </span>
                      )}
                      {chips.map((c) => (
                        <span
                          key={c}
                          className="chip bg-stone-100 text-stone-600"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-4 text-xs text-stone-500">
                    {postedAgo(j.created_at) && (
                      <span className="text-xs text-stone-400">
                        {postedAgo(j.created_at)}
                      </span>
                    )}
                    {j.timing && (
                      <span>Timing: {labelFor(TIMING_OPTIONS, j.timing)}</span>
                    )}
                    <span>
                      {spots} of {MAX_APPLICANTS_PER_JOB} spots taken
                    </span>
                  </div>

                  {full ? (
                    <p className="rounded-lg border border-stone-200 bg-stone-100 px-3 py-2 text-center text-sm font-medium text-stone-400">
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
          <h2 className="text-2xl font-semibold text-stone-900">
            Your jobs <span className="text-stone-400">({assigned.length})</span>
          </h2>
          <p className="text-sm text-stone-500">
            Jobs a homeowner chose you for. Their contact is unlocked and you can
            message them.
          </p>
        </div>

        {assigned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
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
            <h2 className="text-lg font-semibold text-stone-900">
              Pending applications{" "}
              <span className="text-stone-400">({pendingApps.length})</span>
            </h2>
            <p className="text-xs text-stone-400">
              Ghost protection: if the homeowner doesn't respond within 7 days,
              your fee comes back automatically.
            </p>
          </div>
          <ul className="space-y-2">
            {pendingApps.map((a) => (
              <li
                key={a.application_id}
                className="card flex items-center justify-between gap-3"
              >
                <div>
                  <span className="flex items-center gap-2 font-medium text-stone-900">
                    <span className="icon-chip">
                      {iconFor(JOB_CATEGORIES, a.category)}
                    </span>{" "}
                    {labelFor(JOB_CATEGORIES, a.category)}
                  </span>
                  {a.issue_description && (
                    <p className="text-sm text-stone-500">
                      {a.issue_description}
                    </p>
                  )}
                </div>
                {a.refunded_at ? (
                  <span className="chip shrink-0 border border-green-200 bg-green-50 text-green-700">
                    Fee returned
                  </span>
                ) : (
                  <span className="chip shrink-0 border border-amber-200 bg-amber-50 text-amber-700">
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
          <h2 className="text-lg font-semibold text-stone-900">
            Not selected{" "}
            <span className="text-stone-400">({declinedApps.length})</span>
          </h2>
          <ul className="space-y-2">
            {declinedApps.map((a) => (
              <li
                key={a.application_id}
                className="card flex items-center justify-between gap-3 opacity-70"
              >
                <span className="flex items-center gap-2 font-medium text-stone-700">
                  <span className="icon-chip">
                    {iconFor(JOB_CATEGORIES, a.category)}
                  </span>{" "}
                  {labelFor(JOB_CATEGORIES, a.category)}
                </span>
                <span className="chip shrink-0 border border-stone-200 bg-stone-100 text-stone-500">
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
        <span className="flex items-center gap-2 font-medium text-stone-900">
          <span className="icon-chip">
            {iconFor(JOB_CATEGORIES, l.category)}
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
        <p className="text-sm text-stone-600">{l.issue_description}</p>
      ) : (
        <p className="text-sm italic text-stone-400">No details provided yet</p>
      )}

      <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
        <p>
          <span className="text-stone-400">Homeowner:</span>{" "}
          {l.homeowner_name || "-"}
        </p>
        <p>
          <span className="text-stone-400">Address:</span>{" "}
          {l.property_address || "-"}
        </p>
        <p>
          <span className="text-stone-400">Contact:</span>{" "}
          {l.homeowner_email || "-"}
          {l.homeowner_phone ? ` · ${l.homeowner_phone}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <OpenChatButton
          leadId={l.id}
          name={l.homeowner_name || "Homeowner"}
          label="💬 Message"
        />
        <JobStatusSelect id={l.id} status={l.status} />
      </div>
    </li>
  );
}
