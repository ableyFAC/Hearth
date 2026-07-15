import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import {
  hasProPlan,
  getProSubscription,
  getBillingOutlook,
} from "@/lib/subscription";
import {
  PRO_PLAN,
  PRO_DEPOSIT_BOOST_PTS,
  COLD_START_FREE_ALERTS,
} from "@/lib/constants";
import {
  manageProBillingAction,
  cancelProMembershipAction,
  resumeProMembershipAction,
} from "./actions";
import ProPlanToggle from "./ProPlanToggle";
import ConfirmSubmit from "@/components/ConfirmSubmit";

// The perk lineup, used by both the pitch and the welcome screen. Membership
// is perks only: it never changes which jobs a pro can see or apply to.
// Ordered exclusive economics first (credit, deposit boost, AI back office);
// alerts sit last while COLD_START_FREE_ALERTS makes them free for everyone.
const PERKS: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: "🎁",
    title: "$10 lead credit every month",
    // Mirrors grant_membership_credit in the Stripe webhook: monthly grants
    // are $10 with a 60-day expiry, yearly is $120 up front with a 400-day
    // expiry (it outlives the year). Keep this copy in sync with those terms.
    body: "Each monthly billing cycle drops $10 of bonus lead credit into your wallet, good for 60 days from the day it lands. On the yearly plan the whole $120 lands up front and stays spendable for your entire year.",
  },
  {
    icon: "💰",
    title: `+${PRO_DEPOSIT_BOOST_PTS}% on every deposit`,
    body: `Every wallet deposit earns an extra ${PRO_DEPOSIT_BOOST_PTS} percentage points of bonus credit, on top of the regular tier bonus.`,
  },
  {
    icon: "🤖",
    title: "AI back office",
    // The 250 mirrors DAILY_LIMIT_PLUS in src/lib/aiUsage.ts: the shared
    // per-user daily cap on every AI route. Keep the two in sync.
    body: "Draft estimates, invoices, and follow-up messages in seconds, up to 250 drafts a day, so evenings go back to being evenings.",
  },
  {
    icon: "🌐",
    title: "A richer public page",
    body: "Every pro already gets a public page with their services, reviews, and contact info. Pro adds your logo, work photos, and an about section so it looks fully yours. Send one link instead of ten screenshots.",
  },
  {
    icon: "📊",
    title: "Win-rate analytics",
    body: "See which jobs you win, what each lead really costs, and where your money works hardest.",
  },
  {
    icon: "⚡",
    title: "Instant job alerts",
    // COLD START: while COLD_START_FREE_ALERTS is on, every pro gets these
    // alerts, so the perk says so honestly. The parenthetical drops when the
    // flag flips back to members-only.
    body:
      "The moment a job posts in your trades and area, it hits your email and your phone. Be the first name the homeowner sees." +
      (COLD_START_FREE_ALERTS
        ? " (Included for every pro right now while Hearth is new.)"
        : ""),
  },
];

export default async function ProPlusPage({
  searchParams,
}: {
  searchParams: { welcome?: string };
}) {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  // The Pro-side row specifically: with two memberships per account possible
  // (0036), the homeowner Plus row must never drive this page's billing UI.
  const [member, sub] = await Promise.all([hasProPlan(), getProSubscription()]);

  // One-time confirmation right after checkout. Shown off the ?welcome=1 flag
  // so it appears even if the Stripe webhook hasn't synced the subscription yet.
  if (searchParams.welcome === "1") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-6 text-center">
        <div className="text-6xl">🎉</div>
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
            You&apos;re a Hearth Pro member
          </h1>
          <p className="mt-2 text-stone-600 dark:text-stone-300">
            Your perks are switching on now. Here&apos;s what you just added to
            your toolbox:
          </p>
        </div>
        <ul className="mx-auto max-w-md space-y-2 text-left">
          {PERKS.map((p) => (
            <li key={p.title} className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300">
              <span className="mt-0.5">{p.icon}</span>
              <span>
                <span className="font-medium text-stone-900 dark:text-stone-100">{p.title}.</span>{" "}
                {p.body}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-center gap-3">
          <Link href="/pro" className="btn-primary">
            Back to my leads
          </Link>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            If a perk still looks off, give it a minute to sync, then refresh.
          </p>
        </div>
      </div>
    );
  }

  if (member) {
    const { cancelsAt } = await getBillingOutlook(sub);
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Hearth Pro</h1>
        </div>
        <div className="card space-y-4 text-center">
          <p className="text-lg font-medium text-hearth-700 dark:text-hearth-300">
            You&apos;re a Hearth Pro member
          </p>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            {sub?.plan === "pro_yearly" ? "Yearly" : "Monthly"} plan
            {sub?.current_period_end
              ? ` · renews ${new Date(sub.current_period_end).toLocaleDateString()}`
              : ""}
          </p>
          <form action={manageProBillingAction}>
            <button className="btn-secondary">Manage billing</button>
          </form>
          {sub?.stripe_subscription_id && cancelsAt && (
            <div className="space-y-2 border-t border-stone-100 pt-4 dark:border-white/10">
              <p className="text-sm text-stone-600 dark:text-stone-300">
                Your membership ends on {cancelsAt.toLocaleDateString()}. You
                keep every perk until then, and your lead access never changes.
              </p>
              <form action={resumeProMembershipAction}>
                <button className="btn-secondary">Keep my membership</button>
              </form>
            </div>
          )}
          {sub?.stripe_subscription_id && !cancelsAt && (
            <div className="border-t border-stone-100 pt-4 dark:border-white/10">
              <form action={cancelProMembershipAction}>
                <ConfirmSubmit
                  subtle
                  label="Cancel membership"
                  note="You'd keep every perk through the time you've paid for, and it just won't renew. Your lead access stays exactly the same. Cancel?"
                  yesLabel="Yes, cancel my membership"
                />
              </form>
            </div>
          )}
        </div>
        <div className="card">
          <p className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
            Your member perks
          </p>
          <ul className="space-y-2">
            {PERKS.map((p) => (
              <li
                key={p.title}
                className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300"
              >
                <span className="mt-0.5 font-bold text-green-600 dark:text-green-400">✓</span>
                <span>
                  <span className="font-medium text-stone-900 dark:text-stone-100">{p.title}.</span>{" "}
                  {p.body}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-center text-xs text-stone-500 dark:text-stone-400">
          Membership never changes which jobs you can see or apply to. Leads
          stay pay-per-apply for everyone.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-semibold text-stone-900 dark:text-stone-100">
          Run your business, not your admin
        </h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Hearth Pro is a toolkit for the business side: faster alerts, more
          credit on every deposit, and an AI back office that handles the
          paperwork.
        </p>
        <div className="mt-5">
          <a href="#pricing" className="btn-primary">
            Start my Pro membership
          </a>
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            First month ${PRO_PLAN.introFirstMonth}, then ${PRO_PLAN.monthly}
            /month after, cancel anytime. Or ${PRO_PLAN.yearly}/year, save $
            {Math.round(PRO_PLAN.monthly * 12 - PRO_PLAN.yearly)} vs monthly.
          </p>
        </div>
      </div>

      {/* The straight answer, up front: membership never touches lead access. */}
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-center text-sm text-stone-600 dark:border-white/10 dark:bg-stone-800 dark:text-stone-300">
        Membership never changes which jobs you can see or apply to. Every job
        stays open to every pro, pay per application, member or not.
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        {PERKS.map((p) => (
          <div key={p.title} className="card">
            <div className="icon-chip">{p.icon}</div>
            <h2 className="mt-2 font-semibold text-stone-900 dark:text-stone-100">{p.title}</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{p.body}</p>
          </div>
        ))}
      </section>

      <ProPlanToggle />

      <p className="text-center text-xs text-stone-500 dark:text-stone-400">
        Questions about billing?{" "}
        <Link href="/pro/billing" className="hover:underline">
          Visit billing
        </Link>
        .
      </p>
    </div>
  );
}
