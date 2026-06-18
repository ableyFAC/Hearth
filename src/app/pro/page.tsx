import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { labelFor, iconFor, ISSUE_CATEGORIES, TIMING_OPTIONS } from "@/lib/constants";
import { updateLeadStatusAction } from "./actions";
import LeadChat from "@/components/LeadChat";

const SEVERITY_STYLE: Record<string, string> = {
  low: "border-stone-200 bg-stone-50 text-stone-600",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_STYLE: Record<string, string> = {
  new: "border-hearth-200 bg-hearth-50 text-hearth-700",
  accepted: "border-blue-200 bg-blue-50 text-blue-700",
  closed: "border-green-200 bg-green-50 text-green-700",
  lost: "border-stone-200 bg-stone-100 text-stone-500",
};

function money(n: number | string | null) {
  // Postgres returns numeric columns as strings — coerce before formatting.
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(0)}` : "—";
}

export default async function ProDashboard() {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const supabase = createClient();
  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("*")
    .eq("contractor_id", contractor.id)
    .order("created_at", { ascending: false });

  const all = leads ?? [];
  const newCount = all.filter((l) => l.status === "new").length;
  const activeCount = all.filter((l) => l.status === "accepted").length;
  const owed = all
    .filter((l) => !l.paid && l.status !== "lost")
    .reduce((sum, l) => sum + Number(l.payout_amount ?? 0), 0);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm font-medium text-stone-500">New leads</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">{newCount}</p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Active jobs</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">{activeCount}</p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Balance owed</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">{money(owed)}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h1 className="text-2xl font-semibold text-stone-900">Your leads</h1>

        {all.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No leads yet. When a homeowner requests a pro in one of your
            categories ({(contractor.categories ?? []).join(", ") || "none set"}),
            it&apos;ll show up here.
          </p>
        ) : (
          <ul className="space-y-3">
            {all.map((l) => (
              <li key={l.id} className="card space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">
                    {iconFor(ISSUE_CATEGORIES, l.category)}{" "}
                    {labelFor(ISSUE_CATEGORIES, l.category)}
                  </span>
                  {l.issue_severity && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${SEVERITY_STYLE[l.issue_severity] ?? ""}`}
                    >
                      {l.issue_severity}
                    </span>
                  )}
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_STYLE[l.status] ?? ""}`}
                  >
                    {l.status}
                  </span>
                  <span className="ml-auto text-sm font-semibold text-stone-700">
                    Lead fee {money(l.payout_amount)}
                    {l.paid && (
                      <span className="ml-1 text-green-600">· paid</span>
                    )}
                  </span>
                </div>

                {l.issue_description && (
                  <p className="text-sm text-stone-600">{l.issue_description}</p>
                )}

                <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
                  <p>
                    <span className="text-stone-400">Homeowner:</span>{" "}
                    {l.homeowner_name || "—"}
                  </p>
                  <p>
                    <span className="text-stone-400">Address:</span>{" "}
                    {l.property_address || "—"}
                  </p>
                  <p>
                    <span className="text-stone-400">Contact:</span>{" "}
                    {l.homeowner_email || "—"}
                    {l.homeowner_phone ? ` · ${l.homeowner_phone}` : ""}
                  </p>
                  {l.timing && (
                    <p>
                      <span className="text-stone-400">Timing:</span>{" "}
                      {labelFor(TIMING_OPTIONS, l.timing)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {l.status === "new" && (
                    <>
                      <StatusButton id={l.id} status="accepted" label="Accept" primary />
                      <StatusButton id={l.id} status="lost" label="Decline" />
                    </>
                  )}
                  {l.status === "accepted" && (
                    <>
                      <StatusButton id={l.id} status="closed" label="Mark won" primary />
                      <StatusButton id={l.id} status="lost" label="Mark lost" />
                    </>
                  )}
                  {(l.status === "closed" || l.status === "lost") && (
                    <StatusButton id={l.id} status="new" label="Reopen" />
                  )}
                </div>

                <LeadChat leadId={l.id} role="contractor" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatusButton({
  id,
  status,
  label,
  primary,
}: {
  id: string;
  status: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={updateLeadStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={primary ? "btn-primary" : "btn-secondary"}>
        {label}
      </button>
    </form>
  );
}
