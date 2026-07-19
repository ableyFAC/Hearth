import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import { createClient } from "@/lib/supabase/server";
import { hasProPlan } from "@/lib/subscription";
import {
  labelFor,
  JOB_CATEGORIES,
  PRO_DEPOSIT_BOOST_PTS,
  LEAD_TIER_FEES,
  GHOST_PROTECTION_DAYS,
} from "@/lib/constants";
import DepositForm from "./DepositForm";
import FadingBanner from "@/components/FadingBanner";

function dollars(cents: number | string | null) {
  const v = Number(cents ?? 0);
  return `$${((Number.isFinite(v) ? v : 0) / 100).toFixed(2)}`;
}

// One vocabulary for the whole apply-fee lifecycle, so a charge, its
// ghost-protection return, and a post-refund re-charge all clearly describe
// the same fee.
const TX_LABEL: Record<string, string> = {
  deposit: "Deposit",
  bonus_grant: "Bonus credit",
  lead_charge: "Lead unlocked",
  apply_fee: "Apply fee",
  bonus_expiry: "Bonus expired",
  adjustment: "Adjustment",
  ghost_refund: "Apply fee returned",
  ghost_recharge: "Apply fee re-charged: homeowner chose you after the refund",
  ghost_recharge_waived: "Re-charge waived",
};

// Never show a raw transaction type like "apply_fee": mapped label first,
// humanized underscores as the fallback for anything new.
function txLabel(type: string | null | undefined): string {
  if (!type) return "Activity";
  return TX_LABEL[type] ?? type.replace(/_/g, " ");
}

export default async function ProBillingPage({
  searchParams,
}: {
  searchParams: {
    paid?: string;
    canceled?: string;
    need?: string;
    category?: string;
  };
}) {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  // Pro members earn extra points on every deposit bonus (display only here;
  // the webhook applies the real boost when the payment lands).
  const proMember = await hasProPlan();

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

  // Arrived from an "Add funds to apply" link: how much more the wallet needs
  // for that specific job. Drives the banner and the preselected deposit.
  const needRaw = Number(searchParams.need);
  const need = Number.isFinite(needRaw) && needRaw > 0 ? needRaw : null;
  const needStr =
    need !== null
      ? Number.isInteger(need)
        ? `$${need}`
        : `$${need.toFixed(2)}`
      : null;
  const needCategory = searchParams.category
    ? labelFor(JOB_CATEGORIES, searchParams.category)
    : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Billing</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Deposit credit, then spend it unlocking leads. Lead prices vary by
          service: ${LEAD_TIER_FEES.light} for lighter jobs like cleaning and
          handyman work, ${LEAD_TIER_FEES.skilled} for skilled trades like
          plumbing and HVAC, ${LEAD_TIER_FEES.major} for big-ticket work like
          roofing and remodels. Jobs that sit unclaimed get cheaper: 15% off
          after 3 days, 30% off after 7. The discounted price is what your
          wallet is charged.
        </p>
      </div>

      {need !== null && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
          You need {needStr} more to apply to that{" "}
          {needCategory ? `${needCategory} ` : ""}job.
        </div>
      )}

      {/* A calm confirmation only: confetti is saved for winning a job, not
          for spending money. */}
      {searchParams.paid && (
        <FadingBanner className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800 dark:border-green-500/30 dark:bg-green-500/15 dark:text-green-300">
          Payment received. Your wallet has been credited.
        </FadingBanner>
      )}
      {searchParams.canceled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
          Checkout canceled. No charge was made.
        </div>
      )}

      {/* Balances */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card-hero">
          <p className="stat-label text-hearth-800 dark:text-hearth-400">Lead credit</p>
          <p className="stat-number mt-1 text-4xl text-hearth-900 dark:text-hearth-200">
            {dollars(cash)}
          </p>
          <p className="mt-1 text-xs text-hearth-700">Never expires.</p>
        </div>
        <div className="card border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/15">
          <p className="stat-label text-amber-800 dark:text-amber-400">Bonus credit</p>
          <p className="stat-number mt-1 text-2xl text-amber-900 dark:text-amber-300">
            {dollars(bonus)}
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Promotional · expires 60 days after each grant.
          </p>
        </div>
      </section>

      {/* Deposit */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Add credit</h2>
        <DepositForm
          tiers={(tiers as any) ?? []}
          need={need ?? undefined}
          boostPts={proMember ? PRO_DEPOSIT_BOOST_PTS : 0}
        />
        {proMember ? (
          <div className="rounded-xl border border-hearth-200 bg-hearth-50 p-3 text-xs text-hearth-800 dark:border-hearth-500/30 dark:bg-hearth-500/15 dark:text-hearth-300">
            <span className="font-semibold">Pro member bonus applied:</span>{" "}
            every tier below earns +{PRO_DEPOSIT_BOOST_PTS} pts
            {((tiers as any) ?? []).length > 0 && (
              <>
                {" "}
                (
                {((tiers as any) as Array<{
                  min_cents: number;
                  bonus_pct: number;
                }>)
                  .map(
                    (t) =>
                      `$${Math.round(t.min_cents / 100)}+ earns ${
                        t.bonus_pct + PRO_DEPOSIT_BOOST_PTS
                      }%`
                  )
                  .join(", ")}
                )
              </>
            )}
            .
          </div>
        ) : (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Pro members get +{PRO_DEPOSIT_BOOST_PTS}% on every deposit.{" "}
            <Link href="/pro/plus" className="text-hearth-700 hover:underline">
              See Hearth Pro
            </Link>
          </p>
        )}
      </section>

      {/* Activity */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Activity</h2>
        {txns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:text-stone-400">
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
                  className="card flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="font-medium text-stone-900 dark:text-stone-100">
                      {txLabel(t.type)}
                    </span>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {new Date(t.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={`font-semibold [font-variant-numeric:tabular-nums] ${
                      positive ? "text-green-600 dark:text-green-400" : "text-stone-700 dark:text-stone-300"
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
        {txns.length > 0 && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            Ghost protection: if the homeowner never responds within{" "}
            {GHOST_PROTECTION_DAYS} days, your apply fee comes back on its own.
            If they choose you after that refund, the same fee is re-charged.
          </p>
        )}
      </section>
    </div>
  );
}
