import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { labelFor, iconFor, ISSUE_CATEGORIES, TIMING_OPTIONS } from "@/lib/constants";
import { setFlash } from "@/lib/flash";
import Link from "next/link";
import { updateLeadStatusAction } from "./actions";
import LeadChat from "@/components/LeadChat";
import LeadTabs, { type LeadTab } from "./LeadTabs";

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
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(0)}` : "-";
}

// Pay a lead's fee from the prepaid wallet to unlock its contact + messaging.
// The unlock_lead RPC (migration 0008) runs atomically in the DB: it checks the
// balance, deducts the fee, marks the lead paid, and logs a wallet transaction.
async function unlockLeadAction(formData: FormData) {
  "use server";
  const id = String(formData.get("id"));
  const supabase = createClient() as any;
  // charge_lead spends cash first, then bonus (FIFO). Returns false if broke.
  const { data, error } = await supabase.rpc("charge_lead", { p_lead: id });
  if (error) setFlash(error.message, "error");
  else if (data === false)
    setFlash("Not enough balance. Add funds to unlock.", "error");
  else setFlash("Lead unlocked.", "success");
  revalidatePath("/pro");
  revalidatePath("/pro/billing");
  revalidatePath("/pro/chats");
}

export default async function ProDashboard({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const supabase = createClient();
  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("*")
    .eq("contractor_id", contractor.id)
    .order("created_at", { ascending: false });

  const { data: wallet } = await (supabase as any)
    .from("wallets")
    .select("cash_balance_cents, bonus_balance_cents")
    .eq("contractor_id", contractor.id)
    .maybeSingle();
  const balance =
    (Number(wallet?.cash_balance_cents ?? 0) +
      Number(wallet?.bonus_balance_cents ?? 0)) /
    100;
  // Unlocked = the lead's fee has been paid from the wallet (set by unlock_lead).
  const isUnlocked = (l: any) => Boolean(l.paid);

  // Drop invalid legacy leads: "accepted" with no unlock can't happen in the
  // unlock flow (you pay before you can accept), so hide that stale state.
  const all = (leads ?? []).filter(
    (l) => !(l.status === "accepted" && !isUnlocked(l))
  );

  // Split the two groups.
  const potential = all.filter((l) => l.status === "new" && !isUnlocked(l));
  const mine = all.filter((l) => !(l.status === "new" && !isUnlocked(l)));

  const activeCount = mine.filter((l) => l.status === "accepted").length;
  const wonCount = mine.filter((l) => l.status === "closed").length;
  const lostCount = mine.filter((l) => l.status === "lost" && isUnlocked(l)).length;
  const declinedCount = mine.filter(
    (l) => l.status === "lost" && !isUnlocked(l)
  ).length;

  // Filters inside "Your leads". "lost" = unlocked then job fell through;
  // "declined" = passed on without ever unlocking.
  const matches = (l: any, key: string) =>
    key === "accepted"
      ? l.status === "accepted"
      : key === "closed"
        ? l.status === "closed"
        : key === "lost"
          ? l.status === "lost" && isUnlocked(l)
          : key === "declined"
            ? l.status === "lost" && !isUnlocked(l)
            : true;

  const FILTER_KEYS = ["accepted", "closed", "lost", "declined"];
  const active =
    searchParams.status && FILTER_KEYS.includes(searchParams.status)
      ? searchParams.status
      : "";
  const visibleMine = active ? mine.filter((l) => matches(l, active)) : mine;

  const tabs: LeadTab[] = [
    { value: "", label: "All", count: mine.length },
    { value: "accepted", label: "Active", count: activeCount },
    { value: "closed", label: "Won", count: wonCount },
    { value: "lost", label: "Lost", count: lostCount },
    { value: "declined", label: "Declined", count: declinedCount },
  ];

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Potential leads</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">{potential.length}</p>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Active jobs</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">{activeCount}</p>
        </div>
        <Link
          href="/pro/billing"
          className="card transition hover:border-hearth-400 hover:shadow-md"
        >
          <p className="text-sm font-medium text-stone-500">Wallet balance</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">
            ${balance.toFixed(2)}
          </p>
          <p className="mt-1 text-xs font-medium text-hearth-700">Add funds →</p>
        </Link>
      </section>

      {/* ---- Potential leads: new opportunities, locked until unlocked ---- */}
      <section className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Potential leads{" "}
            <span className="text-stone-400">({potential.length})</span>
          </h1>
          <p className="text-sm text-stone-500">
            New requests in your area. Unlock one to see the homeowner&apos;s
            contact and reach out.
          </p>
        </div>

        {potential.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No new leads right now. When a homeowner requests a pro in one of your
            categories ({(contractor.categories ?? []).join(", ") || "none set"}),
            it&apos;ll show up here.
          </p>
        ) : (
          <ul className="space-y-3">
            {potential.map((l) => (
              <LeadCard
                key={l.id}
                l={l}
                balance={balance}
                unlocked={isUnlocked(l)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---- Your leads: the pro's own pipeline ---- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-2xl font-semibold text-stone-900">
            Your leads <span className="text-stone-400">({mine.length})</span>
          </h2>
          <p className="text-sm text-stone-500">
            Leads you&apos;ve unlocked. Track each one through your pipeline.
          </p>
        </div>

        <LeadTabs tabs={tabs} active={active} />

        {mine.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            You haven&apos;t unlocked any leads yet. Unlock one above to get
            started.
          </p>
        ) : visibleMine.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No {tabs.find((t) => t.value === active)?.label.toLowerCase()} leads.
          </p>
        ) : (
          <ul className="space-y-3">
            {visibleMine.map((l) => (
              <LeadCard
                key={l.id}
                l={l}
                balance={balance}
                unlocked={isUnlocked(l)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// One lead card - used by both the "Potential" and "Your leads" lists.
function LeadCard({
  l,
  balance,
  unlocked,
}: {
  l: any;
  balance: number;
  unlocked: boolean;
}) {
  const fee = Number(l.payout_amount ?? 0);
  const canAfford = balance >= fee;

  return (
    <li className="card space-y-3">
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
          {unlocked && <span className="ml-1 text-green-600">· unlocked</span>}
        </span>
      </div>

      {l.issue_description && (
        <p className="text-sm text-stone-600">{l.issue_description}</p>
      )}

      {l.timing && (
        <p className="text-sm text-stone-500">
          <span className="text-stone-400">Timing:</span>{" "}
          {labelFor(TIMING_OPTIONS, l.timing)}
        </p>
      )}

      {unlocked ? (
        // Unlocked - reveal the homeowner's contact details.
        <div className="rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
          <p>
            <span className="text-stone-400">Homeowner:</span>{" "}
            {l.homeowner_name || "-"}
          </p>
          <p>
            <span className="text-stone-400">Address:</span>{" "}
            {l.property_address || "-"}
          </p>
          <p>
            <span className="text-stone-400">Contact:</span>{" "}
            {l.homeowner_email || "-"}
            {l.homeowner_phone ? ` · ${l.homeowner_phone}` : ""}
          </p>
        </div>
      ) : (
        // Locked - contact stays hidden until the fee is paid.
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          🔒 Contact hidden. Unlock this lead to see the homeowner&apos;s name,
          address, phone and email, and to message them.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Any locked open lead must be unlocked first - no lead gets stuck. */}
        {!unlocked && (l.status === "new" || l.status === "accepted") && (
          <>
            {canAfford ? (
              <form action={unlockLeadAction}>
                <input type="hidden" name="id" value={l.id} />
                <button className="btn-primary">
                  Unlock for {money(l.payout_amount)}
                </button>
              </form>
            ) : (
              <Link href="/pro/billing" className="btn-primary">
                Add funds to unlock ({money(l.payout_amount)})
              </Link>
            )}
            <StatusButton id={l.id} status="lost" label="Decline" />
          </>
        )}
        {unlocked && l.status === "new" && (
          <>
            <StatusButton id={l.id} status="accepted" label="Accept" primary />
            <StatusButton id={l.id} status="lost" label="Mark lost" />
          </>
        )}
        {unlocked && l.status === "accepted" && (
          <>
            <StatusButton id={l.id} status="closed" label="Mark won" primary />
            <StatusButton id={l.id} status="lost" label="Mark lost" />
          </>
        )}
        {(l.status === "closed" || l.status === "lost") && (
          <StatusButton id={l.id} status="new" label="Reopen" />
        )}
      </div>

      {/* Messaging is only available once the lead is unlocked. */}
      {unlocked && <LeadChat leadId={l.id} role="contractor" />}
    </li>
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
