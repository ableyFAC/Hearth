import Link from "next/link";
import { getActiveProperty } from "@/lib/property";
import { hasPlus } from "@/lib/subscription";
import { stateName } from "@/lib/forecast";
import { estimateHomeValue } from "@/lib/homeValue";
import TaxForm from "./TaxForm";
import AppealLetter from "./AppealLetter";

function money(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString()}`;
}

// How far the assessment sits from Hearth's estimate before the page calls
// it out. Above the estimate by more than this fraction reads "looks high";
// below it by more than this reads "looks favorable"; anything in between is
// "looks in line". 10% is deliberately conservative: Hearth's estimate is a
// statewide-model ballpark, so a smaller gap is just noise.
const HIGH_THRESHOLD = 0.1;
const LOW_THRESHOLD = -0.1;

type Verdict = "high" | "in_line" | "favorable";

export default async function TaxesPage() {
  const property = (await getActiveProperty())!;
  const isPlus = await hasPlus();

  // assessed_value and assessed_year are new columns from migration 0039,
  // and purchase_price is from 0029; none are in src/lib/database.types.ts
  // yet, so they are read off the row with a cast rather than widening the
  // generated types by hand (same pattern as /value). If a migration has not
  // run yet in this database, these come back undefined and the page shows
  // the setup form, exactly like "not set yet".
  const raw = property as any;
  const assessedValue: number | null =
    typeof raw.assessed_value === "number" ? raw.assessed_value : null;
  const assessedYear: number | null =
    typeof raw.assessed_year === "number" ? raw.assessed_year : null;
  const purchasePrice: number | null =
    typeof raw.purchase_price === "number" ? raw.purchase_price : null;

  const purchaseYear: number | null = property.purchase_date
    ? Number(property.purchase_date.slice(0, 4)) || null
    : null;

  const currentYear = new Date().getFullYear();
  const hasAssessment = assessedValue != null && assessedYear != null;
  const hasPurchaseData = purchasePrice != null && purchaseYear != null;
  const region = stateName(property.state);

  const estimatedValue = hasPurchaseData
    ? estimateHomeValue(purchasePrice!, purchaseYear!, property.state, currentYear)
    : null;

  // How far the assessment sits above (positive) or below (negative) the
  // estimate, as a fraction of the estimate.
  const diffPct =
    hasAssessment && estimatedValue != null && estimatedValue > 0
      ? (assessedValue! - estimatedValue) / estimatedValue
      : null;

  const verdict: Verdict | null =
    diffPct == null
      ? null
      : diffPct > HIGH_THRESHOLD
        ? "high"
        : diffPct < LOW_THRESHOLD
          ? "favorable"
          : "in_line";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-1">
        <h1 className="text-2xl font-semibold text-stone-900">
          Property tax watch
        </h1>
      </header>
      <p className="mb-5 text-sm text-stone-500">
        Your property tax bill is based on what the county says your home is
        worth. Enter the assessed value from your notice and Hearth will
        compare it against its own estimate, so you can spot an assessment
        that looks too high before the appeal deadline passes.
      </p>

      {!hasAssessment && (
        <div className="space-y-4">
          <div className="card space-y-2 text-center">
            <p className="text-sm text-stone-600">
              Grab your county assessment notice (or your most recent
              property tax bill). It lists an assessed value for your home
              and the tax year it covers. Enter those two numbers and Hearth
              will keep an eye on how they stack up.
            </p>
          </div>
          <TaxForm
            assessedValue={assessedValue}
            assessedYear={assessedYear}
            currentYear={currentYear}
            startOpen
          />
        </div>
      )}

      {hasAssessment && !hasPurchaseData && (
        <div className="space-y-4">
          <div className="card space-y-2 text-center">
            <p className="text-sm text-stone-600">
              Your {assessedYear} assessment of {money(assessedValue!)} is
              saved. To compare it against an estimate of what your home is
              actually worth, Hearth needs what you paid and the year you
              bought, which live on the home value page.
            </p>
            <Link href="/value" className="btn-primary inline-block">
              Set up your home value
            </Link>
          </div>
          <TaxForm
            assessedValue={assessedValue}
            assessedYear={assessedYear}
            currentYear={currentYear}
            startOpen={false}
          />
        </div>
      )}

      {hasAssessment && estimatedValue != null && verdict != null && (
        <>
          <div
            className={`card-hero space-y-2 text-center ${
              verdict === "high"
                ? "border-amber-300"
                : "border-green-300"
            }`}
          >
            <p
              className={`text-sm font-medium ${
                verdict === "high" ? "text-amber-800" : "text-green-800"
              }`}
            >
              {verdict === "high" && "Your assessment looks high"}
              {verdict === "in_line" && "Your assessment looks in line"}
              {verdict === "favorable" && "Your assessment looks favorable"}
            </p>
            <p
              className={`text-sm ${
                verdict === "high" ? "text-amber-700" : "text-green-700"
              }`}
            >
              {verdict === "high" &&
                `The county assessed your home about ${Math.round(
                  diffPct! * 100
                )}% above Hearth's estimate. Homeowners who appeal an inflated assessment often save hundreds of dollars a year, and appealing is usually free.`}
              {verdict === "in_line" &&
                "The county's number sits within about 10% of Hearth's estimate, which is normal. An appeal probably isn't worth your time this year."}
              {verdict === "favorable" &&
                `The county assessed your home about ${Math.round(
                  Math.abs(diffPct!) * 100
                )}% below Hearth's estimate, which works in your favor at tax time. Appealing could backfire: drawing the assessor's attention might raise your assessment, not lower it.`}
            </p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="card space-y-1 text-center">
              <p className="stat-label">
                County assessed value ({assessedYear})
              </p>
              <p className="stat-number text-2xl">
                {money(assessedValue!)}
              </p>
              <p className="text-xs text-stone-500">
                From your assessment notice.
              </p>
            </div>
            <div className="card space-y-1 text-center">
              <p className="stat-label">
                Hearth&apos;s estimated value
              </p>
              <p className="stat-number text-2xl">
                {money(estimatedValue)}
              </p>
              <p className="text-xs text-stone-500">
                Based on {region ? `${region} price trends` : "statewide price trends"}{" "}
                since you bought in {purchaseYear}.
              </p>
            </div>
          </div>

          <div className="card mt-6 space-y-2">
            <h2 className="flex items-center text-sm font-semibold text-stone-900">
              What is a property tax appeal?
            </h2>
            <p className="text-sm text-stone-600">
              Every county lets homeowners challenge their assessment if they
              believe it is higher than what the home is really worth. You
              file a short form or letter with your county assessor (usually
              free), often with evidence like recent sales of similar homes
              nearby, and the county reviews it. If they agree, your assessed
              value comes down and your tax bill comes down with it. Watch
              the deadline on your notice: most counties give you only a few
              weeks after assessments go out.
            </p>
          </div>

          {verdict === "high" && (
            <div className="mt-6">
              <AppealLetter isPlus={isPlus} />
            </div>
          )}

          <div className="mt-6">
            <TaxForm
              assessedValue={assessedValue}
              assessedYear={assessedYear}
              currentYear={currentYear}
              startOpen={false}
            />
          </div>

          <p className="mt-6 text-xs text-stone-500">
            Hearth&apos;s number is an estimate from statewide average price
            trends, not an appraisal, and this page is not tax or legal
            advice. Assessment rules, ratios, and appeal processes vary a lot
            by county, and some counties assess at a fraction of market value
            by design, so a gap here doesn&apos;t always mean something is
            wrong. Appeals are decided by your county and outcomes are never
            guaranteed. For a number you can rely on, talk to a local real
            estate agent or licensed appraiser.
          </p>
        </>
      )}
    </div>
  );
}
