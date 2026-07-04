import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { hasPlus } from "@/lib/subscription";
import { buildForecast, stateName } from "@/lib/forecast";
import { labelFor, iconFor, SYSTEM_TYPES, categoryForSystem } from "@/lib/constants";
import AskHearthPlanButton from "./AskHearthPlanButton";

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

// Compact form for the bar chart labels ($1.2k instead of $1,200) so a decade
// of bars stays readable on a phone screen.
function moneyShort(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `$${Math.round(n)}`;
}

export default async function ForecastPage() {
  if (!(await hasPlus())) redirect("/plus?reason=forecast");

  const property = (await getActiveProperty())!;
  const supabase = createClient();

  const { data: systems } = await supabase
    .from("home_systems")
    .select("*")
    .eq("property_id", property.id)
    .order("created_at", { ascending: true });

  const sys = systems ?? [];
  const currentYear = new Date(Date.now()).getFullYear();
  const forecast = sys.length > 0 ? buildForecast(sys, currentYear, property.state) : null;
  const region = stateName(property.state);

  // Personalize the handoff into Ask Hearth with the owner's actual top
  // priorities, not a generic prompt, so the answer is about their home.
  const planQuestion =
    forecast && forecast.startHere.length > 0
      ? `Help me plan for these upcoming home costs: ${forecast.startHere
          .map((p) => labelFor(SYSTEM_TYPES, p.item.system_type))
          .join(", ")}. Which should I tackle first?`
      : "Help me plan for my upcoming home costs. Which should I tackle first?";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-1">
        <h1 className="text-2xl font-semibold text-stone-900">
          Home cost forecast
        </h1>
      </header>
      <p className="mb-5 text-sm text-stone-500">
        83% of homeowners hit an unexpected repair last year, and most
        couldn't cover a $5,000 emergency. Here is what your home's systems
        are likely to need over the next {forecast?.horizonYears ?? 10} years,
        and how much to set aside so it never catches you off guard.
      </p>

      {!forecast && (
        <div className="card space-y-3 text-center">
          <p className="text-sm text-stone-600">
            Add your home's systems to see a cost forecast and a recommended
            monthly set-aside amount.
          </p>
          <Link href="/profile" className="btn-primary inline-block">
            Add my systems
          </Link>
        </div>
      )}

      {forecast && (
        <>
          <div className="card bg-hearth-50 border-hearth-200 space-y-2 text-center">
            <p className="text-sm text-hearth-800">
              Over the next {forecast.horizonYears} years, plan for about{" "}
              <span className="font-semibold">
                {money(forecast.totalMidCost)}
              </span>
            </p>
            <p className="text-3xl font-semibold text-hearth-800">
              Set aside about {money(forecast.monthlySetAside)}/month
            </p>
            <p className="text-xs text-hearth-700">
              So a big repair is a plan, not a panic.
            </p>
            <p className="text-xs text-hearth-600">
              Adjusted for {region ? `your area (${region})` : "your area"},
              and for future prices, not just today's.
            </p>
          </div>

          <div className="mt-4 flex justify-center">
            <AskHearthPlanButton question={planQuestion} />
          </div>

          {forecast.startHere.length > 0 && (
            <div className="card mt-6 space-y-3">
              <h2 className="text-sm font-semibold text-stone-900">
                Start here
              </h2>
              <div className="space-y-2">
                {forecast.startHere.map(({ item, reason }) => (
                  <div
                    key={item.system.id}
                    className={`flex items-start justify-between gap-3 rounded-lg border p-3 ${
                      item.yearsLeft <= 1
                        ? "border-red-200 bg-red-50"
                        : "border-stone-200 bg-stone-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-lg">
                        {iconFor(SYSTEM_TYPES, item.system_type)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-stone-900">
                          {labelFor(SYSTEM_TYPES, item.system_type)}
                        </p>
                        <p className="text-xs text-stone-500">{reason}</p>
                      </div>
                    </div>
                    <Link
                      href={`/contractors?category=${categoryForSystem(item.system_type)}`}
                      className="btn-secondary shrink-0 whitespace-nowrap px-3 py-1.5 text-xs"
                    >
                      Get quotes
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card mt-6 space-y-3">
            <h2 className="text-sm font-semibold text-stone-900">
              Expected spend by year
            </h2>
            <div className="flex items-end gap-2 overflow-x-auto pb-1">
              {forecast.yearlySpend.map((y) => {
                const max = Math.max(...forecast.yearlySpend.map((x) => x.amount), 1);
                const height =
                  y.amount > 0 ? Math.max(6, Math.round((y.amount / max) * 88)) : 3;
                return (
                  <div
                    key={y.year}
                    className="flex min-w-[2.5rem] flex-col items-center gap-1"
                  >
                    <span className="text-[10px] text-stone-500">
                      {y.amount > 0 ? moneyShort(y.amount) : ""}
                    </span>
                    <div
                      className={`w-6 rounded-t ${
                        y.amount > 0 ? "bg-hearth-400" : "bg-stone-100"
                      }`}
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-[10px] text-stone-400">{y.year}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card mt-6 space-y-3">
            <h2 className="text-sm font-semibold text-stone-900">
              {forecast.horizonYears}-year timeline
            </h2>
            <div className="divide-y divide-stone-100">
              {forecast.timeline.map((item) => (
                <div
                  key={item.system.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {iconFor(SYSTEM_TYPES, item.system_type)}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        {labelFor(SYSTEM_TYPES, item.system_type)}
                      </p>
                      <p className="text-xs text-stone-400">
                        {item.yearsLeft <= 0
                          ? "Due now"
                          : `~${item.yearsLeft} year${item.yearsLeft === 1 ? "" : "s"} left`}
                        {" · "}
                        est. {item.replacementYear}
                      </p>
                      <Link
                        href={`/contractors?category=${categoryForSystem(item.system_type)}`}
                        className="text-xs font-medium text-hearth-700 hover:underline"
                      >
                        Get quotes →
                      </Link>
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-right text-sm text-stone-600">
                    <p>
                      {money(item.costLow)} - {money(item.costHigh)}
                    </p>
                    {item.replacementYear - currentYear > 1 && (
                      <p className="text-xs text-stone-400">
                        closer to ~{money(item.futureCost)} by{" "}
                        {item.replacementYear}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card mt-6 space-y-2">
            <h2 className="text-sm font-semibold text-stone-900">
              Why this matters
            </h2>
            <p className="text-sm text-stone-500">
              Big-ticket systems like roofs and HVAC do not fail on a
              schedule, but they do fail eventually. Setting aside a little
              every month, instead of scrambling for a loan or a credit card
              when a system finally gives out, turns a five-figure surprise
              into a bill you already planned for.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
