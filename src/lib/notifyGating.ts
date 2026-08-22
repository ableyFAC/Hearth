// Which notification kinds are a Hearth Plus perk on the email/SMS channels.
//
// Kept as a standalone, dependency-free module (no server-only, no Supabase)
// so the decision is a pure function that can be unit tested and so every
// sender shares one list instead of each cron remembering the rule. The
// enforcement itself lives in sendNotification (src/lib/notify.ts), the single
// door every send goes through, so a new cron cannot forget the gate.
//
// The rule: the in-app notification row is ALWAYS written, for everyone. What
// Plus buys a homeowner is having those same alerts and reminders pushed to
// them - email and SMS - instead of waiting in the bell. That is exactly what
// the /plus comparison table sells ("Proactive alerts: free = In-app, plus =
// All alerts, every channel").
//
// GATED (homeowner alerts and reminders - proactive nudges Hearth generates on
// its own schedule, nobody asked for them just now):
//   freeze / heat / high_wind / heavy_rain  weather alerts cron
//   maintenance_upcoming / maintenance_overdue  maintenance reminders cron
//   filter_reminder                          HVAC filter cron
//   seasonal_check                           seasonal triggers cron
//   insurance_renewal                        home-insurance renewal nudge cron
//   home_digest                              periodic home digest cron
//
// NOT GATED, on purpose:
//   - Transactional homeowner messages: a reply in a chat, a quote or invoice
//     arriving, an application update, a review request, a receipt, anything
//     security or money related. Someone acted and the other side needs to
//     know; that is not a perk.
//   - applicant_waiting: a pro paid real money to apply to a job this
//     homeowner posted, and ghost protection refunds them after silence. That
//     is an update on the homeowner's own posting, not a proactive nudge.
//   - renewal_reminder / annual_notice / renewal_acknowledgment: auto-renewal
//     billing notices. These exist to satisfy the auto-renewal disclosure
//     laws, they are sent to people who are already paying (on either side of
//     the marketplace), and withholding one to sell an upgrade would be both
//     unlawful and indefensible. Never gate a billing notice.
//   - Every PRO-side kind (new_lead, apply_receipt, aging_deal,
//     applicant/weekly digests, winback credit, first-apply guarantee...).
//     Pro alerts have their own cold-start story (COLD_START_FREE_ALERTS) and
//     their own membership; this gate is the homeowner Plus gate only.
export const PLUS_GATED_NOTIFICATION_KINDS: ReadonlySet<string> = new Set([
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
]);

// Whether this kind's email/SMS channels are a Plus perk.
export function isPlusGatedKind(kind: string): boolean {
  return PLUS_GATED_NOTIFICATION_KINDS.has(kind);
}

// The one decision sendNotification makes about the outbound channels.
//
// `plusStatus` is deliberately three-valued rather than a boolean:
//   "plus"    - the recipient (or the owner of the home they're on) is a
//               member. Send on every channel.
//   "free"    - positively confirmed no live membership. In-app only for a
//               gated kind.
//   "unknown" - the lookup itself failed.
//
// FAILS CLOSED on "unknown", which is the opposite of how this file's
// neighbours treat a broken lookup. The email opt-out check in notify.ts
// falls OPEN because that gate protects against spamming someone, and the
// safest thing to do when unsure is still to deliver a message with an
// unsubscribe link in it. This gate is different: it is a PAID gate, and
// falling open here hands out the exact perk the /plus page charges for every
// time a subscriptions read hiccups - a bug that gets more generous the worse
// the outage. The recipient loses nothing that matters, because the in-app
// notification row is written either way and the bell is the product's
// authoritative channel; they just don't get the push.
export function shouldSendOutboundChannels(
  kind: string,
  plusStatus: "plus" | "free" | "unknown"
): boolean {
  if (!isPlusGatedKind(kind)) return true;
  return plusStatus === "plus";
}
