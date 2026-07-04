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
import ConfirmSubmit from "./ConfirmSubmit";

const COMPARISON: Array<{ label: string; free: string; plus: string }> = [
  { label: "Open job postings", free: "3 at a time", plus: "Unlimited" },
  { label: "Matching to pros", free: "Standard", plus: "Priority" },
  { label: "Home tracking & document vault", free: "Included", plus: "Included" },
  { label: "Homes you can track", free: "1 home", plus: "Up to 5 homes" },
  { label: "Maintenance plan", free: "-", plus: "Auto-built for your home" },
  { label: "Cost forecast & repair fund", free: "-", plus: "10-year outlook" },
  { label: "AI quote analyzer", free: "-", plus: "Included" },
  { label: "Home report for resale & insurance", free: "-", plus: "Included" },
  { label: "Proactive alerts", free: "In-app", plus: "All alerts, every channel" },
];

export default async function PlusPage({
  searchParams,
}: {
  searchParams: { reason?: string; welcome?: string };
}) {
  const [plus, sub] = await Promise.all([hasPlus(), getSubscription()]);

  // One-time celebration right after checkout. Shown off the ?welcome=1 flag so
  // it appears even if the Stripe webhook hasn't synced the subscription yet.
  if (searchParams.welcome === "1") {
    return <PlusWelcome />;
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
      "AI quote analyzer",
      "Home report for resale and insurance",
      "Up to 5 homes",
      "A maintenance plan auto-built for your home",
      "Every proactive alert",
    ];
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-stone-900">Hearth Plus</h1>
        </div>
        <div className="card space-y-4 text-center">
          <p className="text-lg font-medium text-hearth-700">
            You&apos;re on Hearth Plus
          </p>
          <p className="text-sm text-stone-500">
            {sub?.plan === "yearly" ? "Yearly" : "Monthly"} plan
            {sub?.current_period_end
              ? ` · renews ${new Date(sub.current_period_end).toLocaleDateString()}`
              : ""}
          </p>
          <form action={manageBillingAction}>
            <button className="btn-secondary">Manage billing</button>
          </form>
          {sub?.stripe_subscription_id && cancelsAt && (
            <div className="space-y-2 border-t border-stone-100 pt-4">
              <p className="text-sm text-stone-600">
                Your membership ends on {cancelsAt.toLocaleDateString()}. You
                keep every Plus benefit until then.
              </p>
              <form action={resumeMembershipAction}>
                <button className="btn-secondary">Keep my membership</button>
              </form>
            </div>
          )}
          {sub?.stripe_subscription_id && !cancelsAt && (
            <div className="space-y-2 border-t border-stone-100 pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
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
                  <p className="text-xs text-stone-400">
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
                  <p className="text-xs text-stone-400">
                    You keep every Plus benefit through {renewsOn}. Monthly
                    billing starts after that, so you lose nothing you paid for.
                  </p>
                </>
              )}
              {sub.plan === "yearly" && scheduledDowngrade && (
                <>
                  <p className="text-sm text-stone-600">
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
          <p className="mb-3 text-sm font-semibold text-stone-900">
            Everything you have
          </p>
          <ul className="space-y-2">
            {included.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-sm text-stone-700"
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

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {searchParams.reason === "job_limit" && (
        <div className="card border-hearth-200 bg-hearth-50 text-center">
          <p className="text-sm text-hearth-800">
            You&apos;ve used all 3 of your free job posts. Hearth Plus lets you
            post unlimited jobs and keeps the quotes rolling.
          </p>
        </div>
      )}

      {searchParams.reason === "home_limit" && (
        <div className="card border-hearth-200 bg-hearth-50 text-center">
          <p className="text-sm text-hearth-800">
            You&apos;ve added your free home. Hearth Plus lets you manage up
            to 5 homes in one place.
          </p>
        </div>
      )}

      {searchParams.reason === "plan" && (
        <div className="card border-hearth-200 bg-hearth-50 text-center">
          <p className="text-sm text-hearth-800">
            Hearth Plus builds a maintenance plan tuned to your home&apos;s
            systems, a few tasks at a time so it never piles up.
          </p>
        </div>
      )}

      {searchParams.reason === "forecast" && (
        <div className="card border-hearth-200 bg-hearth-50 text-center">
          <p className="text-sm text-hearth-800">
            Hearth Plus forecasts what your home will need over the next 10
            years and the amount to set aside each month, so a big repair is a
            plan, not a panic.
          </p>
        </div>
      )}

      {searchParams.reason === "quote" && (
        <div className="card border-hearth-200 bg-hearth-50 text-center">
          <p className="text-sm text-hearth-800">
            You&apos;ve used your free quote check. Plus reads every quote you
            get, flags padding, and writes the negotiation message, unlimited.
          </p>
        </div>
      )}

      {searchParams.reason === "report" && (
        <div className="card border-hearth-200 bg-hearth-50 text-center">
          <p className="text-sm text-hearth-800">
            Hearth Plus builds a shareable home report of your systems,
            documents, and upkeep history, ready for insurers or buyers.
          </p>
        </div>
      )}

      <div className="text-center">
        <h1 className="text-3xl font-semibold text-stone-900">
          Get your home fixed faster
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Line up vetted pros, on your terms. Post more jobs at once, get
          matched first, and keep every proactive alert working for you.
        </p>
        <div className="mt-5">
          <a href="#pricing" className="btn-primary">
            Start my Plus plan
          </a>
          <p className="mt-2 text-xs text-stone-400">
            Cancel anytime. No commitment.
          </p>
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className="px-4 py-3 font-medium"> </th>
              <th className="px-4 py-3 font-medium">Free</th>
              <th className="px-4 py-3 font-medium text-hearth-700">
                Hearth Plus
              </th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.label} className="border-b border-stone-100 last:border-0">
                <td className="px-4 py-3 text-stone-700">{row.label}</td>
                <td className="px-4 py-3 text-stone-500">{row.free}</td>
                <td className="px-4 py-3 font-medium text-hearth-700">
                  {row.plus}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PlanToggle />

      <p className="text-center text-xs text-stone-400">
        Questions?{" "}
        <Link href="/account/help" className="hover:underline">
          Visit help
        </Link>
        .
      </p>
    </div>
  );
}
