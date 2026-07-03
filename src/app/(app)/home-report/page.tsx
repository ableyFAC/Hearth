import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { hasPlus } from "@/lib/subscription";
import { labelFor, iconFor, SYSTEM_TYPES, ISSUE_CATEGORIES } from "@/lib/constants";
import { assessSystem } from "@/lib/health";
import PrintButton from "@/components/PrintButton";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Format a YYYY-MM-DD date string as "Mar 5, 2028", timezone-safe (no Date
// parsing of a bare date string, which JS treats as UTC and can shift a day).
function fmtDate(d: string | null): string | null {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const mon = MONTHS[Number(m[2]) - 1];
  return mon ? `${mon} ${Number(m[3])}, ${m[1]}` : d;
}

// Format a timestamptz column (uploaded_at, completed_at, created_at) as a
// readable date. These carry a full timestamp already, so a plain Date parse
// is safe here (unlike the bare "new Date()" with no arguments).
function fmtTimestamp(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const DOC_TYPE_LABEL: Record<string, string> = {
  warranty: "Warranty",
  manual: "Manual",
  receipt: "Receipt",
  inspection_report: "Inspection",
  other: "Document",
};

const CONDITION_LABEL: Record<number, string> = {
  5: "Like new",
  4: "Good",
  3: "Fair",
  2: "Worn",
  1: "Failing",
};

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  urgent: "Urgent",
};

export default async function HomeReportPage() {
  if (!(await hasPlus())) redirect("/plus?reason=report");

  const property = (await getActiveProperty())!;
  const supabase = createClient();

  const [
    { data: systems },
    { data: documents },
    { data: tasks },
    { data: issues },
  ] = await Promise.all([
    supabase
      .from("home_systems")
      .select("*")
      .eq("property_id", property.id)
      .order("system_type", { ascending: true }),
    supabase
      .from("documents")
      .select("id, title, doc_type, brand, model, install_year, warranty_expires, uploaded_at")
      .eq("property_id", property.id)
      .order("uploaded_at", { ascending: false }),
    supabase
      .from("maintenance_tasks")
      .select("id, title, due_date, status, completed_at, created_at")
      .eq("property_id", property.id)
      .order("due_date", { ascending: false }),
    supabase
      .from("issues")
      .select("id, category, severity, description, status, created_at")
      .eq("property_id", property.id)
      .order("created_at", { ascending: false }),
  ]);

  const sys = systems ?? [];
  const docs = documents ?? [];
  const allTasks = tasks ?? [];
  const allIssues = issues ?? [];

  // Completed tasks: most recently finished first. Upcoming tasks: soonest
  // due first, since that's the order that actually matters to a reader.
  const completedTasks = allTasks
    .filter((t) => t.status === "done")
    .sort(
      (a, b) =>
        new Date(b.completed_at ?? b.created_at).getTime() -
        new Date(a.completed_at ?? a.created_at).getTime()
    );
  const upcomingTasks = allTasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });

  const reportDate = new Date(Date.now()).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const addressLine = [property.city, property.state].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      {/* Header */}
      <header className="mb-8 border-b border-stone-200 pb-6 print:border-black">
        <h1 className="text-3xl font-semibold text-stone-900">Home Report</h1>
        <p className="mt-2 text-lg text-stone-700">
          {property.address_line1}
          {addressLine ? `, ${addressLine}` : ""}
          {property.zip ? ` ${property.zip}` : ""}
        </p>
        <p className="mt-1 text-sm text-stone-500">
          Built {property.year_built ?? "year unknown"} · Report generated{" "}
          {reportDate}
        </p>
      </header>

      {/* Systems */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold text-stone-900">
          Home systems
        </h2>
        {sys.length === 0 ? (
          <p className="text-sm text-stone-500">None recorded yet.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-left text-stone-500">
                <th className="py-2 pr-3 font-medium">System</th>
                <th className="py-2 pr-3 font-medium">Brand / model</th>
                <th className="py-2 pr-3 font-medium">Install year</th>
                <th className="py-2 pr-3 font-medium">Age</th>
                <th className="py-2 font-medium">Condition</th>
              </tr>
            </thead>
            <tbody>
              {sys.map((s) => {
                const health = assessSystem(s);
                return (
                  <tr key={s.id} className="border-b border-stone-100">
                    <td className="py-2 pr-3 text-stone-800">
                      {iconFor(SYSTEM_TYPES, s.system_type)}{" "}
                      {labelFor(SYSTEM_TYPES, s.system_type)}
                    </td>
                    <td className="py-2 pr-3 text-stone-600">
                      {s.material_or_model || "-"}
                    </td>
                    <td className="py-2 pr-3 text-stone-600">
                      {s.install_year ?? "-"}
                    </td>
                    <td className="py-2 pr-3 text-stone-600">
                      {health.age != null ? `${health.age} yrs` : "-"}
                    </td>
                    <td className="py-2 text-stone-600">
                      {s.condition_rating
                        ? CONDITION_LABEL[s.condition_rating] ?? "-"
                        : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* Documents */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold text-stone-900">
          Documents on file
        </h2>
        {docs.length === 0 ? (
          <p className="text-sm text-stone-500">None recorded yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <span className="text-stone-800">
                  {d.title || "Home document"}
                  <span className="ml-2 text-xs text-stone-400">
                    {DOC_TYPE_LABEL[d.doc_type ?? "other"] ?? "Document"}
                  </span>
                </span>
                <span className="text-xs text-stone-500">
                  {d.warranty_expires
                    ? `Warranty to ${fmtDate(d.warranty_expires)} · `
                    : ""}
                  Added {fmtTimestamp(d.uploaded_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Maintenance history */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold text-stone-900">
          Maintenance history
        </h2>

        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Completed
        </h3>
        {completedTasks.length === 0 ? (
          <p className="mb-4 text-sm text-stone-500">None recorded yet.</p>
        ) : (
          <ul className="mb-4 divide-y divide-stone-100">
            {completedTasks.map((t) => (
              <li key={t.id} className="flex justify-between gap-2 py-2 text-sm">
                <span className="text-stone-800">{t.title}</span>
                <span className="text-xs text-stone-500">
                  {fmtTimestamp(t.completed_at ?? t.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-stone-500">
          Upcoming
        </h3>
        {upcomingTasks.length === 0 ? (
          <p className="text-sm text-stone-500">None recorded yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {upcomingTasks.map((t) => (
              <li key={t.id} className="flex justify-between gap-2 py-2 text-sm">
                <span className="text-stone-800">{t.title}</span>
                <span className="text-xs text-stone-500">
                  {t.due_date ? fmtDate(t.due_date) : "No due date"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Repairs / issues log */}
      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold text-stone-900">
          Repairs &amp; issue log
        </h2>
        {allIssues.length === 0 ? (
          <p className="text-sm text-stone-500">None recorded yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {allIssues.map((i) => (
              <li key={i.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-stone-800">
                    {labelFor(ISSUE_CATEGORIES, i.category)}
                    <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500 print:border print:border-stone-300 print:bg-white">
                      {SEVERITY_LABEL[i.severity] ?? i.severity}
                    </span>
                    <span className="ml-2 text-xs text-stone-400">
                      {i.status === "resolved" ? "Resolved" : "Open"}
                    </span>
                  </span>
                  <span className="text-xs text-stone-500">
                    {fmtTimestamp(i.created_at)}
                  </span>
                </div>
                {i.description && (
                  <p className="mt-1 text-stone-600">{i.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-10 border-t border-stone-200 pt-4 text-xs text-stone-400 print:border-black">
        Generated by Hearth. Share with buyers or your insurer.
      </footer>
    </div>
  );
}
