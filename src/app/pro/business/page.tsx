import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor, getRole } from "@/lib/contractor";
import {
  labelFor,
  iconFor,
  JOB_CATEGORIES,
  GHOST_PROTECTION_DAYS,
} from "@/lib/constants";

function dollars(cents: number | string | null) {
  const v = Number(cents ?? 0);
  return `$${((Number.isFinite(v) ? v : 0) / 100).toFixed(2)}`;
}

// Friendly pipeline labels, matching the leads board.
const STATUS_LABEL: Record<string, string> = {
  new: "New lead",
  accepted: "Active",
  closed: "Won",
  lost: "Lost",
};

// Days until ghost protection returns this application's fee (never negative:
// once the window has passed the cron refund is imminent).
function refundDaysLeft(appliedAt: string | null | undefined): number {
  const t = new Date(appliedAt ?? "").getTime();
  if (!Number.isFinite(t)) return GHOST_PROTECTION_DAYS;
  const elapsed = (Date.now() - t) / 86_400_000;
  return Math.max(0, Math.ceil(GHOST_PROTECTION_DAYS - elapsed));
}

// "My Business": one compact cockpit for the numbers a pro actually runs on -
// win rate, spend, cost per job won - plus the wallet and what's in flight.
export default async function ProBusinessPage() {
  const contractor = await getCurrentContractor();
  if (!contractor) {
    if ((await getRole()) === null) redirect("/get-started");
    redirect("/pro/onboarding");
  }

  const supabase = createClient();

  const [{ data: myApps }, { data: wonData }, { data: wallet }] =
    await Promise.all([
      (supabase as any).rpc("my_applications"),
      supabase
        .from("contractor_leads")
        .select("id, category, status, created_at")
        .eq("contractor_id", contractor.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("wallets")
        .select("id, cash_balance_cents, bonus_balance_cents")
        .eq("contractor_id", contractor.id)
        .maybeSingle(),
    ]);

  const apps = (myApps ?? []) as any[];
  const won = (wonData ?? []) as any[];

  const cash = Number((wallet as any)?.cash_balance_cents ?? 0);
  const bonus = Number((wallet as any)?.bonus_balance_cents ?? 0);

  // Total spent = every debit on the wallet (apply fees, lead charges). Same
  // math as the leads board's "Your results" card.
  const { data: txnRows } = (wallet as any)?.id
    ? await (supabase as any)
        .from("wallet_transactions")
        .select("cash_delta_cents, bonus_delta_cents")
        .eq("wallet_id", (wallet as any).id)
    : { data: [] };
  const spentCents = (txnRows ?? []).reduce((sum: number, t: any) => {
    const delta =
      Number(t.cash_delta_cents ?? 0) + Number(t.bonus_delta_cents ?? 0);
    return delta < 0 ? sum + Math.abs(delta) : sum;
  }, 0);

  const appliedCount = apps.length;
  const wonCount = apps.filter((a) => a.status === "chosen").length;
  // Win rate only means something with a few data points behind it.
  const winRate =
    appliedCount >= 3 ? Math.round((wonCount / appliedCount) * 100) : null;
  const costPerWin = wonCount > 0 ? spentCents / wonCount : null;

  // In flight: applications the homeowner hasn't answered yet.
  const pendingApps = apps.filter(
    (a) => a.status === "applied" && !a.refunded_at
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">My Business</h1>
        <p className="mt-1 text-sm text-stone-500">
          Your numbers, your wallet, and everything in flight.
        </p>
        <p className="mt-1 text-xs text-stone-400">
          78% of homeowners go with the first pro to respond. Fast replies win
          jobs.
        </p>
      </div>

      {/* The three numbers a lead-buying business runs on. */}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Win rate</p>
          <p className="mt-1 text-3xl font-bold text-stone-900">
            {winRate !== null ? `${winRate}%` : "-"}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            {winRate !== null
              ? `${wonCount} won of ${appliedCount} applications`
              : "Shows after 3 applications"}
          </p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-stone-500">
            Spent on applications
          </p>
          <p className="mt-1 text-3xl font-bold text-stone-900">
            {dollars(spentCents)}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            Ghost-protection refunds already added back
          </p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Cost per job won</p>
          <p className="mt-1 text-3xl font-bold text-stone-900">
            {costPerWin !== null ? dollars(costPerWin) : "-"}
          </p>
          <p className="mt-1 text-xs text-stone-400">
            {costPerWin !== null
              ? "Total spend divided by wins"
              : "Shows after your first win"}
          </p>
        </div>
      </section>

      {/* Wallet snapshot - the full ledger lives on Billing. */}
      <section className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-stone-500">Wallet</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">
            {dollars(cash + bonus)}
          </p>
          <p className="text-xs text-stone-400">
            {dollars(cash)} cash · {dollars(bonus)} bonus credit
          </p>
        </div>
        <Link href="/pro/billing" className="btn-secondary shrink-0 text-sm">
          Add funds
        </Link>
      </section>

      {/* In flight: applications waiting on a homeowner, with the refund clock. */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">
            Pending applications{" "}
            <span className="text-stone-400">({pendingApps.length})</span>
          </h2>
          <p className="text-xs text-stone-400">
            Ghost protection: a fee comes back automatically if the homeowner
            never responds.
          </p>
        </div>
        {pendingApps.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            Nothing in flight.{" "}
            <Link
              href="/pro"
              className="font-medium text-hearth-700 hover:underline"
            >
              Browse open jobs
            </Link>{" "}
            and apply while they&apos;re fresh: new postings close best.
          </p>
        ) : (
          <ul className="space-y-2">
            {pendingApps.map((a) => {
              const daysLeft = refundDaysLeft(a.applied_at);
              return (
                <li
                  key={a.application_id}
                  className="card flex items-center justify-between gap-3"
                >
                  <div>
                    <span className="font-medium text-stone-900">
                      {iconFor(JOB_CATEGORIES, a.category)}{" "}
                      {labelFor(JOB_CATEGORIES, a.category)}
                    </span>
                    {a.issue_description && (
                      <p className="text-sm text-stone-500">
                        {a.issue_description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-right text-xs text-stone-400">
                    {daysLeft === 0
                      ? "Fee returns today if no response"
                      : `Fee returns in ${daysLeft} day${
                          daysLeft === 1 ? "" : "s"
                        } if no response`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Recent wins - the payoff column. */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">
          Jobs won <span className="text-stone-400">({won.length})</span>
        </h2>
        {won.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No wins yet. Specific, fast replies are what turn applications into
            jobs: the{" "}
            <Link
              href="/pro/playbook"
              className="font-medium text-hearth-700 hover:underline"
            >
              Playbook
            </Link>{" "}
            has the short version.
          </p>
        ) : (
          <ul className="space-y-2">
            {won.map((l) => (
              <li
                key={l.id}
                className="card flex items-center justify-between gap-3"
              >
                <span className="font-medium text-stone-900">
                  {iconFor(JOB_CATEGORIES, l.category)}{" "}
                  {labelFor(JOB_CATEGORIES, l.category)}
                </span>
                <span className="shrink-0 text-xs text-stone-400">
                  {STATUS_LABEL[l.status] ?? l.status} ·{" "}
                  {new Date(l.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
