import { getActiveProperty } from "@/lib/property";
import { stateName } from "@/lib/forecast";
import {
  estimateHomeValue,
  estimateValueTimeline,
  calculateEquity,
} from "@/lib/homeValue";
import ValueForm from "./ValueForm";

function money(n: number): string {
  return `${n < 0 ? "-" : ""}$${Math.round(Math.abs(n)).toLocaleString()}`;
}

// Compact form for the bar chart labels ($1.2k instead of $1,200), matching
// the /forecast page's moneyShort helper.
function moneyShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${n < 0 ? "-" : ""}$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
  }
  return `${n < 0 ? "-" : ""}$${Math.round(abs)}`;
}

export default async function ValuePage() {
  const property = (await getActiveProperty())!;

  // purchase_price and mortgage_balance are new columns from migration 0029
  // that are not yet in src/lib/database.types.ts, so they are read off the
  // row with a cast rather than widening the generated types by hand. If the
  // migration has not run yet in this database, these just come back
  // undefined and the page shows the setup form, exactly like "not set yet".
  const raw = property as any;
  const purchasePrice: number | null =
    typeof raw.purchase_price === "number" ? raw.purchase_price : null;
  const mortgageBalance: number | null =
    typeof raw.mortgage_balance === "number" ? raw.mortgage_balance : null;

  // purchase_date already exists on properties (since migration 0001); only
  // the year matters here, so it is stored as YYYY-01-01 and parsed back out.
  const purchaseYear: number | null = property.purchase_date
    ? Number(property.purchase_date.slice(0, 4)) || null
    : null;

  const currentYear = new Date().getFullYear();
  const hasData = purchasePrice != null && purchaseYear != null;
  const region = stateName(property.state);

  const estimatedValue = hasData
    ? estimateHomeValue(purchasePrice!, purchaseYear!, property.state, currentYear)
    : null;
  const appreciationGained =
    hasData && estimatedValue != null ? estimatedValue - purchasePrice! : null;
  const equity =
    hasData && estimatedValue != null
      ? calculateEquity(estimatedValue, mortgageBalance)
      : null;
  const timeline =
    hasData
      ? estimateValueTimeline(purchasePrice!, purchaseYear!, property.state, currentYear)
      : [];
  // Tallest bar in the chart, computed once rather than per bar.
  const timelineMax = Math.max(...timeline.map((x) => x.value), 1);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-1">
        <h1 className="text-2xl font-semibold text-stone-900">
          Home value &amp; equity
        </h1>
      </header>
      <p className="mb-5 text-sm text-stone-500">
        A running estimate of what your home is worth today and how much of
        it you actually own, based on statewide price trends since you bought
        it.
      </p>

      {!hasData && (
        <div className="space-y-4">
          <div className="card space-y-2 text-center">
            <p className="text-sm text-stone-600">
              We just need what you paid and the year you bought your home.
              From there we track your home&apos;s estimated value and your
              equity automatically, no appraisal needed.
            </p>
          </div>
          <ValueForm
            purchasePrice={purchasePrice}
            purchaseYear={purchaseYear}
            mortgageBalance={mortgageBalance}
            currentYear={currentYear}
            startOpen
          />
        </div>
      )}

      {hasData && estimatedValue != null && (
        <>
          <div className="card-hero space-y-2 text-center">
            <p className="stat-label">Estimated value today</p>
            <p className="stat-number text-4xl text-hearth-800">
              {money(estimatedValue)}
            </p>
            <p className="text-xs text-hearth-700">
              Bought for {money(purchasePrice!)} in {purchaseYear}
              {appreciationGained != null && appreciationGained !== 0 && (
                <>
                  {" "}
                  &middot;{" "}
                  <span
                    className={
                      appreciationGained > 0
                        ? "font-medium text-green-700"
                        : "font-medium text-red-600"
                    }
                  >
                    {appreciationGained > 0 ? "▲ up" : "▼ down"}{" "}
                    {money(appreciationGained)} since then
                  </span>
                </>
              )}
            </p>
            <p className="text-xs text-hearth-600">
              Adjusted for {region ? `your area (${region})` : "your area"},
              based on statewide averages.
            </p>
          </div>

          <div className="card mt-6 space-y-2 text-center">
            <p className="stat-label">Home equity</p>
            <p
              className={`stat-number text-2xl ${
                equity != null && equity < 0 ? "text-red-600" : "text-stone-900"
              }`}
            >
              {equity != null ? money(equity) : "-"}
            </p>
            <p className="text-xs text-stone-500">
              {equity != null && equity < 0
                ? "Your mortgage balance is higher than your estimated value right now. This can happen with a recent purchase or a slow local market, and it usually corrects as you pay down the loan and prices rise."
                : mortgageBalance
                ? `Estimated value minus your ${money(mortgageBalance)} mortgage balance.`
                : "Estimated value, since no mortgage balance is on file."}
            </p>
          </div>

          {timeline.length > 1 && (
            <div className="card mt-6 space-y-3">
              <h2 className="flex items-center text-sm font-semibold text-stone-900">
                Estimated value over time
              </h2>
              <div className="overflow-x-auto pb-1">
                <div className="flex items-end gap-2 border-b border-stone-200">
                  {timeline.map((p, i) => {
                    const height = Math.max(
                      6,
                      Math.round((p.value / timelineMax) * 96)
                    );
                    return (
                      <div
                        key={p.year}
                        title={`${p.year}: ${money(p.value)}`}
                        className="flex min-w-[2.75rem] flex-col items-center justify-end gap-1 transition hover:opacity-90"
                      >
                        <span className="text-[10px] font-medium tabular-nums text-stone-500">
                          {timeline.length > 10 && i % 2 !== 0
                            ? ""
                            : moneyShort(p.value)}
                        </span>
                        <div
                          className={`w-7 rounded-t-md bg-gradient-to-t ${
                            p.year === currentYear
                              ? "from-hearth-600 to-hearth-500"
                              : "from-hearth-500 to-hearth-400"
                          }`}
                          style={{ height: `${height}px` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  {timeline.map((p) => (
                    <span
                      key={p.year}
                      className="min-w-[2.75rem] text-center text-[10px] text-stone-400"
                    >
                      {p.year}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <ValueForm
              purchasePrice={purchasePrice}
              purchaseYear={purchaseYear}
              mortgageBalance={mortgageBalance}
              currentYear={currentYear}
              startOpen={false}
            />
          </div>

          <p className="mt-6 text-xs text-stone-400">
            This is an estimate based on statewide average price trends, not
            an appraisal. Your home&apos;s real value depends on its
            condition, upgrades, and what is actually selling nearby right
            now. For a number you can rely on to sell, refinance, or dispute
            taxes, talk to a local real estate agent or licensed appraiser.
          </p>
        </>
      )}
    </div>
  );
}
