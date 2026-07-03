import Link from "next/link";
import { hasPlus, getSubscription } from "@/lib/subscription";
import { manageBillingAction } from "./actions";
import PlanToggle from "./PlanToggle";

const COMPARISON: Array<{ label: string; free: string; plus: string }> = [
  { label: "Open job postings", free: "1 at a time", plus: "Up to 10 at once" },
  { label: "Matching to pros", free: "Standard", plus: "Priority" },
  { label: "Home tracking & document vault", free: "Included", plus: "Included" },
  { label: "Homes", free: "1", plus: "Up to 5" },
  { label: "Maintenance plan", free: "-", plus: "Full year, auto-built" },
  { label: "Cost forecast & repair fund", free: "-", plus: "10-year outlook" },
  { label: "AI quote analyzer", free: "-", plus: "Included" },
  { label: "Home report for resale & insurance", free: "-", plus: "Included" },
  { label: "Proactive alerts", free: "In-app", plus: "All alerts, every channel" },
];

export default async function PlusPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const [plus, sub] = await Promise.all([hasPlus(), getSubscription()]);

  if (plus) {
    return (
      <div className="mx-auto max-w-2xl space-y-8">
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
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {searchParams.reason === "job_limit" && (
        <div className="card border-hearth-200 bg-hearth-50 text-center">
          <p className="text-sm text-hearth-800">
            You&apos;ve used your 1 free job posting. Hearth Plus lets you post
            up to 10 jobs at once and get quotes rolling.
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
            Hearth Plus builds a full year of maintenance reminders for your
            home, automatically.
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
            Hearth Plus reads a contractor&apos;s quote, checks it against fair
            prices, and flags anything padded, so you never overpay.
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
