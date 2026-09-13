"use client";

import Link from "next/link";
import type { ConnectStatus } from "@/lib/connectStatus";

// The payouts nudge on the pro Home tab.
//
// WHY IT HAS NO DISMISS BUTTON, unlike ProNudge next to it. ProNudge sells
// something: a membership the pro can reasonably say "not today" to, so it
// respects a dismissal for the rest of the day. This one is not a sale. From
// 2026-09-12 a contractor cannot send an invoice - cannot get paid through
// OakTend at all - until Stripe is connected, so hiding the card would only
// hide the reason their first invoice will not send. It stays, and it stays
// QUIET: the same plain card shell the rest of Home uses, one line, one
// button, no colour shouting.
//
// It is NOT shown when there is nothing to do:
//   ready        - they are connected; nothing to nudge toward.
//   unavailable  - we could not read the columns (migration 0164 is not on the
//                  live database yet, or the read failed). Nagging a pro to
//                  fix something the app cannot even see would be worse than
//                  saying nothing.
//
// The status is computed on the SERVER (readConnectRow in
// src/lib/stripeConnect.ts, called from src/app/pro/page.tsx) and arrives here
// as one word. Nothing about the connected account crosses to the browser -
// not the account id, not the requirement list.

export function shouldShowPayoutsNudge(status: ConnectStatus): boolean {
  return (
    status === "not_started" ||
    status === "in_progress" ||
    status === "restricted"
  );
}

export default function PayoutsNudge({ status }: { status: ConnectStatus }) {
  if (!shouldShowPayoutsNudge(status)) return null;

  // "restricted" is a different sentence: Stripe has already asked for
  // something specific, and "Add where you get paid" would read as if nothing
  // had happened yet. The list itself lives on /pro/payouts, not here.
  const restricted = status === "restricted";

  return (
    <div className="card space-y-2">
      <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
        {restricted ? "Stripe needs one more thing" : "Add where you get paid"}
      </p>
      <p className="text-sm text-stone-600 dark:text-stone-300">
        Connect Stripe once so you can send invoices and get paid in the app.
      </p>
      <Link href="/pro/payouts" className="btn-primary mt-1 inline-flex text-sm">
        {restricted ? "Fix payouts" : "Set up payouts"}
      </Link>
    </div>
  );
}
