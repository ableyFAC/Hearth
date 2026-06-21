import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import {
  labelFor,
  iconFor,
  ISSUE_CATEGORIES,
  TIMING_OPTIONS,
} from "@/lib/constants";
import Link from "next/link";
import OpenChatButton from "@/components/OpenChatButton";
import ChatDrawer from "@/components/ChatDrawer";
import LeadsRealtime from "./LeadsRealtime";
import ApplyJobButton from "./ApplyJobButton";
import JobStatusSelect from "./JobStatusSelect";

const SEVERITY_STYLE: Record<string, string> = {
  low: "border-stone-200 bg-stone-50 text-stone-600",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_STYLE: Record<string, string> = {
  new: "border-hearth-200 bg-hearth-50 text-hearth-700",
  accepted: "border-green-200 bg-green-50 text-green-700",
  closed: "border-green-600 bg-green-600 text-white",
  lost: "border-stone-200 bg-stone-100 text-stone-500",
};

// Friendly labels for the pipeline statuses a pro sets on their own jobs.
const STATUS_LABEL: Record<string, string> = {
  new: "New lead",
  accepted: "Active",
  closed: "Won",
  lost: "Lost",
};

function money(n: number | string | null) {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(0)}` : "-";
}

export default async function ProDashboard() {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const supabase = createClient();

  // Open jobs to apply to (safe fields only, category-matched, not yet applied),
  // the pro's own applications, and the jobs they were chosen for (full detail).
  const [{ data: openJobs }, { data: myApps }, { data: assignedData }] =
    await Promise.all([
      (supabase as any).rpc("open_jobs_for_me"),
      (supabase as any).rpc("my_applications"),
      supabase
        .from("contractor_leads")
        .select("*")
        .eq("contractor_id", contractor.id)
        .order("created_at", { ascending: false }),
    ]);

  const open = (openJobs ?? []) as any[];
  const apps = (myApps ?? []) as any[];
  // Won/lost jobs sink to the bottom; active ones stay on top (newest first,
  // which the query already ordered). Array.sort is stable, so order holds.
  const isDone = (l: any) => l.status === "closed" || l.status === "lost";
  const assigned = ((assignedData ?? []) as any[]).sort(
    (a, b) => (isDone(a) ? 1 : 0) - (isDone(b) ? 1 : 0)
  );

  // Applications still waiting on the homeowner (not yet chosen for the job).
  const pendingApps = apps.filter((a) => a.status === "applied");
  const declinedApps = apps.filter((a) => a.status === "declined");

  const activeCount = assigned.filter(
    (l) => l.status !== "closed" && l.status !== "lost"
  ).length;

  const { data: wallet } = await (supabase as any)
    .from("wallets")
    .select("cash_balance_cents, bonus_balance_cents")
    .eq("contractor_id", contractor.id)
    .maybeSingle();
  const balance =
    (Number(wallet?.cash_balance_cents ?? 0) +
      Number(wallet?.bonus_balance_cents ?? 0)) /
    100;

  return (
    <div className="space-y-8">
      <LeadsRealtime contractorId={contractor.id} />
      <ChatDrawer role="contractor" />

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Open jobs</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">{open.length}</p>
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

      {/* ---- Open jobs: posted by homeowners, pay the fee to apply ---- */}
      <section className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Open jobs <span className="text-stone-400">({open.length})</span>
          </h1>
          <p className="text-sm text-stone-500">
            Jobs homeowners posted in your categories. Apply to one and the
            homeowner reviews you. If they pick you, you get their contact.
          </p>
        </div>

        {open.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No open jobs right now. When a homeowner posts one in your categories
            ({(contractor.categories ?? []).join(", ") || "none set"}), it shows
            up here.
          </p>
        ) : (
          <ul className="space-y-3">
            {open.map((j) => {
              const fee = money(j.payout_amount);
              return (
                <li key={j.id} className="card space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-stone-900">
                      {iconFor(ISSUE_CATEGORIES, j.category)}{" "}
                      {labelFor(ISSUE_CATEGORIES, j.category)}
                    </span>
                    {j.issue_severity && (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${SEVERITY_STYLE[j.issue_severity] ?? ""}`}
                      >
                        {j.issue_severity}
                      </span>
                    )}
                    <span className="ml-auto text-sm font-semibold text-stone-700">
                      Apply fee {fee}
                    </span>
                  </div>

                  {j.issue_description && (
                    <p className="text-sm text-stone-600">
                      {j.issue_description}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-4 text-xs text-stone-500">
                    {j.timing && (
                      <span>Timing: {labelFor(TIMING_OPTIONS, j.timing)}</span>
                    )}
                    <span>
                      {j.application_count} applicant
                      {Number(j.application_count) === 1 ? "" : "s"} so far
                    </span>
                  </div>

                  <ApplyJobButton
                    leadId={j.id}
                    fee={fee}
                    canAfford={balance >= Number(j.payout_amount ?? 0)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---- Active jobs: ones the homeowner picked you for ---- */}
      <section className="space-y-3">
        <div>
          <h2 className="text-2xl font-semibold text-stone-900">
            Your jobs <span className="text-stone-400">({assigned.length})</span>
          </h2>
          <p className="text-sm text-stone-500">
            Jobs a homeowner chose you for. Their contact is unlocked and you can
            message them.
          </p>
        </div>

        {assigned.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No jobs yet. Apply to an open job above and a homeowner can pick you.
          </p>
        ) : (
          <ul className="space-y-3">
            {assigned.map((l) => (
              <AssignedJobCard key={l.id} l={l} />
            ))}
          </ul>
        )}
      </section>

      {/* ---- Applications still waiting on a homeowner's decision ---- */}
      {pendingApps.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900">
            Pending applications{" "}
            <span className="text-stone-400">({pendingApps.length})</span>
          </h2>
          <ul className="space-y-2">
            {pendingApps.map((a) => (
              <li
                key={a.application_id}
                className="card flex items-center justify-between gap-3"
              >
                <div>
                  <span className="font-medium text-stone-900">
                    {iconFor(ISSUE_CATEGORIES, a.category)}{" "}
                    {labelFor(ISSUE_CATEGORIES, a.category)}
                  </span>
                  {a.issue_description && (
                    <p className="text-sm text-stone-500">
                      {a.issue_description}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Waiting for homeowner
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {declinedApps.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900">
            Not selected{" "}
            <span className="text-stone-400">({declinedApps.length})</span>
          </h2>
          <ul className="space-y-2">
            {declinedApps.map((a) => (
              <li
                key={a.application_id}
                className="card flex items-center justify-between gap-3 opacity-70"
              >
                <span className="font-medium text-stone-700">
                  {iconFor(ISSUE_CATEGORIES, a.category)}{" "}
                  {labelFor(ISSUE_CATEGORIES, a.category)}
                </span>
                <span className="shrink-0 rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                  Homeowner chose another pro
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// A job the homeowner picked this pro for: contact revealed + chat + pipeline.
function AssignedJobCard({ l }: { l: any }) {
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
          {STATUS_LABEL[l.status] ?? l.status}
        </span>
      </div>

      {l.issue_description && (
        <p className="text-sm text-stone-600">{l.issue_description}</p>
      )}

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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <OpenChatButton
          leadId={l.id}
          name={l.homeowner_name || "Homeowner"}
          label="💬 Message"
        />
        <JobStatusSelect id={l.id} status={l.status} />
      </div>
    </li>
  );
}
