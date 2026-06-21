import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import { createClient } from "@/lib/supabase/server";
import DepositForm from "./DepositForm";
import Confetti from "@/components/Confetti";
import FadingBanner from "@/components/FadingBanner";

function dollars(cents: number | string | null) {
  const v = Number(cents ?? 0);
  return `$${((Number.isFinite(v) ? v : 0) / 100).toFixed(2)}`;
}

const TX_LABEL: Record<string, string> = {
  deposit: "Deposit",
  bonus_grant: "Bonus credit",
  lead_charge: "Lead unlocked",
  bonus_expiry: "Bonus expired",
  adjustment: "Adjustment",
};

export default async function ProBillingPage({
  searchParams,
}: {
  searchParams: { paid?: string; canceled?: string };
}) {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const supabase = createClient();

  const { data: wallet } = await supabase
    .from("wallets")
    .select("id, cash_balance_cents, bonus_balance_cents")
    .eq("contractor_id", contractor.id)
    .maybeSingle();

  const cash = Number((wallet as any)?.cash_balance_cents ?? 0);
  const bonus = Number((wallet as any)?.bonus_balance_cents ?? 0);

  const { data: tiers } = await supabase
    .from("deposit_tiers")
    .select("min_cents, max_cents, bonus_pct")
    .order("min_cents", { ascending: true });

  let txns: any[] = [];
  if ((wallet as any)?.id) {
    const { data } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("wallet_id", (wallet as any).id)
      .order("created_at", { ascending: false })
      .limit(50);
    txns = data ?? [];
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Billing</h1>
        <p className="mt-1 text-sm text-stone-500">
          Deposit credit, then spend it unlocking leads. Lead prices vary by
          service.
        </p>
      </div>

      {searchParams.paid && (
        <>
          <Confetti />
          <FadingBanner className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            ✅ Payment received. Your wallet has been credited.
          </FadingBanner>
        </>
      )}
      {searchParams.canceled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Checkout canceled. No charge was made.
        </div>
      )}

      {/* Balances */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card border-hearth-200 bg-hearth-50">
          <p className="text-sm font-medium text-hearth-800">Cash balance</p>
          <p className="mt-1 text-4xl font-bold text-hearth-900">
            {dollars(cash)}
          </p>
          <p className="mt-1 text-xs text-hearth-700">Never expires.</p>
        </div>
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-800">Bonus credit</p>
          <p className="mt-1 text-4xl font-bold text-amber-900">
            {dollars(bonus)}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Promotional · expires 60 days after each grant.
          </p>
        </div>
      </section>

      {/* Deposit */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">Add credit</h2>
        <DepositForm tiers={(tiers as any) ?? []} />
      </section>

      {/* Activity */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">Activity</h2>
        {txns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No activity yet. Add credit to get started.
          </p>
        ) : (
          <ul className="space-y-2">
            {txns.map((t) => {
              const net = Number(t.cash_delta_cents) + Number(t.bonus_delta_cents);
              const positive = net >= 0;
              return (
                <li
                  key={t.id}
                  className="card flex items-center justify-between"
                >
                  <div>
                    <span className="font-medium text-stone-900">
                      {TX_LABEL[t.type] ?? t.type}
                    </span>
                    <p className="text-xs text-stone-400">
                      {new Date(t.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`font-semibold ${
                      positive ? "text-green-600" : "text-stone-700"
                    }`}
                  >
                    {positive ? "+" : "−"}
                    {dollars(Math.abs(net))}
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
