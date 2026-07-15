import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { hasProPlan } from "@/lib/subscription";
import ProToolsClient from "./ProToolsClient";

// AI back office (Hearth Pro membership perk): three writing tools that turn a
// pro's plain-words notes into paperwork they can send: an estimate, an
// invoice, and a follow-up message. Members get the working tools; everyone
// else gets a clear look at what's inside and a path to /pro/plus. Lead access
// is never involved here: this is perks-only surface.

const TOOLS: Array<{ icon: string; title: string; body: string }> = [
  {
    icon: "📋",
    title: "Estimate builder",
    body: "Describe the job in your own words and get back a clean written estimate: scope, line items, and terms, ready to send.",
  },
  {
    icon: "🧾",
    title: "Invoice writer",
    body: "Turn 'replaced the water heater, $1,450' into professional invoice text with a work summary and payment note.",
  },
  {
    icon: "✉️",
    title: "Follow-up writer",
    body: "The message you keep meaning to send: nudge a quiet quote, ask a happy customer for a review, or check in on past work.",
  },
];

export default async function ProToolsPage() {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const member = await hasProPlan();

  if (!member) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
            AI back office
          </h1>
          <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
            The paperwork side of the job, handled in seconds instead of
            evenings.
          </p>
        </div>

        <div className="rounded-xl border border-hearth-200 bg-hearth-50 p-4 text-center ring-1 ring-hearth-200 dark:border-hearth-800 dark:bg-hearth-900/40 dark:ring-hearth-800">
          <div className="mb-2 flex justify-center">
            <span aria-hidden="true" className="icon-chip">
              🔒
            </span>
          </div>
          <p className="text-sm font-medium text-hearth-800 dark:text-hearth-200">
            Pro membership tool
          </p>
          <p className="mt-1 text-sm text-hearth-700 dark:text-hearth-300">
            The AI back office is part of the Hearth Pro membership. Join to
            unlock all three tools, along with instant alerts and deposit
            bonuses.
          </p>
          <Link href="/pro/plus" className="btn-primary mt-3 inline-block">
            See Hearth Pro
          </Link>
        </div>

        <section className="grid gap-4 sm:grid-cols-1">
          {TOOLS.map((t) => (
            <div key={t.title} className="card">
              <div className="flex items-start gap-3">
                <div className="icon-chip">{t.icon}</div>
                <div>
                  <h2 className="font-semibold text-stone-900 dark:text-stone-100">
                    {t.title}{" "}
                    <span className="chip ml-1 border border-stone-200 bg-stone-50 text-stone-500 dark:border-white/10 dark:bg-stone-800 dark:text-stone-400">
                      🔒 Members
                    </span>
                  </h2>
                  <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{t.body}</p>
                </div>
              </div>
            </div>
          ))}
        </section>

        <p className="text-center text-xs text-stone-500 dark:text-stone-400">
          Membership never changes which jobs you can see or apply to. Leads
          stay pay-per-apply for everyone.
        </p>
      </div>
    );
  }

  // The estimate tool's "your past jobs" section, fed by uploads to
  // /api/pro-past-jobs. Fetched here (server side) and handed to the client
  // component as its starting list; ProToolsClient keeps its own copy in
  // state so an upload or a remove updates the screen immediately.
  const supabase = createClient();
  const { data: pastJobRows } = await supabase
    .from("pro_past_jobs")
    .select("*")
    .eq("contractor_id", contractor.id)
    .order("created_at", { ascending: false });

  // This pro's own leads, for the "Send to a lead" picker on a generated
  // draft. Only "lost" (declined) leads are excluded: a "closed" (won) lead
  // still has a live chat thread, and is exactly where an invoice or an
  // overdue-payment reminder is most likely to be sent. Most-recent first.
  const { data: leadRows } = await supabase
    .from("contractor_leads")
    .select("id, homeowner_name, category, status, created_at")
    .eq("contractor_id", contractor.id)
    .neq("status", "lost")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
          AI back office
        </h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Tell it about the job in plain words. It writes the paperwork, you
          look it over and send it.
        </p>
      </div>
      <ProToolsClient
        initialPastJobs={pastJobRows ?? []}
        categories={contractor.categories ?? []}
        leads={leadRows ?? []}
      />
      <p className="text-center text-xs text-stone-500 dark:text-stone-400">
        Drafts use only the details you type in. Always give them a quick read
        before sending.
      </p>
    </div>
  );
}
