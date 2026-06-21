import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import {
  scoreBreakdown,
  scoreBand,
  systemPriority,
  assessSystem,
} from "@/lib/health";
import { REMODEL_PROJECTS, categoryForSystem } from "@/lib/constants";
import SystemForm from "../profile/SystemForm";
import SystemRow from "../profile/SystemRow";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { welcome?: string };
}) {
  const property = (await getActiveProperty())!;
  const supabase = createClient();

  const [
    { data: systems },
    { data: issues },
    { data: tasks },
    { data: pics },
    { data: jobs },
  ] = await Promise.all([
    supabase
      .from("home_systems")
      .select("*")
      .eq("property_id", property.id)
      .order("created_at", { ascending: true }),
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
    supabase
      .from("photos")
      .select("related_id, url")
      .eq("property_id", property.id)
      .eq("related_type", "system"),
    supabase
      .from("contractor_leads")
      .select("id, contractor_id")
      .eq("property_id", property.id),
  ]);

  // Open jobs = postings the owner has put up that no pro has been picked for yet.
  const openJobsCount = (jobs ?? []).filter((j) => !j.contractor_id).length;

  // Group system photos by system id so each row can show its own thumbnails.
  const photosBySystem = new Map<string, string[]>();
  for (const p of pics ?? []) {
    const list = photosBySystem.get(p.related_id) ?? [];
    list.push(p.url);
    photosBySystem.set(p.related_id, list);
  }

  const sys = systems ?? [];
  const openIssues = issues ?? [];
  const { score, lines: scoreLines } = scoreBreakdown(sys, openIssues);
  const band = scoreBand(score);

  // Link reported issues to systems by category - a reported roof issue shows on
  // the roof system and pushes it to the top.
  const openIssueByCat = new Map<string, any>();
  for (const i of openIssues) {
    if (!openIssueByCat.has(i.category)) openIssueByCat.set(i.category, i);
  }
  const issueForSystem = (s: any) =>
    openIssueByCat.get(categoryForSystem(s.system_type)) ?? null;

  // Order: must-do (failing or reported issue) pinned to the very top, then by
  // maintenance status - needs maintenance (due), then plan ahead (aging), then
  // healthy, then unknown. systemPriority breaks ties within a stage.
  const isMust = (s: any) => s.condition_rating === 1 || !!issueForSystem(s);
  const STAGE_RANK: Record<string, number> = {
    due: 3,
    aging: 2,
    healthy: 1,
    unknown: 0,
  };
  const sortedSys = [...sys].sort((a, b) => {
    const mustDiff = (isMust(b) ? 1 : 0) - (isMust(a) ? 1 : 0);
    if (mustDiff !== 0) return mustDiff;
    const stageDiff =
      (STAGE_RANK[assessSystem(b).stage] ?? 0) -
      (STAGE_RANK[assessSystem(a).stage] ?? 0);
    if (stageDiff !== 0) return stageDiff;
    return systemPriority(b) - systemPriority(a);
  });

  const mustCount = sortedSys.filter(isMust).length;

  return (
    <div className="space-y-8">
      {searchParams.welcome && (
        <div className="rounded-xl border border-hearth-200 bg-hearth-50 p-4 text-sm text-hearth-800">
          🎉 Your home is claimed. Add your systems below. It&apos;s what powers
          your maintenance reminders and your Home Health Score.
        </div>
      )}

      {/* Property header */}
      <section>
        <h1 className="text-2xl font-semibold text-stone-900">
          🏡 {property.address_line1}
          {property.city ? `, ${property.city}` : ""}
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Built {property.year_built ?? "-"} · {property.sqft ?? "-"} sqft ·{" "}
          {property.beds ?? "-"} bd / {property.baths ?? "-"} ba
        </p>
      </section>

      {/* Key stats */}
      <section className="grid gap-4 sm:grid-cols-2">
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
                <li className="opacity-80">No deductions. Everything looks healthy. 🎉</li>
              )}
            </ul>
          </details>
        </div>
        <div className="card">
          <p className="text-sm font-medium text-stone-500">Open jobs</p>
          <p className="mt-1 text-4xl font-bold text-stone-900">
            {openJobsCount}
          </p>
          <Link
            href="/contractors"
            className="text-sm text-hearth-700 hover:underline"
          >
            View job postings →
          </Link>
        </div>
      </section>

      {/* Systems inventory (the old Home Profile) */}
      <details id="systems" open className="space-y-4">
        <summary className="w-fit cursor-pointer text-lg font-semibold text-stone-900 marker:text-stone-400">
          Your systems{sortedSys.length > 0 ? ` (${sortedSys.length})` : ""}
          {mustCount > 0 ? (
            <span className="ml-2 rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              {mustCount} must do
            </span>
          ) : null}
        </summary>

        {sortedSys.length > 0 ? (
          <ul className="space-y-3">
            {sortedSys.map((s) => (
              <SystemRow
                key={s.id}
                system={s}
                openIssue={issueForSystem(s)}
                photos={photosBySystem.get(s.id) ?? []}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            No systems yet. Add your roof, HVAC, and water heater first. Those
            drive the most useful reminders.
          </p>
        )}

        <SystemForm propertyId={property.id} />
      </details>

      {/* Project ideas - always open, not collapsible. */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">
          Thinking about a project?
        </h2>
        <p className="text-sm text-stone-500">
          Popular upgrades. Tap one to get matched with a vetted pro.
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
          <Link
            href="/contractors?category=other"
            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700 shadow-sm hover:border-hearth-400 hover:text-hearth-700"
          >
            🔧 Other
          </Link>
        </div>
      </section>

      {tasks && tasks.length > 0 && (
        <details className="space-y-3">
          <summary className="w-fit cursor-pointer text-lg font-semibold text-stone-900 marker:text-stone-400">
            Your tasks ({tasks.length})
          </summary>
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
        </details>
      )}
    </div>
  );
}
