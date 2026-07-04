import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";

export const runtime = "nodejs";

// Daily job (Vercel Cron, see vercel.json) that reminds homeowners about open
// maintenance tasks coming due within the next 3 days or already overdue.
//
// Two rules keep it from becoming noise:
// - Batched per user per threshold: 3 tasks due this week means ONE
//   notification listing them, never three pings. Overdue tasks get their own
//   single batched notification.
// - Never twice for the same threshold: each task carries
//   reminded_upcoming_at / reminded_overdue_at markers (migration 0026) that
//   are stamped after a successful send, so re-runs are safe.
//
// Respects the "reminders" toggle on /account/notifications. Delivery goes
// through sendNotification, so email / SMS light up automatically once the
// provider keys exist (see src/lib/notify.ts).

const UPCOMING_DAYS = 3;
const MAX_TASKS = 500; // cap the work a single run does

const DAY_MS = 24 * 60 * 60 * 1000;

type Task = {
  id: string;
  property_id: string;
  title: string;
  due_date: string;
};

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Vercel Cron automatically sends "Authorization: Bearer <CRON_SECRET>" when
  // the CRON_SECRET env var is set. Also accept an explicit x-cron-secret header
  // or ?secret= for manual runs / other schedulers.
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const provided =
    bearer ??
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret");
  return provided === expected;
}

// Date-only math in UTC, since due_date is a plain date column.
function utcTodayMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function daysFromToday(dueDate: string): number {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  return Math.round((due - utcTodayMs()) / DAY_MS);
}

// "today", "tomorrow", or a weekday name - the window is only 3 days wide, so
// a weekday is never ambiguous.
function dueLabel(dueDate: string): string {
  const diff = daysFromToday(dueDate);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  return new Date(`${dueDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}

// "Replace HVAC air filter, Clean gutters, and 2 more"
function titleList(tasks: Task[]): string {
  const names = tasks.map((t) => t.title);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 2).join(", ")}, and ${names.length - 2} more`;
}

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const horizon = new Date(utcTodayMs() + UPCOMING_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);

  const { data: tasks, error } = await supabase
    .from("maintenance_tasks")
    .select(
      "id, property_id, title, due_date, reminded_upcoming_at, reminded_overdue_at"
    )
    .eq("status", "open")
    .not("due_date", "is", null)
    .lte("due_date", horizon)
    .limit(MAX_TASKS);

  if (error || !tasks) {
    return NextResponse.json(
      { created: 0, error: error?.message ?? "no tasks" },
      { status: 200 }
    );
  }

  // Split into the two thresholds, dropping anything already reminded.
  const upcoming: Task[] = [];
  const overdue: Task[] = [];
  for (const t of tasks) {
    if (!t.due_date) continue;
    const diff = daysFromToday(t.due_date);
    const task = t as Task;
    if (diff < 0 && !t.reminded_overdue_at) overdue.push(task);
    else if (diff >= 0 && !t.reminded_upcoming_at) upcoming.push(task);
  }

  if (upcoming.length === 0 && overdue.length === 0) {
    return NextResponse.json({ created: 0 });
  }

  // Resolve property -> owning user, then the owners' contact + prefs.
  const propertyIds = Array.from(
    new Set([...upcoming, ...overdue].map((t) => t.property_id))
  );
  const { data: properties } = await supabase
    .from("properties")
    .select("id, user_id")
    .in("id", propertyIds);
  const ownerByProperty = new Map(
    (properties ?? []).map((p) => [p.id, p.user_id])
  );

  const userIds = Array.from(new Set(ownerByProperty.values()));
  const { data: users } = await supabase
    .from("users")
    .select("id, email, phone, notification_prefs")
    .in("id", userIds);
  const userById = new Map((users ?? []).map((u) => [u.id, u]));

  // Group per user per threshold so each homeowner gets at most one
  // notification per bucket.
  const byUser = new Map<string, { upcoming: Task[]; overdue: Task[] }>();
  function bucket(userId: string) {
    let b = byUser.get(userId);
    if (!b) {
      b = { upcoming: [], overdue: [] };
      byUser.set(userId, b);
    }
    return b;
  }
  for (const t of upcoming) {
    const userId = ownerByProperty.get(t.property_id);
    if (userId) bucket(userId).upcoming.push(t);
  }
  for (const t of overdue) {
    const userId = ownerByProperty.get(t.property_id);
    if (userId) bucket(userId).overdue.push(t);
  }

  const nowIso = new Date().toISOString();
  let created = 0;

  for (const [userId, b] of byUser) {
    const user = userById.get(userId);
    if (!user) continue;
    // An unset preference reads as enabled, matching NotificationPrefsForm.
    if (user.notification_prefs?.reminders === false) continue;

    try {
      if (b.upcoming.length > 0) {
        const one = b.upcoming.length === 1 ? b.upcoming[0] : null;
        const sent = await sendNotification(supabase, {
          userId,
          kind: "maintenance_upcoming",
          title: one
            ? `Reminder: ${one.title} is due ${dueLabel(one.due_date)}`
            : `${b.upcoming.length} maintenance tasks are due this week`,
          body: one ? null : titleList(b.upcoming),
          url: "/dashboard#this-month",
          email: user.email,
          phone: user.phone,
        });
        if (sent) {
          created += 1;
          await supabase
            .from("maintenance_tasks")
            .update({ reminded_upcoming_at: nowIso })
            .in(
              "id",
              b.upcoming.map((t) => t.id)
            );
        }
      }

      if (b.overdue.length > 0) {
        const one = b.overdue.length === 1 ? b.overdue[0] : null;
        const sent = await sendNotification(supabase, {
          userId,
          kind: "maintenance_overdue",
          title: one
            ? `Overdue: ${one.title} is still waiting on you`
            : `${b.overdue.length} maintenance tasks are overdue`,
          body: one
            ? "A few minutes now can save a repair bill later."
            : titleList(b.overdue),
          url: "/dashboard#this-month",
          email: user.email,
          phone: user.phone,
        });
        if (sent) {
          created += 1;
          await supabase
            .from("maintenance_tasks")
            .update({ reminded_overdue_at: nowIso })
            .in(
              "id",
              b.overdue.map((t) => t.id)
            );
        }
      }
    } catch {
      // One homeowner's failure shouldn't stop the rest of the run.
      continue;
    }
  }

  return NextResponse.json({ created });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}
