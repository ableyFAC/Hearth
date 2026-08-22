import { describe, it, expect } from "vitest";
import {
  isPlusGatedKind,
  shouldSendOutboundChannels,
  PLUS_GATED_NOTIFICATION_KINDS,
} from "./notifyGating";

// The proactive homeowner alerts and reminders - the ones Hearth generates on
// its own schedule. Email/SMS on these is what Hearth Plus sells.
const GATED = [
  "freeze",
  "heat",
  "high_wind",
  "heavy_rain",
  "maintenance_upcoming",
  "maintenance_overdue",
  "filter_reminder",
  "seasonal_check",
  "insurance_renewal",
  "home_digest",
];

// Every other kind sendNotification is called with anywhere in the app,
// harvested from the callers. If a new kind lands here it should be a
// deliberate decision, not a default.
const UNGATED = [
  // homeowner transactional
  "quote_analysis",
  "quote_sent",
  "invoice_sent",
  "new_review",
  "review_request",
  "job_closed",
  "applicant_waiting",
  "direct_request",
  // billing / legal notices, on either side of the marketplace
  "renewal_reminder",
  "annual_notice",
  "renewal_acknowledgment",
  // pro side
  "new_lead",
  "apply_receipt",
  "apply_credit_back",
  "direct_accepted",
  "direct_declined",
  "aging_deal",
  "weekly_digest",
  "winback_credit",
  "first_apply_guarantee",
  "ghost_refund",
  "referral_reward",
];

describe("isPlusGatedKind", () => {
  it.each(GATED)("gates the proactive homeowner kind %s", (kind) => {
    expect(isPlusGatedKind(kind)).toBe(true);
  });

  it.each(UNGATED)("leaves %s ungated", (kind) => {
    expect(isPlusGatedKind(kind)).toBe(false);
  });

  it("does not gate an unrecognized kind", () => {
    // A kind nobody classified must keep working like every other
    // transactional message; the gate opts kinds IN, never out.
    expect(isPlusGatedKind("some_future_kind")).toBe(false);
  });

  it("never gates a billing or auto-renewal notice", () => {
    for (const kind of ["renewal_reminder", "annual_notice", "renewal_acknowledgment"]) {
      expect(PLUS_GATED_NOTIFICATION_KINDS.has(kind)).toBe(false);
    }
  });
});

describe("shouldSendOutboundChannels", () => {
  it("sends an ungated kind on every channel regardless of membership", () => {
    for (const status of ["plus", "free", "unknown"] as const) {
      expect(shouldSendOutboundChannels("quote_sent", status)).toBe(true);
    }
  });

  it("sends a gated kind to a member", () => {
    expect(shouldSendOutboundChannels("filter_reminder", "plus")).toBe(true);
  });

  it("withholds a gated kind from a confirmed non-member", () => {
    expect(shouldSendOutboundChannels("filter_reminder", "free")).toBe(false);
  });

  it("FAILS CLOSED on a failed membership lookup", () => {
    // This is a paid gate: an outage must not hand out the perk. The in-app
    // notification row is written by sendNotification either way.
    expect(shouldSendOutboundChannels("filter_reminder", "unknown")).toBe(false);
    expect(shouldSendOutboundChannels("home_digest", "unknown")).toBe(false);
  });
});
