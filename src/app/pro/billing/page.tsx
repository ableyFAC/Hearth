import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { setFlash } from "@/lib/flash";

// Add funds to the wallet via the secure add_deposit() RPC ($5–$100, enforced
// in the DB too). `as any` is used for the new wallet column/table/RPC so this
// stays a single self-contained file; regenerate types later with `npm run db:types`.
async function addDepositAction(formData: FormData) {
  "use server";
  const amount = Number(formData.get("amount"));
  const supabase = createClient() as any;
  const { error } = await supabase.rpc("add_deposit", { p_amount: amount });
  setFlash(
    error ? error.message : `Added $${amount.toFixed(0)} to your balance`,
    error ? "error" : "success"
  );
  revalidatePath("/pro/billing");
  revalidatePath("/pro");
}

function money(n: number | string | null) {
  const v = Number(n ?? 0);
  return `$${(Number.isFinite(v) ? v : 0).toFixed(2)}`;
}

// Deposit presets. Minimum $5; custom is $5–$100.
const PRESETS = [5, 10, 25, 50];

export default async function ProBillingPage() {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const supabase = createClient() as any;
  const { data: txns } = await supabase
    .from("wallet_transactions")
    .select("*")
    .eq("contractor_id", contractor.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const balance = Number((contractor as any).balance ?? 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Wallet</h1>
        <p className="mt-1 text-sm text-stone-500">
          Add funds, then pay per lead to unlock the homeowner&apos;s contact.
          (Demo — no real charge is processed yet.)
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card border-hearth-200 bg-hearth-50">
          <p className="text-sm font-medium text-hearth-800">Wallet balance</p>
          <p className="mt-1 text-4xl font-bold text-hearth-900">{money(balance)}</p>
        </div>

        <div className="card space-y-3">
          <p className="text-sm font-medium text-stone-500">Add funds</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((a) => (
              <form key={a} action={addDepositAction}>
                <input type="hidden" name="amount" value={a} />
                <button className="btn-secondary">+ ${a}</button>
              </form>
            ))}
          </div>
          <form action={addDepositAction} className="flex gap-2">
            <input
              name="amount"
              type="number"
              min={5}
              max={100}
              step={1}
              required
              placeholder="Custom ($5–$100)"
              className="input max-w-[180px]"
            />
            <button className="btn-primary">Add</button>
          </form>
          <p className="text-xs text-stone-400">
            Minimum $5 · maximum $100 per deposit.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">Activity</h2>
        {!txns || txns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No activity yet. Add funds to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {txns.map((t: any) => {
              const credit = Number(t.amount) >= 0;
              return (
                <li
                  key={t.id}
                  className="card flex items-center justify-between"
                >
                  <div>
                    <span className="font-medium text-stone-900">
                      {t.kind === "deposit" ? "Funds added" : "Lead unlocked"}
                    </span>
                    <p className="text-xs text-stone-400">
                      {new Date(t.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`font-semibold ${
                      credit ? "text-green-600" : "text-stone-700"
                    }`}
                  >
                    {credit ? "+" : "−"}
                    {money(Math.abs(Number(t.amount)))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
