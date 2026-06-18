import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { labelFor, ISSUE_CATEGORIES } from "@/lib/constants";
import { markLeadPaidAction } from "../actions";

function money(n: number | string | null) {
  // Postgres returns numeric columns as strings — coerce before formatting.
  const v = Number(n ?? 0);
  return `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
}

export default async function ProBillingPage() {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const supabase = createClient();
  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("*")
    .eq("contractor_id", contractor.id)
    .neq("status", "lost") // declined leads aren't billed
    .order("created_at", { ascending: false });

  const billable = leads ?? [];
  const owed = billable
    .filter((l) => !l.paid)
    .reduce((s, l) => s + Number(l.payout_amount ?? 0), 0);
  const paid = billable
    .filter((l) => l.paid)
    .reduce((s, l) => s + Number(l.payout_amount ?? 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Billing</h1>
        <p className="mt-1 text-sm text-stone-500">
          You&apos;re billed a flat fee per lead delivered. (Demo — no real
          payment is processed yet.)
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-800">Balance owed</p>
          <p className="mt-1 text-4xl font-bold text-amber-900">{money(owed)}</p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Paid to date</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">{money(paid)}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">Lead charges</h2>
        {billable.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No billable leads yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {billable.map((l) => (
              <li
                key={l.id}
                className="card flex items-center justify-between gap-4"
              >
                <div>
                  <span className="font-medium text-stone-900">
                    {labelFor(ISSUE_CATEGORIES, l.category)}
                  </span>
                  <p className="text-xs text-stone-400">
                    {l.property_address || "—"} ·{" "}
                    {new Date(l.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-stone-700">
                    {money(l.payout_amount ?? 0)}
                  </span>
                  <form action={markLeadPaidAction}>
                    <input type="hidden" name="id" value={l.id} />
                    <input
                      type="hidden"
                      name="paid"
                      value={(!l.paid).toString()}
                    />
                    <button
                      className={l.paid ? "btn-secondary" : "btn-primary"}
                    >
                      {l.paid ? "Paid ✓ (undo)" : "Mark paid"}
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
