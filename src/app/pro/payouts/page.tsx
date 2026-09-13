import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentContractor } from "@/lib/contractor";
import {
  readConnectRow,
  refreshConnectAccount,
  humanizeRequirements,
  type ConnectStatus,
} from "@/lib/stripeConnect";
import PayoutsSetup from "./PayoutsSetup";
import { refreshPayoutStatusAction } from "./actions";

// "Add where you get paid" - the one screen where a contractor connects Stripe.
//
// WHAT THIS PAGE IS FOR. From 2026-09-12 the money model is a 5% cut of each
// invoice, taken as an application_fee on a direct charge against the pro's
// own Stripe Connect (Express) account. Every pro needs one. The account
// itself is created SILENTLY when the onboarding wizard finishes, so this page
// is never a fourth signup step - it is where the pro finishes the part only
// they can do (bank details, ID), whenever they get to it.
//
// NOTHING IS GATED ON IT YET. Browsing, applying and chat all work exactly as
// before whether or not this is done. Step 2 (the invoice flow) is what will
// require it, through canSendInvoices().
//
// THE COLUMNS MAY NOT EXIST. The live database does not have migration 0164
// until it is pasted, and every read here goes through readConnectRow(), which
// turns a missing-schema failure into status "unavailable" - a card that says
// payouts are not switched on yet. No crash, no nag, no buttons that cannot
// work.

export const metadata = {
  title: "Payouts",
};

type Search = { returned?: string; refresh?: string };

// The heading, the one line under it, and the button label, per state. Kept
// together so the page reads as one piece of copy rather than four branches.
// Tone matches /pro/business: plain, short, no exclamation marks, and it says
// what happens next rather than congratulating anybody.
const COPY: Record<
  Exclude<ConnectStatus, "unavailable" | "ready">,
  { heading: string; line: string; cta: string }
> = {
  not_started: {
    heading: "Add where you get paid",
    line: "Takes about 3 minutes. Stripe handles your bank details; OakTend never sees them.",
    cta: "Add where you get paid",
  },
  in_progress: {
    heading: "Finish setting up payouts",
    line: "Stripe still needs a few details before money can reach your account.",
    cta: "Continue",
  },
  restricted: {
    heading: "Stripe needs a little more from you",
    line: "Payouts stay off until these are done.",
    cta: "Fix now",
  },
};

export default async function ProPayoutsPage(props: {
  searchParams: Promise<Search>;
}) {
  const searchParams = await props.searchParams;
  const contractor = await getCurrentContractor();
  // No company yet: company setup is the only way in, same rule every other
  // pro page has.
  if (!contractor) redirect("/pro/onboarding");

  // Coming back from hosted onboarding (`returned=1`), or bounced here by an
  // expired account link (`refresh=1`). Either way, ask Stripe directly rather
  // than trusting the mirror: the webhook is the authority but can lag by
  // seconds, and being told "finish setting up payouts" ten seconds after
  // finishing reads as the app losing your work. Best-effort - a failure here
  // just means the page renders whatever is stored.
  const returned = searchParams.returned === "1";
  const refreshed = searchParams.refresh === "1";
  if (returned || refreshed) {
    try {
      await refreshConnectAccount(contractor.id);
    } catch {
      // readConnectRow below still renders the stored state.
    }
  }

  const { status, row } = await readConnectRow(contractor.id);
  const requirements = humanizeRequirements(
    row?.stripe_requirements_currently_due
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
          Payouts
        </h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Where the money from a job lands.
        </p>
      </div>

      {status === "unavailable" && (
        <section className="card space-y-2">
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            Payouts aren&apos;t switched on yet
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Check back soon.
          </p>
        </section>
      )}

      {status === "ready" && (
        <section className="card space-y-3 border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
            Payouts are on. You&apos;re ready to send invoices.
          </h2>
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            Sending invoices arrives next.
          </p>
          {/* A form, not a button with an onClick: this works with JavaScript
              off, and it is the escape hatch for the one case the webhook
              cannot cover - a delivery that failed while the pro was here. */}
          <form action={refreshPayoutStatusAction}>
            <button type="submit" className="btn-secondary text-sm">
              Refresh status
            </button>
          </form>
        </section>
      )}

      {status !== "unavailable" && status !== "ready" && (
        <section className="card space-y-3">
          <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">
            {COPY[status].heading}
          </h2>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            {COPY[status].line}
          </p>

          {status === "restricted" && requirements.length > 0 && (
            // The raw Stripe keys are API identifiers; humanizeRequirements
            // turns them into sentences a person can act on and collapses the
            // ones that mean a single question (all three dob parts).
            <ul className="list-disc space-y-1 pl-5 text-sm text-stone-700 dark:text-stone-300">
              {requirements.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}

          {refreshed && (
            <p className="text-sm text-stone-600 dark:text-stone-300">
              That Stripe link expired. Start again below - nothing you already
              entered was lost.
            </p>
          )}

          {/* After an expired link the hosted button is relabelled "Continue
              setup" - it re-runs the same action, which mints a FRESH account
              link (they are single-use and live for minutes). The embedded
              component does not use account links at all, so it is unaffected
              and keeps working either way. */}
          <PayoutsSetup
            ctaLabel={refreshed ? "Continue setup" : COPY[status].cta}
          />

          <p className="text-xs text-stone-500 dark:text-stone-400">
            OakTend never sees or stores your bank details. Stripe collects them
            and pays you directly.
          </p>
        </section>
      )}

      <p className="text-sm">
        <Link
          href="/pro/business"
          className="text-stone-500 underline underline-offset-2 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
        >
          Back to My Business
        </Link>
      </p>
    </div>
  );
}
