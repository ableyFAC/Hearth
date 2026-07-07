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
import { planTitles } from "@/lib/maintenancePlan";
import SystemForm from "../profile/SystemForm";
import SystemRow from "../profile/SystemRow";
import SeasonalChecklist from "@/components/SeasonalChecklist";
import ChecklistProvider from "@/components/ChecklistProvider";
import ReminderItem from "./ReminderItem";
import HomeAlerts from "@/components/HomeAlerts";
import { estimateHomeValue, calculateEquity } from "@/lib/homeValue";
import {
  estimateSeasonalEnergyCost,
  estimateUpgradeSavings,
} from "@/lib/energy";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { welcome?: string; plan?: string };
}) {
  // "View my plan" lands here with ?plan=open so the collapsed task groups
  // start expanded, making the click visibly do something.
  const planOpen = searchParams.plan === "open";
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

  // Whether a maintenance plan already exists, so the CTA can switch from
  // "Build my plan" to "View my plan". Only plan-generated tasks count - a
  // manual reminder (say, from chat) must not hide "Build my plan" forever.
  const planTitleSet = planTitles();
  const hasOpenPlan = (tasks ?? []).some(
    (t) => t.status === "open" && planTitleSet.has(t.title)
  );

  // Group system photos by system id so each row can show its own thumbnails.
  const photosBySystem = new Map<string, string[]>();
  for (const p of pics ?? []) {
    const list = photosBySystem.get(p.related_id) ?? [];
    list.push(p.url);
    photosBySystem.set(p.related_id, list);
  }

  const sys = systems ?? [];
  const openIssues = issues ?? [];
  // Systems whose details are still an onboarding estimate (migration 0056:
  // confirmed_at null), powering the "walk your home" entry points below.
  const unconfirmedCount = sys.filter((s) => !s.confirmed_at).length;
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
    // Verb agreement for plural labels ("windows are", not "windows is"), and
    // show our work: when the call comes from age alone, say so.
    const plural = name.toLowerCase().endsWith("s");
    const verb = plural ? "are" : "is";
    const its = plural ? "their" : "its";
    const them = plural ? "them" : "it";
    const ageOnly = !isMust(s);
    const basedOnAge = ageOnly ? `, based on ${its} age` : "";
    briefing.push({
      text: must
        ? `Your ${name.toLowerCase()} ${verb} near the end of ${its} life${basedOnAge}. It is worth planning ahead.`
        : `Your ${name.toLowerCase()} ${verb} aging${basedOnAge}. Keep an eye on ${them}.`,
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

  // Purely presentational grouping so "This month" reads like an organized
  // plan (Overdue / Due soon / Later / Done) instead of a flat list. Doesn't
  // touch how tasks are generated, ordered in the query, or toggled.
  type ReminderRow = (typeof reminders)[number];
  type Urgency = "overdue" | "soon" | "later" | "done";
  const URGENCY_LABEL: Record<Urgency, string> = {
    overdue: "Overdue",
    soon: "Due soon",
    later: "Later",
    done: "Done",
  };
  const URGENCY_TONE: Record<Urgency, string> = {
    overdue: "text-red-600",
    soon: "text-amber-600",
    later: "text-stone-400",
    done: "text-stone-400",
  };
  function daysUntil(dateStr: string): number {
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return NaN;
    const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((due.getTime() - today.getTime()) / 86_400_000);
  }
  function urgencyFor(t: ReminderRow): Urgency {
    if (t.status === "done") return "done";
    if (!t.due_date) return "later";
    const days = daysUntil(t.due_date);
    if (Number.isNaN(days)) return "later";
    if (days < 0) return "overdue";
    if (days <= 14) return "soon";
    return "later";
  }
  const groupedReminders: Record<Urgency, ReminderRow[]> = {
    overdue: [],
    soon: [],
    later: [],
    done: [],
  };
  for (const t of reminders) groupedReminders[urgencyFor(t)].push(t);
  const URGENCY_ORDER: Urgency[] = ["overdue", "soon", "later", "done"];

  const remindersTotal = reminders.length;
  const remindersDone = groupedReminders.done.length;
  const seasonLabel = season.charAt(0).toUpperCase() + season.slice(1);

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

  // Home value & equity tile. purchase_price/mortgage_balance are new columns
  // (migration 0029) not yet in database.types.ts, so read off the row with a
  // cast rather than widening the generated types by hand; if the migration
  // hasn't run yet these just come back undefined and the tile shows the CTA.
  const rawProperty = property as any;
  const homeValuePurchasePrice: number | null =
    typeof rawProperty.purchase_price === "number" ? rawProperty.purchase_price : null;
  const homeValueMortgageBalance: number | null =
    typeof rawProperty.mortgage_balance === "number" ? rawProperty.mortgage_balance : null;
  const homeValuePurchaseYear: number | null = property.purchase_date
    ? Number(property.purchase_date.slice(0, 4)) || null
    : null;
  const hasHomeValueData =
    homeValuePurchasePrice != null && homeValuePurchaseYear != null;
  const homeEstimatedValue = hasHomeValueData
    ? estimateHomeValue(
        homeValuePurchasePrice!,
        homeValuePurchaseYear!,
        property.state,
        now.getFullYear()
      )
    : null;
  const homeEquity =
    homeEstimatedValue != null
      ? calculateEquity(homeEstimatedValue, homeValueMortgageBalance)
      : null;

  // Energy-this-season tile. Reuses data already on the page (property +
  // home_systems), no extra queries. Fall points at the coming winter and
  // spring at the coming summer, so the number is always about the bill the
  // owner is heading into, not one that already passed.
  const energySeason: "winter" | "summer" =
    season === "winter" || season === "fall" ? "winter" : "summer";
  const hvacSystem = sys.find((s) => s.system_type === "hvac") ?? null;
  // Numbers only make sense with a state (weather + prices) and at least one
  // real fact about the home; otherwise the tile nudges setup instead.
  const hasEnergyInputs =
    property.state != null &&
    (property.sqft != null || property.year_built != null || hvacSystem != null);
  const energyEstimate = hasEnergyInputs
    ? estimateSeasonalEnergyCost({
        sqft: property.sqft,
        yearBuilt: property.year_built,
        state: property.state,
        hvacInstallYear: hvacSystem?.install_year ?? null,
        hvacType: hvacSystem?.material_or_model ?? null,
        season: energySeason,
        currentYear: now.getFullYear(),
      })
    : null;
  // Non-null only for a 15+ year old HVAC (the lib enforces the threshold).
  const upgradeSavings =
    hasEnergyInputs && hvacSystem
      ? estimateUpgradeSavings({
          sqft: property.sqft,
          yearBuilt: property.year_built,
          state: property.state,
          hvacInstallYear: hvacSystem.install_year,
          hvacType: hvacSystem.material_or_model,
          currentYear: now.getFullYear(),
        })
      : null;

  return (
    <div className="space-y-8">
      {searchParams.welcome && (
        <div className="rounded-xl border border-hearth-200 bg-hearth-50 p-4 text-sm text-hearth-800">
          {sys.length > 0 ? (
            <>
              🎉 Your home is claimed. We started {sys.length} system
              {sys.length === 1 ? "" : "s"} with estimated details based on
              your home&apos;s age.{" "}
              <Link href="/walkthrough" className="font-medium underline">
                Walk your home
              </Link>{" "}
              and snap each data plate to swap the estimates for the real
              thing.
            </>
          ) : (
            <>
              🎉 Your home is claimed. Add your systems below. It&apos;s what
              powers your maintenance reminders and your Home Health Score.
            </>
          )}
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
      <section id="this-month" className="scroll-mt-20 space-y-3">
        <h2 className="flex items-center text-lg font-semibold text-stone-900">This month</h2>
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

          <div className="border-t border-stone-100 pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-stone-700">
                {remindersTotal > 0
                  ? `${remindersTotal} task${remindersTotal === 1 ? "" : "s"} on your plan`
                  : "No maintenance tasks yet"}
              </p>
              {remindersTotal > 0 && (
                <p className="text-xs text-stone-400">
                  {remindersDone} of {remindersTotal} done
                </p>
              )}
            </div>
            {remindersTotal > 0 && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{
                    width: `${Math.round((remindersDone / remindersTotal) * 100)}%`,
                  }}
                />
              </div>
            )}

            {/* Everything checked off: celebrate, then tee up the next round
                (rebuilding schedules fresh future dates for the same tasks). */}
            {remindersTotal > 0 && remindersDone === remindersTotal && (
              <div className="mt-3 flex flex-col items-start gap-2 rounded-lg bg-green-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-green-800">
                  🎉 All caught up. Your home thanks you.
                </p>
                {plus ? (
                  <form action={generateMaintenancePlanAction}>
                    <button className="text-sm font-medium text-green-700 hover:underline">
                      Plan my next round →
                    </button>
                  </form>
                ) : (
                  <Link
                    href="/plus?reason=plan"
                    className="text-sm font-medium text-green-700 hover:underline"
                  >
                    Plan my next round →
                  </Link>
                )}
              </div>
            )}

            <ChecklistProvider>
              <div className="mt-3 space-y-4">
                {/* Near-term work stays in view; everything further out folds
                    into collapsed groups so the card shows a handful of tasks,
                    not a wall. */}
                {(["overdue", "soon"] as Urgency[])
                  .filter((u) => groupedReminders[u].length > 0)
                  .map((u) => (
                    <div key={u}>
                      <p
                        className={`px-2 text-xs font-semibold uppercase tracking-wide ${URGENCY_TONE[u]}`}
                      >
                        {URGENCY_LABEL[u]} ({groupedReminders[u].length})
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {groupedReminders[u].map((t) => (
                          <ReminderItem
                            key={t.id}
                            id={t.id}
                            title={t.title}
                            due={t.due_date}
                            initialDone={t.status === "done"}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}

                {(["later", "done"] as Urgency[])
                  .filter((u) => groupedReminders[u].length > 0)
                  .map((u) => (
                    <details key={u} open={planOpen} className="group">
                      <summary
                        className={`cursor-pointer list-none [&::-webkit-details-marker]:hidden px-2 text-xs font-semibold uppercase tracking-wide ${URGENCY_TONE[u]}`}
                      >
                        <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                          ▸
                        </span>
                        {URGENCY_LABEL[u]} ({groupedReminders[u].length})
                      </summary>
                      <ul className="mt-1 space-y-0.5">
                        {groupedReminders[u].map((t) => (
                          <ReminderItem
                            key={t.id}
                            id={t.id}
                            title={t.title}
                            due={t.due_date}
                            initialDone={t.status === "done"}
                          />
                        ))}
                      </ul>
                    </details>
                  ))}

                <details open={planOpen || remindersTotal === 0} className="group">
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
                    <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    Seasonal, {seasonLabel} ({SEASONAL_TASKS[season].length})
                  </summary>
                  <ul className="mt-1 space-y-0.5">
                    <SeasonalChecklist
                      period={monthKey}
                      tasks={SEASONAL_TASKS[season]}
                    />
                  </ul>
                </details>
              </div>
            </ChecklistProvider>

            {/* Nudge toward the walkthrough while any system still carries an
                onboarding estimate instead of a confirmed real fact. Folded in
                here rather than a standalone section, same as Warranties
                below. */}
            {unconfirmedCount > 0 && (
              <div className="mt-4 border-t border-stone-100 pt-3">
                <p className="text-sm font-medium text-stone-700">
                  Confirm your home&apos;s details
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {unconfirmedCount} system{unconfirmedCount === 1 ? "" : "s"}{" "}
                  still {unconfirmedCount === 1 ? "has" : "have"} estimated
                  details. It makes every answer smarter.
                </p>
                <Link
                  href="/walkthrough"
                  className="mt-1.5 inline-block text-sm font-medium text-hearth-700 hover:underline"
                >
                  Walk your home →
                </Link>
              </div>
            )}

            {/* Warranties from the documents vault, folded in as a compact
                sub-block under this month's tasks instead of a standalone
                section further down the page. */}
            {warranties.length > 0 && (
              <div className="mt-4 border-t border-stone-100 pt-3">
                <p className="text-sm font-medium text-stone-700">
                  Warranties ({warranties.length})
                </p>
                <ul className="mt-1.5 divide-y divide-stone-100">
                  {warranties.map((w) => (
                    <li
                      key={w.id}
                      className="flex items-center justify-between gap-3 py-1.5 first:pt-0"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm text-stone-800">
                        <span>
                          {w.system_type ? iconFor(SYSTEM_TYPES, w.system_type) : "📄"}
                        </span>
                        <span className="truncate">{w.title ?? "Home document"}</span>
                      </span>
                      <span
                        className={`chip shrink-0 ${
                          w.days <= 60
                            ? "bg-amber-100 text-amber-700"
                            : "bg-stone-100 text-stone-500"
                        }`}
                      >
                        {warrantyLeft(w.days)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-stone-400">
                  Pulled from your{" "}
                  <Link href="/documents" className="text-hearth-700 hover:underline">
                    documents
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Hearth Plus: one cohesive "plan ahead" block (plan + premium tools) */}
      <section className="space-y-3">
        <h2 className="flex items-center text-lg font-semibold text-stone-900">
          {plus ? "Your Hearth Plus tools" : "Plan ahead with Hearth Plus"}
        </h2>
        <div className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="icon-chip text-xl">
              🗓️
            </span>
            <div>
              <h2 className="text-lg font-semibold text-stone-900">
                Build my maintenance plan
              </h2>
              <p className="mt-1 text-sm text-stone-500">
                Upkeep reminders timed to your home&apos;s systems, a few at a
                time so it never feels like a chore.
              </p>
            </div>
          </div>
          {plus ? (
            hasOpenPlan ? (
              <Link
                href="/dashboard?plan=open#this-month"
                className="btn-primary whitespace-nowrap text-center"
              >
                View my plan
              </Link>
            ) : (
              <form action={generateMaintenancePlanAction}>
                <button className="btn-primary whitespace-nowrap">
                  Build my plan
                </button>
              </form>
            )
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
              <p className="icon-chip">{t.icon}</p>
              <p className="mt-1 font-medium text-stone-900">
                {t.title}
                {!plus && (
                  <span className="chip ml-1.5 bg-hearth-100 text-hearth-700">
                    Plus
                  </span>
                )}
                {!plus && t.title === "Quote analyzer" && (
                  <span className="chip ml-1.5 bg-green-100 text-green-700">
                    1 free
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm text-stone-500">{t.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Key stats */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`card-hero border ${band.tone}`}>
          <p className="stat-label">Home Health Score</p>
          <p className="stat-number mt-1 text-4xl">{score}</p>
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
          <p className="stat-label">Open jobs</p>
          <p className="stat-number mt-1 text-2xl">
            {openJobsCount}
          </p>
          <Link
            href="/contractors"
            className="text-sm text-hearth-700 hover:underline"
          >
            View job postings →
          </Link>
        </div>
        <Link
          href="/value"
          className="card block transition-colors hover:border-hearth-400"
        >
          <p className="stat-label">Home value</p>
          {hasHomeValueData && homeEstimatedValue != null ? (
            <>
              <p className="stat-number mt-1 text-2xl">
                ${Math.round(homeEstimatedValue).toLocaleString()}
              </p>
              <p className="text-sm text-stone-500">
                {homeEquity != null && homeEquity < 0
                  ? `-$${Math.round(Math.abs(homeEquity)).toLocaleString()} equity (underwater)`
                  : `$${Math.round(homeEquity ?? 0).toLocaleString()} equity`}
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                Track your home&apos;s value
              </p>
              <p className="text-sm text-stone-500">
                See what your home is likely worth today and how much equity
                you have.
              </p>
            </>
          )}
        </Link>
        <div className="card">
          <p className="stat-label">
            Energy this season
          </p>
          {energyEstimate ? (
            <>
              <p className="stat-number mt-1 text-2xl">
                ~${energyEstimate.low.toLocaleString()}-
                {energyEstimate.high.toLocaleString()}
              </p>
              <p className="text-sm text-stone-500">
                {energySeason === "winter"
                  ? "to keep warm this winter"
                  : "to stay cool this summer"}
              </p>
              {upgradeSavings &&
                (plus ? (
                  <Link
                    href="/forecast"
                    className="mt-1 block text-xs text-hearth-700 hover:underline"
                  >
                    Your HVAC is {upgradeSavings.hvacAge} years old. A new unit
                    could save ~${upgradeSavings.low.toLocaleString()}-
                    {upgradeSavings.high.toLocaleString()}/yr →
                  </Link>
                ) : (
                  <Link
                    href="/plus?reason=forecast"
                    className="mt-1 block text-xs text-hearth-700 hover:underline"
                  >
                    See what a new unit would save →
                  </Link>
                ))}
            </>
          ) : (
            <>
              <p className="mt-1 text-lg font-semibold text-stone-900">
                Estimate your energy bills
              </p>
              <p className="text-sm text-stone-500">
                Add your home&apos;s state and square footage to see what
                heating and cooling likely cost.
              </p>
              <Link
                href="/profile"
                className="text-sm text-hearth-700 hover:underline"
              >
                Finish your home profile →
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Systems inventory (the old Home Profile) */}
      <details id="systems" open className="space-y-4">
        <summary className="w-fit cursor-pointer text-lg font-semibold text-stone-900 marker:text-stone-400">
          Your systems{sortedSys.length > 0 ? ` (${sortedSys.length})` : ""}
          {mustCount > 0 ? (
            <span className="chip ml-2 border border-red-300 bg-red-100 text-red-700">
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
          <div className="rounded-xl border border-dashed border-stone-300 p-6 text-center">
            <div className="flex justify-center">
              <span className="icon-chip">🏠</span>
            </div>
            <p className="mt-2 text-sm text-stone-500">
              No systems yet. Add your roof, HVAC, and water heater first. Those
              drive the most useful reminders.
            </p>
          </div>
        )}

        <SystemForm propertyId={property.id} />
      </details>

      {/* Project ideas - always open, not collapsible. */}
      <section className="space-y-3">
        <h2 className="flex items-center text-lg font-semibold text-stone-900">
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
