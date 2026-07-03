import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { hasPlus } from "@/lib/subscription";
import { buildForecast } from "@/lib/forecast";
import { labelFor, iconFor, SYSTEM_TYPES } from "@/lib/constants";

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
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
  const forecast = sys.length > 0 ? buildForecast(sys, currentYear) : null;

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
          </div>

          {forecast.dueSoon.length > 0 && (
            <div className="card mt-6 border-red-200 bg-red-50 space-y-3">
              <h2 className="text-sm font-semibold text-red-800">
                Due now or soon
              </h2>
              <div className="space-y-2">
                {forecast.dueSoon.map((item) => (
                  <div
                    key={item.system.id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="flex items-center gap-2 text-red-800">
                      <span className="text-lg">
                        {iconFor(SYSTEM_TYPES, item.system.system_type)}
                      </span>
                      {labelFor(SYSTEM_TYPES, item.system.system_type)}
                    </span>
                    <span className="text-red-700">
                      {money(item.costLow)} - {money(item.costHigh)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card mt-6 space-y-3">
            <h2 className="text-sm font-semibold text-stone-900">
              10-year timeline
            </h2>
            <div className="divide-y divide-stone-100">
              {forecast.timeline.map((item) => (
                <div
                  key={item.system.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {iconFor(SYSTEM_TYPES, item.system.system_type)}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        {labelFor(SYSTEM_TYPES, item.system.system_type)}
                      </p>
                      <p className="text-xs text-stone-400">
                        {item.yearsLeft <= 0
                          ? "Due now"
                          : `~${item.yearsLeft} year${item.yearsLeft === 1 ? "" : "s"} left`}
                        {" · "}
                        est. {item.replacementYear}
                      </p>
                    </div>
                  </div>
                  <p className="whitespace-nowrap text-sm text-stone-600">
                    {money(item.costLow)} - {money(item.costHigh)}
                  </p>
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
