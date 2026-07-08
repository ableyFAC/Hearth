import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { hasPlus } from "@/lib/subscription";
import { labelFor, iconFor, SYSTEM_TYPES } from "@/lib/constants";
import { stateName } from "@/lib/forecast";
import DocumentUpload from "@/components/DocumentUpload";
import { imgSrc } from "@/lib/storage";
import {
  applyDocumentToTwinAction,
  deleteDocumentAction,
} from "@/lib/document-actions";
import { insuranceRateFor, DEFAULT_INSURANCE_RATE } from "./insuranceRates";
import InsuranceForm from "./InsuranceForm";
import InsurancePacket from "./InsurancePacket";

const DOC_TYPE_LABEL: Record<string, string> = {
  warranty: "Warranty",
  manual: "Manual",
  receipt: "Receipt",
  inspection_report: "Inspection",
  other: "Document",
};

// Format YYYY-MM-DD as "Mar 2028" without going through Date (timezone-safe,
// and avoids the argless-Date restriction used elsewhere in the app).
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const mon = MONTHS[Number(m[2]) - 1];
  return mon ? `${mon} ${m[1]}` : d;
}

// Full "Mar 5, 2027" form for the insurance renewal date, same timezone-safe
// approach as fmtDate above (never Date-parse a bare YYYY-MM-DD string).
function fmtFullDate(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const mon = MONTHS[Number(m[2]) - 1];
  return mon ? `${mon} ${Number(m[3])}, ${m[1]}` : d;
}

// Whole days from today (UTC, date-only math, matching the maintenance
// reminders cron) until a YYYY-MM-DD date. Negative means it already passed.
const DAY_MS = 24 * 60 * 60 * 1000;
function daysUntil(d: string): number {
  const now = new Date(Date.now());
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const target = new Date(`${d}T00:00:00Z`).getTime();
  return Math.round((target - todayUtc) / DAY_MS);
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export default async function DocumentsPage() {
  const property = (await getActiveProperty())!;
  const supabase = createClient();

  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select(
      "id, title, doc_type, system_type, brand, model, install_year, warranty_expires, summary, file_url, applied_at, uploaded_at"
    )
    .eq("property_id", property.id)
    .order("uploaded_at", { ascending: false });

  const list = docs ?? [];
  const isPlus = await hasPlus();

  // insurance_renewal_date and insurance_premium are new columns from
  // migration 0040, not yet in src/lib/database.types.ts, so they are read
  // off the row with a cast rather than widening the generated types by hand
  // (same pattern as /taxes and /value). If the migration has not run yet in
  // this database, these come back undefined and the card shows the setup
  // form, exactly like "not set yet".
  const rawProp = property as any;
  const insurancePremium: number | null =
    typeof rawProp.insurance_premium === "number"
      ? rawProp.insurance_premium
      : null;
  const insuranceRenewal: string | null =
    typeof rawProp.insurance_renewal_date === "string"
      ? rawProp.insurance_renewal_date
      : null;
  const hasInsurance = insurancePremium != null && insuranceRenewal != null;
  const daysToRenewal = insuranceRenewal ? daysUntil(insuranceRenewal) : null;

  // Static state premium context (see insuranceRates.ts): identity with the
  // DEFAULT means we have no numbers for this state and fall back to the
  // national ballpark, so the copy says "nationally" instead of a state name.
  const insRate = insuranceRateFor(property.state);
  const insRegion =
    insRate === DEFAULT_INSURANCE_RATE ? null : stateName(property.state);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-1">
        <h1 className="text-2xl font-semibold text-stone-900">Documents</h1>
      </header>
      <p className="mb-5 text-sm text-stone-500">
        Your home's paperwork in one place. Warranties, manuals, receipts, and
        model labels all live here. Hearth reads each one and can drop the
        details straight into your home profile, so you never dig for a manual
        or a warranty date again.
      </p>

      <DocumentUpload propertyId={property.id} />

      <div className="mt-6 space-y-3">
        {/* If the select itself errored (e.g. a drifted DB schema), say so
            plainly instead of falling through to the empty state, which would
            read as "your files are gone" when they're actually just not
            loaded right now. */}
        {docsError && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            We couldn&apos;t load your documents right now. They&apos;re safe,
            try again shortly.
          </div>
        )}

        {!docsError && list.length === 0 && (
          <div className="rounded-xl border border-dashed border-stone-300 px-4 py-8 text-center">
            <div className="flex justify-center">
              <span className="icon-chip">📄</span>
            </div>
            <p className="mt-2 text-sm text-stone-500">
              No documents yet. Add your first one above.
            </p>
          </div>
        )}

        {list.map((d) => {
          const facts = [
            d.brand && d.model
              ? `${d.brand} ${d.model}`
              : d.brand || d.model || null,
            d.install_year ? `installed ${d.install_year}` : null,
            d.warranty_expires
              ? `warranty to ${fmtDate(d.warranty_expires)}`
              : null,
          ].filter(Boolean);

          const canApply =
            !d.applied_at && (d.system_type || d.warranty_expires);

          return (
            <div
              key={d.id}
              className="flex gap-3 rounded-xl border border-stone-200 bg-white p-4"
            >
              <div className="icon-chip">
                {d.system_type ? iconFor(SYSTEM_TYPES, d.system_type) : "📄"}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={imgSrc(d.file_url) ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate font-medium text-stone-900 hover:text-hearth-700 hover:underline"
                  >
                    {d.title || "Home document"}
                  </a>
                  <span className="chip bg-stone-100 text-stone-500">
                    {DOC_TYPE_LABEL[d.doc_type ?? "other"] ?? "Document"}
                  </span>
                  {d.system_type && (
                    <span className="chip bg-hearth-50 text-hearth-700">
                      {labelFor(SYSTEM_TYPES, d.system_type)}
                    </span>
                  )}
                </div>

                {d.summary && (
                  <p className="mt-1 text-sm text-stone-600">{d.summary}</p>
                )}
                {facts.length > 0 && (
                  <p className="mt-1 text-xs text-stone-500">
                    {facts.join(" · ")}
                  </p>
                )}

                <div className="mt-2 flex items-center gap-3">
                  {canApply && (
                    <form action={applyDocumentToTwinAction}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        className="rounded-md bg-hearth-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-hearth-700"
                      >
                        + Add to my home
                      </button>
                    </form>
                  )}
                  {d.applied_at && (
                    <span className="text-xs font-medium text-green-600">
                      ✓ Added to your home
                    </span>
                  )}
                  <form action={deleteDocumentAction}>
                    <input type="hidden" name="id" value={d.id} />
                    <button
                      type="submit"
                      className="text-xs text-stone-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Home insurance renewal checkup (migration 0040) */}
      <section className="mt-10">
        <h2 className="mb-1 flex items-center text-lg font-semibold text-stone-900">
          Home insurance
        </h2>
        <p className="mb-4 text-sm text-stone-500">
          Add your renewal date and annual premium from your policy and Hearth
          will nudge you about 45 days before renewal, while there&apos;s
          still time to shop around.
        </p>

        {!hasInsurance && (
          <InsuranceForm
            renewalDate={insuranceRenewal}
            premium={insurancePremium}
            startOpen
          />
        )}

        {hasInsurance && (
          <div className="space-y-4">
            <div className="card space-y-3">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="text-center">
                  <p className="stat-label">
                    Annual premium
                  </p>
                  <p className="stat-number text-2xl">
                    {money(insurancePremium!)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="stat-label">Renews</p>
                  <p className="stat-number text-2xl">
                    {fmtFullDate(insuranceRenewal!)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="stat-label">
                    Days until renewal
                  </p>
                  <p className="stat-number text-2xl">
                    {daysToRenewal! >= 0 ? daysToRenewal : "Passed"}
                  </p>
                </div>
              </div>

              {daysToRenewal! < 0 && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  That renewal date has passed. When your new policy starts,
                  update the date and premium below so next year&apos;s
                  reminder lands on time.
                </p>
              )}

              <p className="text-sm text-stone-600">
                For context, the average premium{" "}
                {insRegion ? `in ${insRegion}` : "nationally"} is roughly{" "}
                {money(insRate.avgPremium)} a year, and premiums there rose
                about {insRate.trendPct}% last year. That&apos;s a rough,
                hand-refreshed approximation of published industry averages,
                not a quote: your coverage and home matter more than any
                average. If your renewal comes in well above last year, a
                quick requote is worth checking.
              </p>
            </div>

            <InsurancePacket isPlus={isPlus} />

            <InsuranceForm
              renewalDate={insuranceRenewal}
              premium={insurancePremium}
              startOpen={false}
            />
          </div>
        )}
      </section>
    </div>
  );
}
