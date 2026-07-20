import Link from "next/link";
import {
  hasPlus,
  getSubscription,
  getBillingOutlook,
} from "@/lib/subscription";
import {
  manageBillingAction,
  upgradeToYearlyAction,
  downgradeToMonthlyAction,
  keepYearlyAction,
  cancelMembershipAction,
  resumeMembershipAction,
} from "./actions";
import PlanToggle from "./PlanToggle";
import PlusWelcome from "./PlusWelcome";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import {
  COLD_START_FREE_POSTING,
  COLD_START_FREE_ALERTS,
} from "@/lib/constants";

const COMPARISON: Array<{ label: string; free: string; plus: string }> = [
  // Plus-exclusive rows lead: they're the reason to upgrade.
  { label: "Maintenance plan", free: "-", plus: "Auto-built for your home" },
  { label: "Cost forecast & repair fund", free: "-", plus: "10-year outlook" },
  { label: "Quote analyzer", free: "-", plus: "Included" },
  { label: "Home report for resale & insurance", free: "-", plus: "Included" },
  // When the posting cap is on, unlimited postings are a real Plus perk, so
  // the row sits up here with the other upgrades.
  ...(COLD_START_FREE_POSTING
    ? []
    : [{ label: "Open job postings", free: "3 at a time", plus: "Unlimited" }]),
  // COLD START: while COLD_START_FREE_ALERTS is on, every pro hears about
  // every matching job instantly, so "priority matching" isn't a real perk
  // yet. The row returns when the flag flips.
  ...(COLD_START_FREE_ALERTS
    ? []
    : [{ label: "Matching to pros", free: "Standard", plus: "Priority" }]),
  { label: "Home tracking & document vault", free: "Included", plus: "Included" },
  { label: "Homes you can track", free: "1 home", plus: "Up to 5 homes" },
  { label: "Proactive alerts", free: "In-app", plus: "All alerts, every channel" },
  // COLD START: while COLD_START_FREE_POSTING is on, posting is uncapped for
  // everyone, so the row says so honestly and sits last, since it isn't a
  // selling point right now. The gated version moves back up when the flag
  // flips.
  ...(COLD_START_FREE_POSTING
    ? [
        {
          label: "Open job postings",
          free: "Unlimited while Hearth is new",
          plus: "Unlimited",
        },
      ]
    : []),
];

export default async function PlusPage({
  searchParams,
}: {
  searchParams: { reason?: string; welcome?: string };
}) {
  const [plus, sub] = await Promise.all([hasPlus(), getSubscription()]);

  // One-time celebration right after checkout. Shown off the ?welcome=1 flag so
  // it appears even if the Stripe webhook hasn't synced the subscription yet.
  // When the row HAS landed, the acknowledgment on the last step can state the
  // real plan; when it hasn't, PlusWelcome falls back to the cancellation
  // terms plus a pointer to the emailed acknowledgment. "trialing" is what the
  // free 3-day trial looks like in Stripe, so it is the step-up signal here.
  if (searchParams.welcome === "1") {
    return (
      <PlusWelcome
        plan={
          sub?.status === "canceled"
            ? undefined
            : sub?.plan === "yearly"
            ? "yearly"
            : sub?.plan === "monthly"
            ? "monthly"
            : undefined
        }
        introEligible={sub?.status === "trialing"}
      />
    );
  }

  if (plus) {
    // Pending billing changes (downgrade schedule, cancellation), read live
    // from Stripe in one call.
    const { scheduledDowngrade, cancelsAt } = await getBillingOutlook(sub);
    const renewsOn = sub?.current_period_end
      ? new Date(sub.current_period_end).toLocaleDateString()
      : "your renewal date";
    const included = [
      "Unlimited job postings, matched first",
      "Cost forecast and repair fund",
      "Quote analyzer",
      "Home report for resale and insurance",
      "Up to 5 homes",
      "A maintenance plan auto-built for your home",
      "Every proactive alert",
    ];
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Hearth Plus</h1>
        </div>
        <div className="card-hero space-y-4 text-center">
          <p className="text-lg font-medium text-bark-700 dark:text-stone-300">
            You&apos;re on Hearth Plus
          </p>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {sub?.plan === "yearly"
              ? "Yearly"
              : sub?.plan === "weekly"
              ? "Weekly"
              : "Monthly"}{" "}
            plan
            {sub?.current_period_end
              ? ` · renews ${new Date(sub.current_period_end).toLocaleDateString()}`
              : ""}
          </p>
          <form action={manageBillingAction}>
            <button className="btn-secondary">Manage billing</button>
          </form>
          {sub?.stripe_subscription_id && cancelsAt && (
            <div className="space-y-2 border-t border-stone-100 pt-4 dark:border-white/10">
              <p className="text-sm text-stone-600 dark:text-stone-300">
                Your membership ends on {cancelsAt.toLocaleDateString()}. You
                keep every Plus benefit until then.
              </p>
              <form action={resumeMembershipAction}>
                <button className="btn-secondary">Keep my membership</button>
              </form>
            </div>
          )}
          {sub?.stripe_subscription_id && !cancelsAt && (
            <div className="space-y-2 border-t border-stone-100 pt-4 dark:border-white/10">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
                Change plan
              </p>
              {sub.plan !== "yearly" && (
                <>
                  <form action={upgradeToYearlyAction}>
                    <ConfirmSubmit
                      label="Switch to yearly, $39.99/yr (save 33%)"
                      note="You'll be charged today, with your unused monthly time credited toward it. Switch to yearly?"
                      yesLabel="Yes, switch to yearly"
                    />
                  </form>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    Starts today. Unused monthly time is credited toward the
                    yearly charge.
                  </p>
                </>
              )}
              {sub.plan === "yearly" && !scheduledDowngrade && (
                <>
                  <form action={downgradeToMonthlyAction}>
                    <ConfirmSubmit
                      label="Switch to monthly at renewal"
                      note={`Nothing changes today. You keep yearly until ${renewsOn}, then it becomes $4.99/mo. Switch?`}
                      yesLabel="Yes, switch at renewal"
                    />
                  </form>
                  <p className="text-xs text-stone-500 dark:text-stone-400">
                    You keep every Plus benefit through {renewsOn}. Monthly
                    billing starts after that, so you lose nothing you paid for.
                  </p>
                </>
              )}
              {sub.plan === "yearly" && scheduledDowngrade && (
                <>
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    Switching to monthly on{" "}
                    {scheduledDowngrade.switchesAt.toLocaleDateString()}
                  </p>
                  <form action={keepYearlyAction}>
                    <button className="btn-secondary">Keep yearly</button>
                  </form>
                </>
              )}
              <form action={cancelMembershipAction} className="pt-1">
                <ConfirmSubmit
                  subtle
                  label="Cancel membership"
                  note={`You'd keep every Plus benefit through ${renewsOn}, and it just won't renew after that. Cancel?`}
                  yesLabel="Yes, cancel my membership"
                />
              </form>
            </div>
          )}
        </div>
        <div className="card">
          <p className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
            Everything you have
          </p>
          <ul className="space-y-2">
            {included.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300"
              >
                <span className="mt-0.5 font-bold text-green-600">✓</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  // A subscription that Stripe still considers live but that hasPlus() reads
  // as not-entitled (past_due, unpaid, incomplete: the card failed and Stripe
  // is retrying) used to fall straight through to the marketing pitch below,
  // leaving someone whose card is ACTIVELY being retried with no way to stop
  // the charges except email. That is exactly the "simple mechanism to stop
  // recurring charges" ROSCA requires (15 U.S.C. 8403(3)), so the cancel and
  // billing controls stay reachable whenever a cancellable subscription
  // exists, entitled or not. Canceled rows fall through: there is nothing
  // left to stop.
  if (sub?.stripe_subscription_id && sub.status !== "canceled") {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Hearth Plus
          </h1>
        </div>
        <div className="card space-y-4 text-center">
          <p className="text-sm text-stone-600 dark:text-stone-300">
            We couldn&apos;t take your last Hearth Plus payment, so your Plus
            features are paused while your bank and Stripe sort it out. Update
            your payment method to switch them back on, or cancel so nothing
            further is charged.
          </p>
          <form action={manageBillingAction}>
            <button className="btn-primary">Update payment method</button>
          </form>
          <div className="border-t border-stone-100 pt-4 dark:border-white/10">
            <form action={cancelMembershipAction}>
              <ConfirmSubmit
                subtle
                label="Cancel membership"
                note="Your membership stops renewing and nothing further is charged. Cancel?"
                yesLabel="Yes, cancel my membership"
              />
            </form>
          </div>
        </div>
        <p className="text-center text-xs text-stone-500 dark:text-stone-400">
          Questions?{" "}
          <Link href="/account/help" className="hover:underline">
            Visit help
          </Link>
          .
        </p>
      </div>
    );
  }

  // The 3-day trial is granted only when there's no existing homeowner
  // subscription row (the same signal startPlusCheckoutAction checks), so a
  // returning subscriber never sees trial copy they wouldn't get.
  const trialEligible = !sub;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* COLD START: the posting cap is off while COLD_START_FREE_POSTING is
          on, so this banner must not show even if the URL is hit directly.
          Keep it for when the flag flips back. */}
      {!COLD_START_FREE_POSTING && searchParams.reason === "job_limit" && (
        <div className="card border-bark-100 bg-bark-50 text-center dark:border-bark-700/40 dark:bg-bark-700/30">
          <p className="text-sm text-bark-700 dark:text-stone-300">
            You&apos;ve used all 3 of your free job posts. Hearth Plus lets you
            post unlimited jobs and keeps the quotes rolling.
          </p>
        </div>
      )}

      {searchParams.reason === "home_limit" && (
        <div className="card border-bark-100 bg-bark-50 text-center dark:border-bark-700/40 dark:bg-bark-700/30">
          <p className="text-sm text-bark-700 dark:text-stone-300">
            You&apos;ve added your free home. Hearth Plus lets you manage up
            to 5 homes in one place.
          </p>
        </div>
      )}

      {searchParams.reason === "plan" && (
        <div className="card border-bark-100 bg-bark-50 text-center dark:border-bark-700/40 dark:bg-bark-700/30">
          <p className="text-sm text-bark-700 dark:text-stone-300">
            Hearth Plus builds a maintenance plan tuned to your home&apos;s
            systems, a few tasks at a time so it never piles up.
          </p>
        </div>
      )}

      {searchParams.reason === "forecast" && (
        <div className="card border-bark-100 bg-bark-50 text-center dark:border-bark-700/40 dark:bg-bark-700/30">
          <p className="text-sm text-bark-700 dark:text-stone-300">
            Hearth Plus forecasts what your home will need over the next 10
            years and the amount to set aside each month, so a big repair is a
            plan, not a panic.
          </p>
        </div>
      )}

      {searchParams.reason === "quote" && (
        <div className="card border-bark-100 bg-bark-50 text-center dark:border-bark-700/40 dark:bg-bark-700/30">
          <p className="text-sm text-bark-700 dark:text-stone-300">
            You&apos;ve used your free quote check. Plus reads every quote you
            get, flags padding, and writes the negotiation message, unlimited.
          </p>
        </div>
      )}

      {searchParams.reason === "report" && (
        <div className="card border-bark-100 bg-bark-50 text-center dark:border-bark-700/40 dark:bg-bark-700/30">
          <p className="text-sm text-bark-700 dark:text-stone-300">
            Hearth Plus builds a shareable home report of your systems,
            documents, and upkeep history, ready for insurers or buyers.
          </p>
        </div>
      )}

      {searchParams.reason === "tax" && (
        <div className="card border-bark-100 bg-bark-50 text-center dark:border-bark-700/40 dark:bg-bark-700/30">
          <p className="text-sm text-bark-700 dark:text-stone-300">
            Your assessment looks high. Plus drafts the appeal letter for
            you, ready to file with your county.
          </p>
        </div>
      )}

      {searchParams.reason === "insurance" && (
        <div className="card border-bark-100 bg-bark-50 text-center dark:border-bark-700/40 dark:bg-bark-700/30">
          <p className="text-sm text-bark-700 dark:text-stone-300">
            Plus builds your requote packet: your home&apos;s facts, upkeep
            record, and the questions to ask, ready to hand to insurance
            agents so they compete for you.
          </p>
        </div>
      )}

      <div className="text-center">
        {/* Money protection, not job-posting speed: the paid tier's real value
            is knowing what's coming (forecast, quote check, plan) before it
            hits the wallet. The reason banners above add the specific pitch. */}
        <h1 className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
          Know what&apos;s coming before it costs you
        </h1>
        <p className="mt-2 text-sm font-medium text-bark-700 dark:text-stone-300">
          {trialEligible
            ? "Free for 3 days, then $4.99/mo or $39.99/yr. Cancel anytime."
            : "$1.99/wk, $4.99/mo, or $39.99/yr. Cancel anytime."}
        </p>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          {COLD_START_FREE_POSTING
            ? // COLD START: posting is uncapped for everyone right now, so the
              // pitch leans on the perks that stay exclusive.
              "Line up local pros, on your terms. Get matched first and keep every proactive alert working for you."
            : "Line up local pros, on your terms. Post more jobs at once, get matched first, and keep every proactive alert working for you."}
        </p>
        <div className="mt-5">
          {/* Label mirrors the pricing card's button exactly, so the promise
              made here is the one the button below keeps. Non-trial users
              land on the yearly plan by default (see PlanToggle). */}
          <a href="#pricing" className="btn-primary">
            {trialEligible ? "Start my 3 days free" : "See plans"}
          </a>
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            Cancel anytime. No commitment.
          </p>
        </div>
      </div>

      {/* The full comparison stays available but foldable, so the page reads
          headline -> anchor -> pricing without a wall of rows in between.
          A server component can't know the viewport, so `open` is the
          desktop-first default; phone users can collapse it. */}
      <details open className="group">
        <summary className="w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden text-sm font-semibold text-stone-900 dark:text-stone-100">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">
            ▸
          </span>
          Compare everything
        </summary>
        <div className="card mt-3 overflow-hidden p-0">
          {/* Tighter cells and smaller text below sm so all three columns fit
              a 360px viewport without horizontal scrolling. */}
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500 dark:border-stone-700 dark:text-stone-400">
                <th className="px-2 py-3 font-medium sm:px-4"> </th>
                <th className="px-2 py-3 font-medium sm:px-4">Free</th>
                <th className="px-2 py-3 font-medium text-bark-700 sm:px-4 dark:text-stone-300">
                  Hearth Plus
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-b border-stone-100 last:border-0 dark:border-white/10">
                  <td className="px-2 py-3 text-stone-700 sm:px-4 dark:text-stone-300">{row.label}</td>
                  <td className="px-2 py-3 text-stone-500 sm:px-4 dark:text-stone-400">{row.free}</td>
                  <td className="px-2 py-3 font-medium text-bark-700 sm:px-4 dark:text-stone-300">
                    {row.plus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-center text-sm text-stone-600 dark:text-stone-300">
        A year of Plus costs less than one hour of an emergency plumber.
      </p>

      <PlanToggle trialEligible={trialEligible} />

      <p className="text-center text-xs text-stone-500 dark:text-stone-400">
        Questions?{" "}
        <Link href="/account/help" className="hover:underline">
          Visit help
        </Link>
        .
      </p>
    </div>
  );
}
