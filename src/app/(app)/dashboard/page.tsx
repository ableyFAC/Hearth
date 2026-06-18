import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import {
  scoreBreakdown,
  scoreBand,
  derivedMaintenance,
} from "@/lib/health";
import {
  labelFor,
  iconFor,
  SYSTEM_TYPES,
  ISSUE_CATEGORIES,
  REMODEL_PROJECTS,
  categoryForSystem,
} from "@/lib/constants";

// Core systems we nudge every owner to add first — they drive the best predictions.
const CORE_SETUP = ["roof", "hvac", "water_heater", "electrical_panel", "plumbing"];

export default async function DashboardPage() {
  const property = (await getActiveProperty())!;
  const supabase = createClient();

  const [{ data: systems }, { data: issues }, { data: tasks }] =
    await Promise.all([
      supabase.from("home_systems").select("*").eq("property_id", property.id),
      supabase
        .from("issues")
        .select("*")
        .eq("property_id", property.id)
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      supabase
        .from("maintenance_tasks")
        .select("*")
        .eq("property_id", property.id)
        .eq("status", "open")
        .order("due_date", { ascending: true }),
    ]);

  const sys = systems ?? [];
  const openIssues = issues ?? [];
  const { score, lines: scoreLines } = scoreBreakdown(sys, openIssues);
  const band = scoreBand(score);
  const upcoming = derivedMaintenance(sys);

  const haveTypes = new Set(sys.map((s) => s.system_type));
  const setupItems = SYSTEM_TYPES.filter((t) =>
    CORE_SETUP.includes(t.value)
  ).map((t) => ({ ...t, done: haveTypes.has(t.value) }));
  const setupComplete = setupItems.every((i) => i.done);

  return (
    <div className="space-y-8">
      {!setupComplete && (
        <section className="card border-hearth-200 bg-hearth-50">
          <h2 className="font-semibold text-hearth-900">
            Finish setting up your home
          </h2>
          <p className="mt-1 text-sm text-hearth-800">
            Add your core systems so Hearth can predict repairs and score your
            home.
          </p>
          <ul className="mt-3 space-y-1.5">
            {setupItems.map((i) => (
              <li key={i.value} className="flex items-center gap-2 text-sm">
                <span>{i.done ? "✅" : "⬜"}</span>
                <span
                  className={
                    i.done ? "text-stone-400 line-through" : "text-stone-700"
                  }
                >
                  {i.icon} {i.label}
                </span>
                {!i.done && (
                  <Link
                    href="/profile"
                    className="ml-auto font-medium text-hearth-700 hover:underline"
                  >
                    Add →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className={`card border ${band.tone}`}>
          <p className="text-sm font-medium">Home Health Score</p>
          <p className="mt-1 text-4xl font-bold">{score}</p>
          <p className="text-sm">{band.label}</p>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer opacity-80 hover:opacity-100">
              Why this score?
            </summary>
            <ul className="mt-2 space-y-1">
              <li className="flex justify-between">
                <span>Starting score</span>
                <span className="font-medium">100</span>
              </li>
              {scoreLines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate capitalize">{l.label}</span>
                  <span className="font-medium">{l.points}</span>
                </li>
              ))}
              {scoreLines.length === 0 && (
                <li className="opacity-80">No deductions — all healthy. 🎉</li>
              )}
            </ul>
          </details>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Systems tracked</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">{sys.length}</p>
          <Link href="/profile" className="text-sm text-hearth-700 hover:underline">
            Manage profile →
          </Link>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Open issues</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">
            {openIssues.length}
          </p>
          <Link href="/issues" className="text-sm text-hearth-700 hover:underline">
            View issues →
          </Link>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">
          Upcoming maintenance
        </h2>
        {upcoming.length > 0 ? (
          <ul className="space-y-2">
            {upcoming.map((m) => (
              <li
                key={m.systemId}
                className="card flex items-center justify-between gap-4"
              >
                <div>
                  <span className="font-medium text-stone-900">
                    {iconFor(SYSTEM_TYPES, m.systemType)}{" "}
                    {labelFor(SYSTEM_TYPES, m.systemType)}
                  </span>
                  <p className="text-sm text-stone-600">{m.title}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      m.urgency === "due"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {m.urgency === "due" ? "Plan now" : "Aging"}
                  </span>
                  <Link
                    href={`/contractors?category=${categoryForSystem(m.systemType)}`}
                    className="text-xs font-medium text-hearth-700 hover:underline"
                  >
                    Find a pro →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            Nothing flagged yet. Add your systems in the{" "}
            <Link href="/profile" className="text-hearth-700 underline">
              Home Profile
            </Link>{" "}
            to get predictions.
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">
          Thinking about a project?
        </h2>
        <p className="text-sm text-stone-500">
          Popular upgrades — tap one to get matched with a vetted pro.
        </p>
        <div className="flex flex-wrap gap-2">
          {REMODEL_PROJECTS.map((p) => (
            <Link
              key={p.label}
              href={`/contractors?category=${p.category}`}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 shadow-sm hover:border-hearth-400 hover:text-hearth-700"
            >
              {p.icon} {p.label}
            </Link>
          ))}
        </div>
      </section>

      {tasks && tasks.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900">Your tasks</h2>
          <ul className="space-y-2">
            {tasks.map((t) => (
              <li key={t.id} className="card flex items-center justify-between">
                <span className="text-stone-800">{t.title}</span>
                <span className="text-xs text-stone-400">
                  {t.due_date ?? "no date"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openIssues.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900">Open issues</h2>
          <ul className="space-y-2">
            {openIssues.map((i) => (
              <li key={i.id} className="card flex items-center justify-between gap-4">
                <div>
                  <span className="font-medium text-stone-900">
                    {iconFor(ISSUE_CATEGORIES, i.category)}{" "}
                    {labelFor(ISSUE_CATEGORIES, i.category)}
                  </span>
                  {i.description && (
                    <p className="text-sm text-stone-600">{i.description}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-xs uppercase tracking-wide text-stone-400">
                    {i.severity}
                  </span>
                  <Link
                    href={`/contractors?category=${i.category}`}
                    className="text-xs font-medium text-hearth-700 hover:underline"
                  >
                    Find a pro →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
