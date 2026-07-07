import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContractor, getRole } from "@/lib/contractor";
import { hasProPlan } from "@/lib/subscription";
import { buildProStats } from "@/lib/proStats";
import {
  computeResponseTimeMinutes,
  formatResponseTime,
} from "@/lib/responseTime";
import AccountPanel from "@/components/pro/AccountPanel";
import WinShareButton from "@/components/pro/WinShareButton";
import ReviewShareRow from "@/components/pro/ReviewShareRow";
import {
  labelFor,
  iconFor,
  JOB_CATEGORIES,
  GHOST_PROTECTION_DAYS,
  COLD_START_FREE_ALERTS,
} from "@/lib/constants";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function dollars(cents: number | string | null) {
  const v = Number(cents ?? 0);
  return `$${((Number.isFinite(v) ? v : 0) / 100).toFixed(2)}`;
}

// Friendly pipeline labels, matching the leads board.
const STATUS_LABEL: Record<string, string> = {
  new: "New lead",
  accepted: "Active",
  closed: "Won",
  lost: "Lost",
};

// Days until ghost protection returns this application's fee (never negative:
// once the window has passed the cron refund is imminent).
function refundDaysLeft(appliedAt: string | null | undefined): number {
  const t = new Date(appliedAt ?? "").getTime();
  if (!Number.isFinite(t)) return GHOST_PROTECTION_DAYS;
  const elapsed = (Date.now() - t) / 86_400_000;
  return Math.max(0, Math.ceil(GHOST_PROTECTION_DAYS - elapsed));
}

// "My Business": one compact cockpit for the numbers a pro actually runs on -
// win rate, spend, cost per job won - plus the wallet and what's in flight.
export default async function ProBusinessPage() {
  const contractor = await getCurrentContractor();
  if (!contractor) {
    if ((await getRole()) === null) redirect("/get-started");
    redirect("/pro/onboarding");
  }

  const supabase = createClient();

  const [
    { data: myApps },
    { data: wonData },
    { data: wallet },
    { data: reviewRows },
    isPro,
  ] = await Promise.all([
    (supabase as any).rpc("my_applications"),
    supabase
      .from("contractor_leads")
      // paid is fetched alongside status so the row below can decide
      // whether to offer a win share card using the same win definition
      // as src/app/api/win-card/[leadId]/route.tsx: paid, or accepted or
      // closed in the pipeline. The status filter keeps this list honest:
      // an assigned job that later fell through (lost) is not a win and
      // should never sit under a "Jobs won" heading.
      .select("id, category, status, paid, created_at")
      .eq("contractor_id", contractor.id)
      .in("status", ["accepted", "closed"])
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("wallets")
      .select("id, cash_balance_cents, bonus_balance_cents")
      .eq("contractor_id", contractor.id)
      .maybeSingle(),
    // Recent reviews worth sharing: same >= 4 star floor as the review-card
    // route (src/app/api/review-card/[reviewId]/route.tsx), so nothing shown
    // here ever links to a card that route would 404 on.
    supabase
      .from("reviews")
      .select("id, rating, comment, created_at")
      .eq("contractor_id", contractor.id)
      .gte("rating", 4)
      .order("created_at", { ascending: false })
      .limit(5),
    hasProPlan(),
  ]);

  const apps = (myApps ?? []) as any[];
  const won = (wonData ?? []) as any[];
  const shareableReviews = reviewRows ?? [];

  // Reply speed: median minutes from job-posted to this pro's application,
  // over their last up to 20 applications. Needs the admin client because most
  // of a pro's application history is against jobs that stayed open or went to
  // another pro, and "leads contractor select" RLS only covers leads currently
  // assigned to them - a user-scoped client can't read those leads' posted-at
  // timestamps. Only timestamps/ids are read here, nothing homeowner-facing.
  const medianReplyMinutes = await computeResponseTimeMinutes(
    createAdminClient(),
    contractor.id
  );
  const replySpeedText = formatResponseTime(medianReplyMinutes);
  // A slow median (or one too slow for formatResponseTime to say anything
  // about, per its "show nothing slow" rule) is exactly when the nudge below
  // is worth showing; a fast one gets the stat line instead.
  const showReplyNudge = medianReplyMinutes !== null && medianReplyMinutes > 60;
  // Public profile URL, same slug-preferred pattern as win-card and
  // src/app/p/[id]/page.tsx: the real slug (0043) when the pro has one, the
  // bare contractor id otherwise. Never the truncated 8-char id used for the
  // referral code above; this one has to resolve on /p/<...>.
  const proSlug = (contractor as any).slug as string | null | undefined;
  const profileUrl = `${SITE_URL}/p/${proSlug || contractor.id}`;

  const cash = Number((wallet as any)?.cash_balance_cents ?? 0);
  const bonus = Number((wallet as any)?.bonus_balance_cents ?? 0);

  // Total spent = every debit on the wallet (apply fees, lead charges). Same
  // math as the leads board's "Your results" card. Bounded so one wallet with
  // a huge ledger can't make this page fetch unbounded rows; 1000 transactions
  // is far beyond a typical pro's history.
  const { data: txnRows } = (wallet as any)?.id
    ? await (supabase as any)
        .from("wallet_transactions")
        .select("cash_delta_cents, bonus_delta_cents")
        .eq("wallet_id", (wallet as any).id)
        .limit(1000)
    : { data: [] };
  const spentCents = (txnRows ?? []).reduce((sum: number, t: any) => {
    const delta =
      Number(t.cash_delta_cents ?? 0) + Number(t.bonus_delta_cents ?? 0);
    return delta < 0 ? sum + Math.abs(delta) : sum;
  }, 0);

  const appliedCount = apps.length;
  const wonCount = apps.filter((a) => a.status === "chosen").length;
  // Win rate only means something with a few data points behind it.
  const winRate =
    appliedCount >= 3 ? Math.round((wonCount / appliedCount) * 100) : null;
  const costPerWin = wonCount > 0 ? spentCents / wonCount : null;

  // In flight: applications the homeowner hasn't answered yet.
  const pendingApps = apps.filter(
    (a) => a.status === "applied" && !a.refunded_at
  );

  // Pro perk: the deeper Insights block, computed from the rows above (no
  // extra queries). Non-members get a teaser with one real stat instead.
  const stats = isPro ? buildProStats(apps, new Date()) : null;
  const trendMax = stats
    ? Math.max(...stats.trend.map((m) => m.applications), 1)
    : 1;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">My Business</h1>
        <p className="mt-1 text-sm text-stone-500">
          Your numbers, your wallet, and everything in flight.
        </p>
        <p className="mt-1 text-xs text-stone-400">
          78% of homeowners go with the first pro to respond. Fast replies win
          jobs.
        </p>
        {(replySpeedText || showReplyNudge) && (
          <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
            {replySpeedText && (
              <p className="text-sm font-medium text-stone-900">
                {replySpeedText}
              </p>
            )}
            <p className="text-xs text-stone-500">
              Jobs go to the first responder far more often than not.
            </p>
            {showReplyNudge && (
              <p className="mt-1 text-xs text-amber-700">
                {COLD_START_FREE_ALERTS || isPro ? (
                  "You already get instant alerts the moment a matching job posts, open Hearth as soon as one comes in to keep that edge."
                ) : (
                  <>
                    Turn on instant job alerts with a{" "}
                    <Link
                      href="/pro/plus"
                      className="font-medium underline"
                    >
                      Hearth Pro membership
                    </Link>{" "}
                    so you see new jobs the moment they post.
                  </>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      {/* The three numbers a lead-buying business runs on. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="stat-label">Win rate</p>
          <p className="stat-number mt-1 text-2xl text-stone-900">
            {winRate !== null ? `${winRate}%` : "-"}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            {winRate !== null
              ? `${wonCount} won of ${appliedCount} applications`
              : "Shows after 3 applications"}
          </p>
        </div>
        <div className="card">
          <p className="stat-label">Spent on applications</p>
          <p className="stat-number mt-1 text-2xl text-stone-900">
            {dollars(spentCents)}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            Ghost-protection refunds already added back
          </p>
        </div>
        <div className="card">
          <p className="stat-label">Cost per job won</p>
          <p className="stat-number mt-1 text-2xl text-stone-900">
            {costPerWin !== null ? dollars(costPerWin) : "-"}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            {costPerWin !== null
              ? "Total spend divided by wins"
              : "Shows after your first win"}
          </p>
        </div>
      </section>

      {/* Wallet snapshot - the full ledger lives on Billing. */}
      <section className="card-hero flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="stat-label">Wallet</p>
          <p className="stat-number mt-1 text-4xl text-stone-900">
            {dollars(cash + bonus)}
          </p>
          <p className="text-xs text-stone-400 [font-variant-numeric:tabular-nums]">
            {dollars(cash)} cash · {dollars(bonus)} bonus credit
          </p>
        </div>
        <Link href="/pro/billing" className="btn-secondary shrink-0 text-sm">
          Add funds
        </Link>
      </section>

      {/* Account: referral code and the license/insurance compliance
          calendar, folded into one collapsed-by-default panel. The code is
          the pro's public slug when the 0043 migration has run, else the
          first 8 chars of their id (both resolve at onboarding); the
          compliance dates come off migration 0051 columns (insurance_expires
          itself is the older 0033 column). */}
      <AccountPanel
        referralCode={
          ((contractor as any).slug as string | null | undefined) ||
          contractor.id.slice(0, 8)
        }
        license={{
          expires: contractor.license_expires ?? null,
          docPath: contractor.license_doc_path ?? null,
        }}
        insurance={{
          expires: (contractor as any).insurance_expires ?? null,
          docPath: contractor.insurance_doc_path ?? null,
        }}
      />

      {/* Insights: the Pro membership's deeper analytics, computed entirely
          from the application rows fetched above. Non-members see the frame
          with masked tiles and one real number as a teaser. */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">
            Insights{" "}
            <span className="chip ml-1 bg-hearth-100 align-middle text-hearth-800">
              Pro
            </span>
          </h2>
          <p className="text-xs text-stone-400">
            Where your application budget is actually earning its keep.
          </p>
        </div>

        {stats ? (
          <div className="space-y-4">
            {/* Headline tiles: the three numbers that say whether buying
                leads is working. */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="card">
                <p className="stat-label">All-time win rate</p>
                <p className="stat-number mt-1 text-2xl text-stone-900">
                  {stats.winRatePercent !== null
                    ? `${stats.winRatePercent}%`
                    : "-"}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  {stats.winRatePercent !== null
                    ? `${stats.wins} won of ${stats.liveApplications} paid applications`
                    : "Apply to a job to start tracking"}
                </p>
              </div>
              <div className="card">
                <p className="stat-label">Return on fees</p>
                <p className="stat-number mt-1 text-2xl text-stone-900">
                  {stats.roiPercent !== null
                    ? `${stats.roiPercent >= 0 ? "+" : ""}${stats.roiPercent}%`
                    : "-"}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  {stats.roiPercent !== null
                    ? `${dollars(Math.abs(stats.netCents))} ${
                        stats.netCents >= 0 ? "ahead of" : "behind"
                      } your fees`
                    : "Shows after your first paid application"}
                </p>
              </div>
              <div className="card">
                <p className="stat-label">Fees vs revenue</p>
                <p className="stat-number mt-1 text-2xl text-stone-900">
                  {dollars(stats.revenueWonCents)}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  won on {dollars(stats.feesSpentCents)} in fees, net of
                  refunds
                </p>
              </div>
            </div>

            <p className="text-xs text-stone-400">
              {stats.daysSinceLastApplication !== null
                ? `Last application ${
                    stats.daysSinceLastApplication === 0
                      ? "today"
                      : `${stats.daysSinceLastApplication} day${
                          stats.daysSinceLastApplication === 1 ? "" : "s"
                        } ago`
                  }`
                : "No applications yet"}
              {" · "}
              {stats.daysSinceLastWin !== null
                ? `last win ${
                    stats.daysSinceLastWin === 0
                      ? "today"
                      : `${stats.daysSinceLastWin} day${
                          stats.daysSinceLastWin === 1 ? "" : "s"
                        } ago`
                  }`
                : "no wins yet"}
            </p>

            {/* Where the wins come from, category by category. */}
            {stats.categories.length > 0 && (
              <div className="card overflow-x-auto">
                <p className="mb-2 text-sm font-medium text-stone-500">
                  By category
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-stone-400">
                      <th className="pb-2 pr-3 font-medium">Category</th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        Apps
                      </th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        Wins
                      </th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        Win rate
                      </th>
                      <th className="pb-2 text-right font-medium">Avg fee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {stats.categories.map((c) => (
                      <tr key={c.category}>
                        <td className="py-2 pr-3 font-medium text-stone-900">
                          {iconFor(JOB_CATEGORIES, c.category)}{" "}
                          {labelFor(JOB_CATEGORIES, c.category)}
                        </td>
                        <td className="py-2 pr-3 text-right text-stone-600">
                          {c.applications}
                        </td>
                        <td className="py-2 pr-3 text-right text-stone-600">
                          {c.wins}
                        </td>
                        <td className="py-2 pr-3 text-right text-stone-600">
                          {c.winRatePercent !== null
                            ? `${c.winRatePercent}%`
                            : "-"}
                        </td>
                        <td className="py-2 text-right text-stone-600">
                          {c.avgFeeCents !== null
                            ? dollars(c.avgFeeCents)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Six-month rhythm: applications in, wins out. */}
            <div className="card space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-stone-500">
                  Last 6 months
                </p>
                <p className="flex items-center gap-3 text-[10px] text-stone-400">
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-sm bg-gradient-to-t from-hearth-500 to-hearth-400" />
                    Applications
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-2 rounded-sm bg-stone-300" />
                    Wins
                  </span>
                </p>
              </div>
              <div className="overflow-x-auto pb-1">
                <div className="flex items-end gap-2 border-b border-stone-200">
                  {stats.trend.map((m, i) => {
                    const appHeight =
                      m.applications > 0
                        ? Math.max(
                            6,
                            Math.round((m.applications / trendMax) * 96)
                          )
                        : 3;
                    const winHeight =
                      m.wins > 0
                        ? Math.max(6, Math.round((m.wins / trendMax) * 96))
                        : 3;
                    const isCurrent = i === stats.trend.length - 1;
                    return (
                      <div
                        key={m.key}
                        title={`${m.label}: ${m.applications} application${
                          m.applications === 1 ? "" : "s"
                        }, ${m.wins} won`}
                        className="flex min-w-[2.5rem] flex-col items-center gap-1 transition hover:opacity-90"
                      >
                        <span className="text-[10px] text-stone-500">
                          {m.applications > 0 ? m.applications : ""}
                        </span>
                        <div className="flex items-end gap-0.5">
                          <div
                            className={`w-3 rounded-t-md ${
                              m.applications > 0
                                ? isCurrent
                                  ? "bg-gradient-to-t from-hearth-600 to-hearth-500"
                                  : "bg-gradient-to-t from-hearth-500 to-hearth-400"
                                : "bg-stone-100"
                            }`}
                            style={{ height: `${appHeight}px` }}
                          />
                          <div
                            className={`w-3 rounded-t-md ${
                              m.wins > 0 ? "bg-stone-300" : "bg-stone-100"
                            }`}
                            style={{ height: `${winHeight}px` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1 flex gap-2">
                  {stats.trend.map((m) => (
                    <span
                      key={m.key}
                      className="min-w-[2.5rem] text-center text-[10px] text-stone-400"
                    >
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Teaser: one real number, the rest masked. Placeholder values
                are decorative, so they are hidden from screen readers. */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="card">
                <p className="stat-label">Total applications</p>
                <p className="stat-number mt-1 text-2xl text-stone-900">
                  {appliedCount}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  All-time, refunds included
                </p>
              </div>
              <div className="card ring-1 ring-hearth-200">
                <p className="stat-label">All-time win rate</p>
                <p
                  aria-hidden="true"
                  className="stat-number mt-1 select-none text-2xl text-stone-300 blur-[3px]"
                >
                  --%
                </p>
                <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-stone-400">
                  <span aria-hidden="true" className="icon-chip">
                    🔒
                  </span>
                  Included with Hearth Pro
                </p>
              </div>
              <div className="card ring-1 ring-hearth-200">
                <p className="stat-label">Fees vs revenue</p>
                <p
                  aria-hidden="true"
                  className="stat-number mt-1 select-none text-2xl text-stone-300 blur-[3px]"
                >
                  $-,---
                </p>
                <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-stone-400">
                  <span aria-hidden="true" className="icon-chip">
                    🔒
                  </span>
                  Included with Hearth Pro
                </p>
              </div>
            </div>
            <p className="text-sm text-stone-500">
              Your win rate, return on fees, and best-performing categories
              decide where your next application dollar goes.{" "}
              <Link
                href="/pro/plus"
                className="font-medium text-hearth-700 hover:underline"
              >
                Unlock Insights with Hearth Pro
              </Link>
              .
            </p>
          </div>
        )}
      </section>

      {/* In flight: applications waiting on a homeowner, with the refund clock. */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">
            Pending applications{" "}
            <span className="text-stone-400">({pendingApps.length})</span>
          </h2>
          <p className="text-xs text-stone-400">
            Ghost protection: a fee comes back automatically if the homeowner
            never responds.
          </p>
        </div>
        {pendingApps.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            Nothing in flight.{" "}
            <Link
              href="/pro"
              className="font-medium text-hearth-700 hover:underline"
            >
              Browse open jobs
            </Link>{" "}
            and apply while they&apos;re fresh: new postings close best.
          </p>
        ) : (
          <ul className="space-y-2">
            {pendingApps.map((a) => {
              const daysLeft = refundDaysLeft(a.applied_at);
              return (
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
                  <span className="shrink-0 text-right text-xs text-stone-400">
                    {daysLeft === 0
                      ? "Fee returns today if no response"
                      : `Fee returns in ${daysLeft} day${
                          daysLeft === 1 ? "" : "s"
                        } if no response`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recent wins - the payoff column. Share-worthy reviews fold in here
          too (id="share-reviews" is where the new-review notification
          links), rather than opening a whole new section for them. */}
      <section id="share-reviews" className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">
          Jobs won <span className="text-stone-400">({won.length})</span>
        </h2>
        {won.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No wins yet. Specific, fast replies are what turn applications into
            jobs: the{" "}
            <Link
              href="/pro/playbook"
              className="font-medium text-hearth-700 hover:underline"
            >
              Playbook
            </Link>{" "}
            has the short version.
          </p>
        ) : (
          <ul className="space-y-2">
            {won.map((l) => (
              <li
                key={l.id}
                className="card flex items-center justify-between gap-3"
              >
                <span className="flex items-center gap-2 font-medium text-stone-900">
                  <span className="icon-chip">
                    {iconFor(JOB_CATEGORIES, l.category)}
                  </span>{" "}
                  {labelFor(JOB_CATEGORIES, l.category)}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-stone-400">
                    {STATUS_LABEL[l.status] ?? l.status} ·{" "}
                    {new Date(l.created_at).toLocaleDateString()}
                  </span>
                  {/* This recent-leads query isn't filtered to won rows, so
                      the button only shows for one that actually is: paid,
                      or accepted / closed in the pipeline. */}
                  {(l.paid || l.status === "accepted" || l.status === "closed") && (
                    <WinShareButton leadId={l.id} businessName={contractor.name} />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Share your reviews: every 4 or 5 star review gets a ready-made
            card + caption. Same >= 4 star floor as review-card's own 404
            check, so nothing offered here can 404 when clicked. */}
        {shareableReviews.length > 0 && (
          <div className="border-t border-stone-100 pt-4">
            <h3 className="text-sm font-semibold text-stone-900">
              Share your reviews
            </h3>
            <p className="mt-0.5 text-xs text-stone-400">
              Turn a great review into a share card and a ready-to-post
              caption.
            </p>
            <ul className="mt-2 space-y-2">
              {shareableReviews.map((r) => (
                <ReviewShareRow
                  key={r.id}
                  reviewId={r.id}
                  rating={r.rating}
                  comment={r.comment}
                  profileUrl={profileUrl}
                />
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
