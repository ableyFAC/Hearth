import { timingSafeEqual } from "crypto";
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
// Respects the "reminders" toggle on /account/notifications: opted-out
// owners' tasks are skipped AND stamped, so they can never pile up at the
// front of the candidate window. Delivery goes through sendNotification, so
// email / SMS light up automatically once the provider keys exist (see
// src/lib/notify.ts).

const UPCOMING_DAYS = 3;
const MAX_TASKS = 500; // cap the work a single run does
// Keep Promise.all fan-out bounded.
const SEND_CHUNK = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

type Task = {
  id: string;
  property_id: string;
  title: string;
  due_date: string;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Vercel Cron automatically sends "Authorization: Bearer <CRON_SECRET>" when
  // the CRON_SECRET env var is set. Also accept an explicit x-cron-secret header
  // for manual runs / other schedulers.
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const provided = bearer ?? req.headers.get("x-cron-secret");
  if (!provided) return false;
  // Constant-time compare (mirrors src/lib/checkr.ts / the twilio inbound
  // webhook): only call timingSafeEqual once both buffers are a confirmed
  // equal length, since it throws on a length mismatch.
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) return false;
  try {
    return timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
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
  const todayStr = new Date(utcTodayMs()).toISOString().slice(0, 10);
  const horizon = new Date(utcTodayMs() + UPCOMING_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);

  // One precise query per threshold, each filtering on ITS OWN marker, so a
  // row only ever occupies a window it can still be sent from. (A single
  // scan .or()-ing both markers would let permanently-dead rows, e.g. a task
  // created already overdue whose reminded_overdue_at is stamped but whose
  // reminded_upcoming_at can never be, re-match forever and starve new
  // reminders out of the MAX_TASKS window.) Soonest due first in each.
  const [upcomingRes, overdueRes] = await Promise.all([
    supabase
      .from("maintenance_tasks")
      .select("id, property_id, title, due_date")
      .eq("status", "open")
      .not("due_date", "is", null)
      .gte("due_date", todayStr)
      .lte("due_date", horizon)
      .is("reminded_upcoming_at", null)
      .order("due_date", { ascending: true })
      .limit(MAX_TASKS),
    supabase
      .from("maintenance_tasks")
      .select("id, property_id, title, due_date")
      .eq("status", "open")
      .not("due_date", "is", null)
      .lt("due_date", todayStr)
      .is("reminded_overdue_at", null)
      .order("due_date", { ascending: true })
      .limit(MAX_TASKS),
  ]);

  if (upcomingRes.error || overdueRes.error) {
    return NextResponse.json(
      {
        created: 0,
        error: upcomingRes.error?.message ?? overdueRes.error?.message,
      },
      { status: 200 }
    );
  }

  const upcoming: Task[] = (upcomingRes.data ?? []) as Task[];
  const overdue: Task[] = (overdueRes.data ?? []) as Task[];

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
    .select("id, email, phone, sms_consent, notification_prefs")
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

  for (const batch of chunk(Array.from(byUser), SEND_CHUNK)) {
    await Promise.all(
      batch.map(async ([userId, b]) => {
        const user = userById.get(userId);
        if (!user) return;
        // An unset preference reads as enabled, matching NotificationPrefsForm.
        if (user.notification_prefs?.reminders === false) {
          // Stamp the skipped tasks' markers anyway: an opt-out is a
          // deliberate "do not send", not a transient failure, and unstamped
          // rows would re-match the candidate queries every run until they
          // starved the MAX_TASKS window for everyone else. Re-enabling
          // reminders applies to future tasks; these deliberately-suppressed
          // ones stay quiet.
          try {
            if (b.upcoming.length > 0) {
              await supabase
                .from("maintenance_tasks")
                .update({ reminded_upcoming_at: nowIso })
                .in(
                  "id",
                  b.upcoming.map((t) => t.id)
                );
            }
            if (b.overdue.length > 0) {
              await supabase
                .from("maintenance_tasks")
                .update({ reminded_overdue_at: nowIso })
                .in(
                  "id",
                  b.overdue.map((t) => t.id)
                );
            }
          } catch {
            // A failed stamp just means the rows are re-fetched (and
            // re-skipped) next run; nothing is ever sent to an opted-out
            // user either way.
          }
          return;
        }

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
              smsConsent: user.sms_consent === true,
            });
            if (sent) {
              created += 1;
              const { error: markErr } = await supabase
                .from("maintenance_tasks")
                .update({ reminded_upcoming_at: nowIso })
                .in(
                  "id",
                  b.upcoming.map((t) => t.id)
                );
              // A failed stamp means tomorrow's run would notify again - surface it.
              if (markErr) console.error("reminder marker (upcoming):", markErr.message);
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
              smsConsent: user.sms_consent === true,
            });
            if (sent) {
              created += 1;
              const { error: markErr } = await supabase
                .from("maintenance_tasks")
                .update({ reminded_overdue_at: nowIso })
                .in(
                  "id",
                  b.overdue.map((t) => t.id)
                );
              if (markErr) console.error("reminder marker (overdue):", markErr.message);
            }
          }
        } catch {
          // One homeowner's failure shouldn't stop the rest of the batch.
        }
      })
    );
  }

  return NextResponse.json({ created });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}
