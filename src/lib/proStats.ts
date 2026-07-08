// Pure analytics math for the Pro "Insights" perk on My Business. No DB
// access here: the page passes in the rows it already fetched from the
// my_applications RPC, plus the current date (never call argless
// `new Date()` in here). Same pure-module style as src/lib/forecast.ts so
// the whole feature stays testable and server-render friendly.
//
// Structural interfaces below mirror the RPC return shape declared in
// supabase/migrations/0028_ghost_protection.sql on purpose: the RPC is not
// in the generated database.types.ts (the page casts it with `as any`), so
// we type what we actually read and nothing more.

// One row from the my_applications() RPC. Only the fields the math reads
// are required; extra fields on the real rows are fine.
export interface ProApplicationRow {
  application_id?: string;
  status: string | null; // applied | chosen | declined
  fee_cents: number | string | null;
  applied_at: string | null;
  category: string | null;
  // Dollars (numeric in Postgres), possibly serialized as a string.
  payout_amount: number | string | null;
  refunded_at: string | null;
}

export interface CategoryStats {
  category: string;
  applications: number;
  wins: number;
  // Percent 0-100, null when there are no live (non-refunded) applications
  // in the category to divide by.
  winRatePercent: number | null;
  // Average fee actually paid (non-refunded applications), in cents.
  // Null when every application in the category was refunded.
  avgFeeCents: number | null;
}

export interface MonthTrendPoint {
  key: string; // "2026-07"
  label: string; // "Jul"
  applications: number;
  wins: number;
}

export interface ProStats {
  totalApplications: number;
  // Applications whose fee was NOT ghost-refunded (the money that stayed spent).
  liveApplications: number;
  wins: number;
  // Percent 0-100: wins / live applications. Null with zero live applications.
  winRatePercent: number | null;
  // Fees net of ghost refunds: refunded rows contribute nothing.
  feesSpentCents: number;
  // NOTE: there is deliberately no "revenue won" or "ROI" here. The only job
  // amount the app records is contractor_leads.payout_amount, which is the LEAD
  // FEE (set to leadFeeFor(category) at post time), not what the pro earns on
  // the job. Summing it as revenue and dividing for a return would compare fees
  // to fees, so we do not compute or show it. Win rate, wins, and fees spent
  // are the honest signals of whether buying leads is working.
  // Sorted most applications first.
  categories: CategoryStats[];
  // Oldest month first, always exactly `months` entries ending at currentDate.
  trend: MonthTrendPoint[];
  daysSinceLastApplication: number | null;
  daysSinceLastWin: number | null;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Coerce a Postgres numeric/bigint (which may arrive as a string, null, or
// garbage) into a finite number, defaulting to 0.
function num(v: number | string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

// Parse a timestamp into epoch ms, or null when missing/unparseable.
function ts(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

// Whole days between a past timestamp and now, never negative.
function daysSince(mostRecentMs: number | null, nowMs: number): number | null {
  if (mostRecentMs === null) return null;
  return Math.max(0, Math.floor((nowMs - mostRecentMs) / 86_400_000));
}

// Build the full Insights stat block from the pro's application history.
// `currentDate` anchors "days since" and the 6-month trend window.
export function buildProStats(
  applications: ProApplicationRow[],
  currentDate: Date,
  months = 6
): ProStats {
  const apps = applications ?? [];
  const nowMs = currentDate.getTime();

  const isWin = (a: ProApplicationRow) => a.status === "chosen";
  // "Live" = the fee stayed spent (no ghost refund outstanding). Note that
  // choose_applicant clears refunded_at when it re-charges a revived
  // application, so a won-after-refund row correctly counts as live again.
  const isLive = (a: ProApplicationRow) => !a.refunded_at;

  const liveApps = apps.filter(isLive);
  const wins = apps.filter(isWin);

  const winRatePercent =
    liveApps.length > 0
      ? Math.round((wins.length / liveApps.length) * 100)
      : null;

  // Fees net of refunds: refunded rows cost nothing in the end.
  const feesSpentCents = liveApps.reduce((sum, a) => sum + num(a.fee_cents), 0);

  // ---- Per-category breakdown ----------------------------------------------
  const byCategory = new Map<string, ProApplicationRow[]>();
  for (const a of apps) {
    const key = a.category ?? "other";
    const bucket = byCategory.get(key);
    if (bucket) bucket.push(a);
    else byCategory.set(key, [a]);
  }

  const categories: CategoryStats[] = Array.from(byCategory.entries())
    .map(([category, rows]) => {
      const live = rows.filter(isLive);
      const catWins = rows.filter(isWin).length;
      return {
        category,
        applications: rows.length,
        wins: catWins,
        winRatePercent:
          live.length > 0 ? Math.round((catWins / live.length) * 100) : null,
        avgFeeCents:
          live.length > 0
            ? Math.round(
                live.reduce((sum, a) => sum + num(a.fee_cents), 0) / live.length
              )
            : null,
      };
    })
    .sort(
      (a, b) => b.applications - a.applications || b.wins - a.wins
    );

  // ---- Monthly trend (last `months` calendar months, oldest first) ---------
  const trend: MonthTrendPoint[] = [];
  const trendIndex = new Map<string, MonthTrendPoint>();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const point: MonthTrendPoint = {
      key: monthKey(d.getFullYear(), d.getMonth()),
      label: MONTH_LABELS[d.getMonth()],
      applications: 0,
      wins: 0,
    };
    trend.push(point);
    trendIndex.set(point.key, point);
  }
  for (const a of apps) {
    const t = ts(a.applied_at);
    if (t === null) continue;
    const d = new Date(t);
    const point = trendIndex.get(monthKey(d.getFullYear(), d.getMonth()));
    if (!point) continue; // outside the window
    point.applications += 1;
    // Wins are bucketed by when the application went in (the RPC has no
    // "won at" timestamp), which is close enough for a trend line.
    if (isWin(a)) point.wins += 1;
  }

  // ---- Recency --------------------------------------------------------------
  const latest = (rows: ProApplicationRow[]): number | null =>
    rows.reduce<number | null>((best, a) => {
      const t = ts(a.applied_at);
      if (t === null) return best;
      return best === null || t > best ? t : best;
    }, null);

  return {
    totalApplications: apps.length,
    liveApplications: liveApps.length,
    wins: wins.length,
    winRatePercent,
    feesSpentCents,
    categories,
    trend,
    daysSinceLastApplication: daysSince(latest(apps), nowMs),
    daysSinceLastWin: daysSince(latest(wins), nowMs),
  };
}
