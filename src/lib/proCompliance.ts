// Shared status classification for the compliance calendar (contractor
// license and certificate of insurance). Pure date math so both the /pro/
// business page and any future surface classify the same expiry the same
// way. "expiring" starts at 30 days out, matching the cron's nearest
// lookahead threshold.

export type ComplianceStatus = "none" | "ok" | "expiring" | "expired";

const EXPIRING_WITHIN_DAYS = 30;

export function complianceStatus(expires: string | null | undefined): {
  status: ComplianceStatus;
  daysLeft: number | null;
} {
  if (!expires) return { status: "none", daysLeft: null };

  const now = new Date();
  const todayMs = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  const dueMs = new Date(`${expires}T00:00:00Z`).getTime();
  if (!Number.isFinite(dueMs)) return { status: "none", daysLeft: null };

  const daysLeft = Math.round((dueMs - todayMs) / 86_400_000);
  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= EXPIRING_WITHIN_DAYS) return { status: "expiring", daysLeft };
  return { status: "ok", daysLeft };
}
