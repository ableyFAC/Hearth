import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { labelFor, JOB_CATEGORIES } from "@/lib/constants";
import CategoryIcon from "@/components/CategoryIcon";
import { MapPin, Lock } from "lucide-react";

const SEVERITY_STYLE: Record<string, string> = {
  low: "border-stone-200 bg-stone-50 text-stone-600 dark:border-white/10 dark:bg-stone-800 dark:text-stone-300",
  medium: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  urgent: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
};

// Public - no account needed. Shows that demand exists; contact is locked.
export default async function PreviewPage() {
  const supabase = createClient();
  const { data: previews } = await supabase
    .from("lead_previews")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(24);

  const leads = previews ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Available leads near you
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          {leads.length} open {leads.length === 1 ? "job" : "jobs"} homeowners
          want quotes on. Create a free account to see contact details and claim
          them.
        </p>
        <Link href="/contractor-signup" className="btn-primary mt-4 inline-flex">
          Create a free account to access leads
        </Link>
      </div>

      {leads.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500 dark:border-stone-600 dark:text-stone-400">
          No open leads right now. Check back soon.
        </p>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {leads.map((l) => (
            <div key={l.id} className="card space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-stone-900 dark:text-stone-100">
                  <CategoryIcon
                    list={JOB_CATEGORIES}
                    value={l.category}
                    className="mr-1 inline-block h-4 w-4 align-[-3px]"
                  />
                  {labelFor(JOB_CATEGORIES, l.category)}
                </span>
                {l.severity && (
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${SEVERITY_STYLE[l.severity] ?? ""}`}
                  >
                    {l.severity}
                  </span>
                )}
                {l.lead_fee != null && (
                  <span className="ml-auto text-sm font-semibold text-stone-700 dark:text-stone-300">
                    ${Number(l.lead_fee).toFixed(0)}
                  </span>
                )}
              </div>
              <p className="flex items-center gap-1 text-sm text-stone-600 dark:text-stone-400">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {l.area || "Your area"}
              </p>
              {/* Locked contact */}
              <div className="flex items-center gap-2 rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Homeowner contact -{" "}
                <Link href="/contractor-signup" className="text-hearth-700 hover:underline dark:text-hearth-300">
                  sign up to unlock
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
