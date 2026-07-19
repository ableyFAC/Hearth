import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";
import { stripe } from "@/lib/stripe";
import { billingTerms, type PaidPlan } from "@/lib/billingTerms";

export const runtime = "nodejs";

// Daily job (Vercel Cron, see vercel.json) that warns paying members BEFORE a
// charge they might not be expecting. Two cases, and only two:
//
//   1. Step-up. The current period is running on a free month (Hearth Plus)
//      or an intro month (Hearth Pro), and the next charge is at the higher
//      standard price. This is the case regulators care most about, because
//      the amount changes without the member doing anything.
//   2. Yearly renewal. A 12-month term is about to auto-renew for another
//      12 months at the same price.
//
// The windows come from California's Automatic Renewal Law (Bus. & Prof. Code
// 17602(a)(5)-(6)): 3 to 21 days before a promotional or free period ends,
// and 15 to 45 days before a term of a year or longer renews. Reminders fire
// at the near edge of each window (a few days out, not three weeks out) so
// the notice arrives when it is still actionable and does not read as noise.
//
// Deliberately NOT covered: an ordinary monthly renewal at an unchanged
// price. Nothing requires it, the amount is not changing, and a monthly
// "you're about to be charged again" is the kind of message people mute,
// which would bury the two notices above that actually matter.
//
// Noise control: at most one reminder per subscription per period. The dup
// guard is keyed to the PERIOD ITSELF - the period end date rides in the
// notification url - so daily re-runs across the whole window are no-ops and
// the next period, which has a new end date, re-arms the guard on its own.
// Same once-per-key-forever pattern as the insurance-renewal cron.
//
// Notification preferences are deliberately NOT consulted. These are billing
// notices required before money moves, not marketing, and a muted "reminders"
// toggle must not suppress one.

// Step-up reminders: fire this many days before the discounted period ends.
// Inside the 3-21 day window, near the actionable end.
const STEP_UP_LEAD_DAYS = 5;
// Yearly renewal reminders: fire this many days before the term renews.
// Inside the 15-45 day window.
const RENEWAL_LEAD_DAYS = 20;

// How wide a slice of dates each run considers. A run that fails or is
// skipped would otherwise leave a permanent hole: catching a few days on
// either side means the next successful run still covers it, and the dup
// guard keeps the overlap from double-sending.
const WINDOW_SLACK_DAYS = 3;

const MAX_SUBSCRIPTIONS = 300; // cap the work (and the Stripe calls) per run

const DAY_MS = 24 * 60 * 60 * 1000;

const REMINDER_KIND = "renewal_reminder";

// PostgREST silently truncates every response at its max-rows cap. The
// per-user lookups here fetch at most one row per id, so 200 stays well under
// it; the dup guard is a per-candidate exact query and never relies on a bulk
// read.
const QUERY_CHUNK = 200;
// Stripe is consulted once per candidate, so keep the fan-out small.
const SEND_CHUNK = 10;

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Vercel Cron automatically sends "Authorization: Bearer <CRON_SECRET>" when
  // the CRON_SECRET env var is set. Also accept an explicit x-cron-secret
  // header or ?secret= for manual runs / other schedulers.
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const provided =
    bearer ??
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret");
  return provided === expected;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// "March 5, 2027" for the reminder body.
function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// Normalize a stored plan string to the union billingTerms understands.
// Anything unrecognized returns null and the row is skipped rather than
// guessed at: a reminder quoting the wrong price is worse than none.
function toPaidPlan(plan: string | null | undefined): PaidPlan | null {
  if (plan === "monthly" || plan === "yearly") return plan;
  if (plan === "pro_monthly" || plan === "pro_yearly") return plan;
  return null;
}

type SubRow = {
  user_id: string;
  plan: string | null;
  status: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
};

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = Date.now();

  // One query covering the union of both windows, narrowed per-row below.
  // The far edge is the yearly window plus slack; the near edge is today,
  // since a period ending in the next few days still needs its step-up
  // notice.
  const horizon = new Date(
    now + (RENEWAL_LEAD_DAYS + WINDOW_SLACK_DAYS) * DAY_MS
  ).toISOString();
  const floor = new Date(now).toISOString();

  const { data: rawSubs, error: subsError } = await (
    supabase.from("subscriptions") as any
  )
    .select("user_id, plan, status, stripe_subscription_id, current_period_end")
    .in("status", ["active", "trialing"])
    .not("stripe_subscription_id", "is", null)
    .not("current_period_end", "is", null)
    .gte("current_period_end", floor)
    .lte("current_period_end", horizon)
    // Soonest first, so the recipient set stays stable when a run hits the cap.
    .order("current_period_end", { ascending: true })
    .limit(MAX_SUBSCRIPTIONS);

  if (subsError) {
    console.error(
      "renewal-reminders cron: subscriptions query failed:",
      subsError.message
    );
    return NextResponse.json(
      { checked: 0, notified: 0, error: subsError.message },
      { status: 200 }
    );
  }

  const subs = ((rawSubs ?? []) as SubRow[]).filter(
    (s) => Boolean(s.user_id) && Boolean(s.stripe_subscription_id)
  );
  if (subs.length === 0) {
    return NextResponse.json({ checked: 0, notified: 0 });
  }

  // Contact details for the email channel.
  const userIds = Array.from(new Set(subs.map((s) => s.user_id)));
  const userById = new Map<string, { id: string; email: string | null }>();
  for (const ids of chunk(userIds, QUERY_CHUNK)) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email")
      .in("id", ids)
      .order("id", { ascending: true });
    for (const u of users ?? []) userById.set(u.id, u);
  }

  let checked = 0;
  let notified = 0;

  for (const batch of chunk(subs, SEND_CHUNK)) {
    await Promise.all(
      batch.map(async (sub) => {
        checked += 1;
        try {
          const plan = toPaidPlan(sub.plan);
          if (!plan || !sub.current_period_end) return;

          const periodEnd = new Date(sub.current_period_end);
          const daysOut = Math.round((periodEnd.getTime() - now) / DAY_MS);

          // Stripe is the authority on what happens next. A subscription
          // already set to cancel gets nothing: there is no upcoming charge
          // to warn about, and a "you'll be charged" notice would be false.
          // The discount / trial state also lives here, not on our row.
          let stripeSub: any;
          try {
            stripeSub = await stripe.subscriptions.retrieve(
              sub.stripe_subscription_id as string
            );
          } catch {
            // Stripe unreachable for this one: skip it. The window is days
            // wide and the next run retries.
            return;
          }
          if (stripeSub.cancel_at_period_end || stripeSub.cancel_at) return;

          // Is the CURRENT period the cheap one? A live trial (Hearth Plus's
          // free month) or a discount on the subscription (Hearth Pro's intro
          // month) both mean the next charge is higher than the last.
          const trialing =
            stripeSub.status === "trialing" ||
            (typeof stripeSub.trial_end === "number" &&
              stripeSub.trial_end * 1000 > now);
          const discountList = stripeSub.discounts;
          const discounted = Array.isArray(discountList)
            ? discountList.length > 0
            : Boolean(discountList ?? stripeSub.discount);

          // The durable signal, stamped at checkout (see both checkout
          // actions). It exists because Hearth Pro's intro month is a
          // duration:"once" coupon: Stripe consumes it on the first invoice
          // and detaches it, so by the time this cron runs - days before the
          // intro month ends - `discounted` above is already false and the
          // step-up would go unannounced. The flag only describes the FIRST
          // period, so it is paired with a first-period check; afterwards the
          // subscription bills the standard price and nothing steps up.
          const periodStart =
            stripeSub.current_period_start ??
            stripeSub.items?.data?.[0]?.current_period_start ??
            null;
          const firstPeriod =
            typeof stripeSub.start_date === "number" &&
            typeof periodStart === "number" &&
            stripeSub.start_date >= periodStart;
          const flaggedStepUp =
            stripeSub.metadata?.intro_step_up === "true" && firstPeriod;

          const stepUp = trialing || discounted || flaggedStepUp;

          const yearly = plan === "yearly" || plan === "pro_yearly";

          // Pick the notice this subscription is due for, if any. Step-up
          // wins when both could apply: the price change is the more
          // important fact.
          let due: "step_up" | "renewal" | null = null;
          if (
            stepUp &&
            !yearly &&
            daysOut <= STEP_UP_LEAD_DAYS + WINDOW_SLACK_DAYS &&
            daysOut >= 0
          ) {
            due = "step_up";
          } else if (
            yearly &&
            daysOut <= RENEWAL_LEAD_DAYS + WINDOW_SLACK_DAYS &&
            daysOut >= RENEWAL_LEAD_DAYS - WINDOW_SLACK_DAYS
          ) {
            due = "renewal";
          }
          if (!due) return;

          const terms = billingTerms(plan, stepUp);

          // Dup guard keyed to the period: same url means this period was
          // already covered, so daily re-runs across the window are no-ops
          // and next period's new end date re-arms it. The pages ignore
          // unknown query params, so the link still lands correctly.
          const url = `${terms.cancelPath}?renewal=${sub.current_period_end.slice(0, 10)}`;
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", sub.user_id)
            .eq("kind", REMINDER_KIND)
            .eq("url", url)
            .limit(1)
            .maybeSingle();
          if (existing) return;

          const title =
            due === "step_up"
              ? `Your ${terms.product} intro price ends on ${fmtDate(periodEnd)}`
              : `Your ${terms.product} membership renews on ${fmtDate(periodEnd)}`;

          // The body carries the two things the notice exists to convey: what
          // the next charge is, and how to stop it. `terms.recurring` is the
          // same sentence shown before purchase, so the warning and the
          // original promise are word-for-word consistent.
          const body = `${terms.recurring} ${terms.cancel}`;

          const sent = await sendNotification(supabase, {
            userId: sub.user_id,
            kind: REMINDER_KIND,
            title,
            body,
            url,
            email: userById.get(sub.user_id)?.email ?? null,
            // No SMS: a billing notice is something to keep and re-read, and
            // charging someone's phone plan to warn them about a charge is a
            // poor trade.
            phone: null,
          });
          if (sent) notified += 1;
        } catch {
          // One bad row must not stop the rest of the batch.
        }
      })
    );
  }

  return NextResponse.json({ checked, notified });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}
