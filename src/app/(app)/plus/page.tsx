import { hasPlus, getSubscription } from "@/lib/subscription";
import { startPlusCheckoutAction, manageBillingAction } from "./actions";

const PERKS = [
  "Post unlimited jobs and get quotes from vetted local pros",
  "Priority matching, your jobs surface to pros first",
  "All proactive alerts (weather, recalls, maintenance) at every tier",
];

export default async function PlusPage() {
  const [plus, sub] = await Promise.all([hasPlus(), getSubscription()]);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-stone-900">Hearth Plus</h1>
        <p className="mt-1 text-sm text-stone-500">
          Home tracking, AI chat, your document vault, and alerts are always
          free. Hearth Plus unlocks finding a pro.
        </p>
      </div>

      {plus ? (
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
        </div>
      ) : (
        <>
          <div className="card">
            <ul className="space-y-2 text-sm text-stone-700">
              {PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-2">
                  <span className="text-hearth-600">✓</span>
                  <span>{perk}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <form
              action={startPlusCheckoutAction}
              className="card flex flex-col items-center gap-2 text-center"
            >
              <input type="hidden" name="plan" value="monthly" />
              <p className="text-sm font-medium text-stone-500">Monthly</p>
              <p className="text-3xl font-semibold text-stone-900">
                $9<span className="text-base font-normal text-stone-500">/mo</span>
              </p>
              <button className="btn-primary mt-2 w-full">
                Get Hearth Plus
              </button>
            </form>

            <form
              action={startPlusCheckoutAction}
              className="card relative flex flex-col items-center gap-2 text-center border-hearth-500"
            >
              <span className="absolute -top-3 rounded-full bg-hearth-600 px-2 py-0.5 text-xs font-medium text-white">
                Save ~45%
              </span>
              <input type="hidden" name="plan" value="yearly" />
              <p className="text-sm font-medium text-stone-500">Yearly</p>
              <p className="text-3xl font-semibold text-stone-900">
                $59<span className="text-base font-normal text-stone-500">/yr</span>
              </p>
              <button className="btn-primary mt-2 w-full">
                Get Hearth Plus
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
