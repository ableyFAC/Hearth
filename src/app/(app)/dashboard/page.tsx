import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { hasPlus } from "@/lib/subscription";
import { generateMaintenancePlanAction } from "./actions";
import {
  scoreBreakdown,
  scoreBand,
  systemPriority,
  assessSystem,
} from "@/lib/health";
import {
  REMODEL_PROJECTS,
  categoryForSystem,
  labelFor,
  iconFor,
  SYSTEM_TYPES,
  ISSUE_CATEGORIES,
  SEASONAL_TASKS,
  seasonForMonth,
} from "@/lib/constants";
import SystemForm from "../profile/SystemForm";
import SystemRow from "../profile/SystemRow";
import SeasonalChecklist from "@/components/SeasonalChecklist";
import ChecklistProvider from "@/components/ChecklistProvider";
import ReminderItem from "./ReminderItem";
import HomeAlerts from "@/components/HomeAlerts";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { welcome?: string };
}) {
  const property = (await getActiveProperty())!;
  const supabase = createClient();
  const plus = await hasPlus();

  const [
    { data: systems },
    { data: issues },
    { data: tasks },
    { data: pics },
    { data: jobs },
    { data: docs },
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
      .in("status", ["open", "done"])
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
    supabase
      .from("documents")
      .select("id, title, warranty_expires, system_type")
      .eq("property_id", property.id)
      .not("warranty_expires", "is", null)
      .order("warranty_expires", { ascending: true }),
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
  const isMust = (s: any) =>
    s.condition_rating === 1 || issueForSystem(s)?.severity === "urgent";
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

  // Seasonal task content, but the checklist resets per month (year-month key).
  const now = new Date();
  const season = seasonForMonth(now.getMonth());
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Proactive briefing: the top few things Hearth would flag right now, ranked
  // the same way the systems list is - open issues first (urgent on top), then
  // systems past/near their life, then aging ones, with a seasonal nudge to
  // round it out. Each item carries a prefilled action so it's one tap to act.
  type Brief = { text: string; href: string | null; cta: string };
  const briefing: Brief[] = [];
  const seenCat = new Set<string>();

  const issuesByUrgency = [...openIssues].sort(
    (a, b) =>
      (b.severity === "urgent" ? 1 : 0) - (a.severity === "urgent" ? 1 : 0)
  );
  for (const i of issuesByUrgency) {
    if (briefing.length >= 3) break;
    // One line per category so two open issues of the same kind cannot produce
    // two near-identical briefing items.
    if (seenCat.has(i.category)) continue;
    const name = labelFor(ISSUE_CATEGORIES, i.category);
    const desc =
      `Need help with a ${name} issue.` +
      (i.description ? ` ${i.description}` : "");
    briefing.push({
      text:
        (i.severity === "urgent" ? "⚠️ Urgent. " : "") +
        `Your ${name.toLowerCase()} issue needs attention.`,
      href:
        `/contractors?category=${i.category}` +
        `&desc=${encodeURIComponent(desc)}` +
        (i.severity === "urgent" ? "&timing=asap" : ""),
      cta: "Find a pro",
    });
    seenCat.add(i.category);
  }

  for (const s of sortedSys) {
    if (briefing.length >= 3) break;
    const cat = categoryForSystem(s.system_type);
    if (seenCat.has(cat)) continue;
    const h = assessSystem(s);
    const must = isMust(s) || h.stage === "due";
    if (!must && h.stage !== "aging") continue;
    const name = labelFor(SYSTEM_TYPES, s.system_type);
    const desc =
      `Need help with my ${name}.` +
      (s.install_year ? ` Installed ${s.install_year}.` : "") +
      (s.material_or_model ? ` Material/model: ${s.material_or_model}.` : "") +
      (s.condition_rating
        ? ` I rated its condition ${s.condition_rating} of 5.`
        : "");
    const urgent = s.condition_rating != null && s.condition_rating <= 2;
    briefing.push({
      text: must
        ? `Your ${name.toLowerCase()} is near the end of its life. It is worth planning ahead.`
        : `Your ${name.toLowerCase()} is aging. Keep an eye on it.`,
      href:
        `/contractors?category=${cat}` +
        `&desc=${encodeURIComponent(desc)}` +
        (urgent ? "&timing=asap" : ""),
      cta: must ? "Plan it" : "Learn more",
    });
    seenCat.add(cat);
  }

  // If nothing urgent surfaced, point them at the seasonal checklist below
  // rather than repeating one of its tasks verbatim in the briefing.
  if (briefing.length === 0) {
    briefing.push({
      text: "Nothing urgent right now. Knock out this month's seasonal tasks below. ✅",
      href: null,
      cta: "",
    });
  }

  // Reminders: open ones always; a done (crossed-out) one lingers for 30 days
  // after it was COMPLETED, then drops off. Measure from completed_at (falling
  // back to created_at for older rows) so a task you just finished doesn't
  // vanish because it was created long ago.
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const reminders = (tasks ?? []).filter(
    (t) =>
      t.status === "open" ||
      (t.status === "done" &&
        nowMs - new Date(t.completed_at ?? t.created_at).getTime() <
          THIRTY_DAYS)
  );

  // Upcoming warranties from the documents vault, soonest first, so the owner
  // hears about coverage before it lapses.
  const todayStr = new Date().toISOString().slice(0, 10);
  const warranties = (docs ?? [])
    .filter((d) => d.warranty_expires && d.warranty_expires >= todayStr)
    .map((d) => {
      const w = d.warranty_expires as string;
      const days = Math.max(
        0,
        Math.ceil(
          (new Date(w + "T00:00:00").getTime() - Date.now()) / 86_400_000
        )
      );
      return { id: d.id, title: d.title, system_type: d.system_type, days };
    });
  const warrantyLeft = (days: number) =>
    days <= 60
      ? `${days} day${days === 1 ? "" : "s"} left`
      : `about ${Math.round(days / 30)} months left`;

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

      {/* Proactive weather + safety-recall alerts; self-hides when there's none */}
      <HomeAlerts />

      {/* This month: focus + one merged checklist (reminders + seasonal) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">This month</h2>
        <div className="card space-y-3">
          <div className="rounded-lg bg-hearth-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-hearth-700">
              ✨ Hearth&apos;s briefing
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {briefing.map((b, i) => (
                <li key={i} className="text-sm text-stone-900">
                  <span className="text-hearth-700">•</span> {b.text}
                  {b.href && (
                    <Link
                      href={b.href}
                      className="ml-1 font-medium text-hearth-700 hover:underline"
                    >
                      {b.cta} →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <ChecklistProvider>
            <ul className="space-y-2 border-t border-stone-100 pt-3">
              {reminders.map((t) => (
                <ReminderItem
                  key={t.id}
                  id={t.id}
                  title={t.title}
                  due={t.due_date}
                  initialDone={t.status === "done"}
                />
              ))}
              <SeasonalChecklist
                period={monthKey}
                tasks={SEASONAL_TASKS[season]}
              />
            </ul>
          </ChecklistProvider>
        </div>
      </section>

      {/* Upcoming warranties from the documents vault */}
      {warranties.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-stone-900">Warranties</h2>
          <div className="card space-y-2">
            {warranties.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span>
                    {w.system_type ? iconFor(SYSTEM_TYPES, w.system_type) : "📄"}
                  </span>
                  <span className="truncate text-sm text-stone-800">
                    {w.title ?? "Home document"}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    w.days <= 60
                      ? "bg-amber-100 text-amber-700"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {warrantyLeft(w.days)}
                </span>
              </div>
            ))}
            <p className="pt-1 text-xs text-stone-400">
              Pulled from your{" "}
              <Link href="/documents" className="text-hearth-700 hover:underline">
                documents
              </Link>
              .
            </p>
          </div>
        </section>
      )}

      {/* Hearth Plus: one cohesive "plan ahead" block (plan + premium tools) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-stone-900">
          Plan ahead with Hearth Plus
        </h2>
        <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-stone-900">
              Build my maintenance plan
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Hearth lines up a full year of upkeep reminders tailored to your
              home.
            </p>
          </div>
          {plus ? (
            <form action={generateMaintenancePlanAction}>
              <button className="btn-primary whitespace-nowrap">
                Build my plan
              </button>
            </form>
          ) : (
            <Link
              href="/plus?reason=plan"
              className="btn-primary whitespace-nowrap text-center"
            >
              Get my maintenance plan
            </Link>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              href: plus ? "/forecast" : "/plus?reason=forecast",
              icon: "📈",
              title: "Cost forecast",
              desc: "See what will need replacing and the amount to set aside each month.",
            },
            {
              href: plus ? "/quote-check" : "/plus?reason=quote",
              icon: "🔍",
              title: "Quote analyzer",
              desc: "Snap a contractor's quote and check whether the price is fair.",
            },
            {
              href: plus ? "/home-report" : "/plus?reason=report",
              icon: "📋",
              title: "Home report",
              desc: "A shareable record of your home for insurance and resale.",
            },
          ].map((t) => (
            <Link
              key={t.title}
              href={t.href}
              className="card block transition-colors hover:border-hearth-400"
            >
              <p className="text-2xl">{t.icon}</p>
              <p className="mt-1 font-medium text-stone-900">
                {t.title}
                {!plus && (
                  <span className="ml-1.5 rounded-full bg-hearth-100 px-1.5 py-0.5 text-[10px] font-semibold text-hearth-700">
                    Plus
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-stone-500">{t.desc}</p>
            </Link>
          ))}
        </div>
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

    </div>
  );
}
