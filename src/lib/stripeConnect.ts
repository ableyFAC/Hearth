// Build-time guard: this module drives the Stripe secret key and the
// service-role Supabase client, so importing it from a Client Component must
// fail the build rather than ship either one.
import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/dbErrors";
import {
  connectStatusFor,
  type ConnectRow,
  type ConnectStatus,
} from "@/lib/connectStatus";

// Everything OakTend does with a contractor's Stripe Connect (Express)
// account, in one server-only module.
//
// THE MODEL (handoff.md LATEST, 2026-09-12). Every contractor gets an Express
// account. Invoices will be DIRECT CHARGES on that account with an
// application_fee of 5%, so Stripe bills the processing fee to the contractor
// natively and OakTend's cut arrives clean. Step 1 - this file - only creates
// the account, drives onboarding, and mirrors Stripe's verdict into the
// contractors row. Nothing is gated on it yet.
//
// TWO RULES THIS MODULE KEEPS, BOTH ABOUT MONEY:
//
//   1. EVERY WRITE IS ON THE ADMIN (service_role) CLIENT, AND EVERY WRITE IS
//      KEYED ON AN ID THE SERVER RESOLVED. Migration 0164 grants the stripe_*
//      columns to nobody: `authenticated` and `anon` can neither read nor
//      write them (0069 revoked table SELECT and 0085 revoked table
//      UPDATE/INSERT, both re-granting column allowlists that these columns
//      are not on). So service_role is the only way in, by design. Every
//      function below takes a contractorId that its CALLER resolved from the
//      session (getCurrentContractor()), never one posted by a browser.
//
//   2. EVERY READ TOLERATES THE COLUMNS NOT EXISTING. The live database will
//      not have 0164 until William pastes
//      supabase/PASTE-ME-0164-stripe-connect-2026-09-12.sql. Until then a
//      select naming these columns fails whole, with 42703 / PGRST204, which
//      isMissingSchemaError (src/lib/dbErrors.ts) recognizes. Every such
//      failure degrades to "unavailable" - a card that says payouts are not
//      switched on yet - and never to a 500 on a page a pro uses every day.
//      Same posture src/lib/contractor.ts and src/app/pro/actions.ts already
//      take for post-0033 columns.
//
// The Stripe client itself is the lazy proxy from @/lib/stripe: on a machine
// with no STRIPE_SECRET_KEY the FIRST property access throws. Every function
// below is therefore wrapped in try/catch and degrades, so a dev machine
// without the key renders the pro side exactly as it did before this feature.

// The seven columns 0164 adds, as one select string. Deliberately NOT added to
// CONTRACTOR_COLUMNS in src/lib/contractor.ts: that projection is handed whole
// to a client component on /pro/profile and is serialized into the browser's
// RSC payload on every load (see its comment). A pro's connected-account id
// and Stripe's verification verdict have no business in that payload.
const CONNECT_COLUMNS =
  "stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, " +
  "stripe_details_submitted, stripe_requirements_currently_due, " +
  "stripe_disabled_reason, stripe_account_synced_at";

// Where Stripe sends the pro back to, and what it prints on the Express
// onboarding screens. Same resolution the rest of the app uses
// (src/app/pro/business/page.tsx, src/lib/legal.ts).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

/** Why a Connect call could not be completed. Never surfaced raw to a pro. */
export type ConnectError = "missing_schema" | "stripe" | "not_found";

export type ConnectReadResult = {
  status: ConnectStatus;
  row: ConnectRow;
};

/**
 * The current Connect state for one contractor.
 *
 * Returns `{ status: "unavailable", row: null }` for BOTH of the two failures
 * a page must survive: the live database has not run 0164, or the read itself
 * failed. The pro sees the same honest "payouts aren't switched on yet" card
 * either way; the difference is only in the log.
 */
export async function readConnectRow(
  contractorId: string
): Promise<ConnectReadResult> {
  try {
    const admin = createAdminClient();
    // `any` cast for the same reason src/lib/contractor.ts casts: these are
    // real columns that src/lib/database.types.ts has not been regenerated
    // for, and the typed client rejects a select string naming a column it
    // does not know.
    const { data, error } = await (admin.from("contractors") as any)
      .select(CONNECT_COLUMNS)
      .eq("id", contractorId)
      .maybeSingle();

    if (error) {
      if (!isMissingSchemaError(error)) {
        console.error("readConnectRow failed:", error.message ?? error);
      }
      // Missing schema OR a broken read: both are "we cannot tell", and
      // neither may render as "not connected" (which would nag a pro who IS
      // connected) or as "ready" (which would be a lie about money).
      return { status: "unavailable", row: null };
    }

    const row = (data ?? null) as ConnectRow;
    return { status: connectStatusFor(row), row };
  } catch (err) {
    console.error("readConnectRow threw:", err);
    return { status: "unavailable", row: null };
  }
}

/**
 * The contractor's Stripe account id, creating one if they have none.
 *
 * Called silently at the end of the pro onboarding wizard (so the account
 * already exists by the time the pro is asked to finish it) and again as the
 * first step of every onboarding link / account session.
 *
 * THE RACE, AND WHY THERE IS NO ORPHAN TO CLEAN UP. Two requests can reach
 * step 2 at once (a double-submitted wizard, the wizard racing a tap on "Set
 * up payouts"). Both call stripe.accounts.create with the SAME idempotency
 * key, `connect-account-create:<contractorId>`, so Stripe returns ONE account
 * to both of them rather than creating two. The conditional update in step 3
 * then lets exactly one of them write, and the loser simply re-reads the id
 * the winner stored - which is the same id it was holding. So a lost race
 * strands nothing in Stripe and there is no orphan account to reap.
 */
export async function ensureConnectAccount(
  contractorId: string
): Promise<{ accountId: string } | { error: ConnectError }> {
  const admin = createAdminClient();

  // ---- 1. Do they already have one? ----------------------------------------
  let existing: any = null;
  try {
    const { data, error } = await (admin.from("contractors") as any)
      .select(
        "id, user_id, name, owner_name, contact_email, contact_phone, slug, stripe_account_id"
      )
      .eq("id", contractorId)
      .maybeSingle();
    if (error) {
      if (isMissingSchemaError(error)) return { error: "missing_schema" };
      console.error("ensureConnectAccount read failed:", error.message ?? error);
      return { error: "not_found" };
    }
    if (!data) return { error: "not_found" };
    existing = data;
  } catch (err) {
    console.error("ensureConnectAccount read threw:", err);
    return { error: "not_found" };
  }

  if (existing.stripe_account_id) {
    return { accountId: String(existing.stripe_account_id) };
  }

  // ---- 2. Create it in Stripe ----------------------------------------------
  // Express, US. business_type is deliberately NOT set: Express onboarding
  // asks the pro whether they are an individual or a company, and guessing it
  // here from a company name would put them down the wrong verification path.
  //
  // The profile fields are prefills, not claims: Stripe shows them back to the
  // pro during onboarding and they can correct anything.
  let account: Stripe.Account;
  try {
    account = await stripe.accounts.create(
      {
        type: "express",
        country: "US",
        email: (existing.contact_email as string | null) ?? undefined,
        business_profile: {
          name: (existing.name as string | null) ?? undefined,
          url: `${SITE_URL}/p/${existing.slug || existing.id}`,
          product_description: "Home services",
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        // So a Stripe dashboard row can always be traced back to an OakTend
        // account without a database lookup - which is what an incident at
        // 3am actually needs.
        metadata: {
          contractor_id: String(existing.id),
          user_id: existing.user_id ? String(existing.user_id) : "",
        },
      },
      { idempotencyKey: `connect-account-create:${contractorId}` }
    );
  } catch (err) {
    // Includes the no-STRIPE_SECRET_KEY case on a dev machine, where the lazy
    // proxy throws on first use. Never fatal to the caller: the wizard has
    // already created the company, and /pro/payouts can try again.
    console.error(
      "ensureConnectAccount: stripe.accounts.create failed:",
      err instanceof Error ? err.message : err
    );
    return { error: "stripe" };
  }

  // ---- 3. Store it, but only if nobody beat us to it ------------------------
  try {
    const { data: updated, error } = await (admin.from("contractors") as any)
      .update({ stripe_account_id: account.id })
      .eq("id", contractorId)
      .is("stripe_account_id", null)
      .select("stripe_account_id")
      .maybeSingle();

    if (error) {
      if (isMissingSchemaError(error)) return { error: "missing_schema" };
      console.error(
        "ensureConnectAccount store failed:",
        error.message ?? error
      );
      // The account DOES exist in Stripe, keyed to this contractor by the
      // idempotency key, so returning it is still correct - the next call
      // re-derives the same id and tries the write again.
      return { accountId: account.id };
    }

    if (updated?.stripe_account_id) {
      return { accountId: String(updated.stripe_account_id) };
    }

    // Zero rows updated: another request won the race and the column is no
    // longer null. Re-read and return what they stored. See the header: the
    // idempotency key means that is the same account we just got back.
    const { data: again } = await (admin.from("contractors") as any)
      .select("stripe_account_id")
      .eq("id", contractorId)
      .maybeSingle();
    return { accountId: String(again?.stripe_account_id ?? account.id) };
  } catch (err) {
    console.error("ensureConnectAccount store threw:", err);
    return { accountId: account.id };
  }
}

/**
 * A hosted Stripe onboarding link (the "separate page on Stripe" flow).
 *
 * The fallback path everywhere the embedded component cannot run: inside the
 * native app shell, when the publishable key is missing, and whenever
 * connect.js fails to initialize. Account links are single-use and expire
 * within minutes, so they are minted per tap and never stored.
 */
export async function createOnboardingLink(
  contractorId: string,
  opts: { returnUrl: string; refreshUrl: string }
): Promise<{ url: string } | { error: ConnectError }> {
  const ensured = await ensureConnectAccount(contractorId);
  if ("error" in ensured) return ensured;

  try {
    const link = await stripe.accountLinks.create({
      account: ensured.accountId,
      type: "account_onboarding",
      return_url: opts.returnUrl,
      refresh_url: opts.refreshUrl,
    });
    return { url: link.url };
  } catch (err) {
    console.error(
      "createOnboardingLink failed:",
      err instanceof Error ? err.message : err
    );
    return { error: "stripe" };
  }
}

/**
 * A client secret for the EMBEDDED account-onboarding component, so the pro
 * never leaves OakTend.
 *
 * Single-use and short-lived by construction (Stripe expires an AccountSession
 * in minutes), which is why connect.js asks for a fresh one through
 * fetchClientSecret rather than being handed one at render time.
 */
export async function createAccountSession(
  contractorId: string
): Promise<{ clientSecret: string } | { error: ConnectError }> {
  const ensured = await ensureConnectAccount(contractorId);
  if ("error" in ensured) return ensured;

  try {
    const session = await stripe.accountSessions.create({
      account: ensured.accountId,
      components: {
        account_onboarding: {
          enabled: true,
          // The bank account IS the point of this screen: without this the
          // embedded component collects identity but sends the pro elsewhere
          // to add where the money lands.
          features: { external_account_collection: true },
        },
      },
    });
    return { clientSecret: session.client_secret };
  } catch (err) {
    console.error(
      "createAccountSession failed:",
      err instanceof Error ? err.message : err
    );
    return { error: "stripe" };
  }
}

/**
 * Mirror a Stripe account object into the contractors row it belongs to.
 *
 * The ONE writer of the six mirrored columns. Every flag is coerced with `!!`
 * here, which is what lets connectStatusFor()'s truthiness checks be safe.
 *
 * IDEMPOTENT BY CONSTRUCTION: it writes the same values for the same account
 * object, so a redelivered webhook changes nothing.
 *
 * OUT-OF-ORDER PROTECTION: Stripe does not promise webhook ordering, and a
 * retried `account.updated` from ten minutes ago must not walk a newer state
 * backwards - a pro who just finished onboarding being told they have not is
 * the exact bug this guards. The update filter refuses any row whose
 * stripe_account_synced_at is already at or past `asOf`.
 *
 * `matched: false` is a normal outcome, not an error: an account we do not
 * know (another platform's, a test account, one whose contractor row was
 * deleted) or a stale event. Logged, then ignored.
 */
export async function syncConnectAccount(
  account: Stripe.Account,
  asOf?: Date
): Promise<{ matched: boolean }> {
  if (!account?.id) return { matched: false };
  const stamp = (asOf ?? new Date()).toISOString();

  try {
    const admin = createAdminClient();
    const { data, error } = await (admin.from("contractors") as any)
      .update({
        stripe_charges_enabled: !!account.charges_enabled,
        stripe_payouts_enabled: !!account.payouts_enabled,
        stripe_details_submitted: !!account.details_submitted,
        stripe_requirements_currently_due:
          account.requirements?.currently_due ?? [],
        stripe_disabled_reason: account.requirements?.disabled_reason ?? null,
        stripe_account_synced_at: stamp,
      })
      .eq("stripe_account_id", account.id)
      .or(
        `stripe_account_synced_at.is.null,stripe_account_synced_at.lt.${stamp}`
      )
      .select("id");

    if (error) {
      if (isMissingSchemaError(error)) {
        // 0164 is not pasted yet. Nothing to mirror into, and nothing broken:
        // the webhook still returns 200 and the next account.updated (or the
        // on-return sync) lands once the columns exist.
        console.error(
          "syncConnectAccount: contractors is missing the 0164 columns; skipped."
        );
        return { matched: false };
      }
      console.error("syncConnectAccount failed:", error.message ?? error);
      return { matched: false };
    }

    const matched = Array.isArray(data) && data.length > 0;
    if (!matched) {
      // Either an account this platform does not know, or an event older than
      // what is already stored. Both are fine; neither is silent.
      console.error(
        "syncConnectAccount matched no row (unknown or stale account):",
        account.id
      );
    }
    return { matched };
  } catch (err) {
    console.error("syncConnectAccount threw:", err);
    return { matched: false };
  }
}

/**
 * Pull the account straight from Stripe and mirror it.
 *
 * Used when the pro comes BACK from hosted onboarding: the webhook is the
 * authority but it can lag by seconds, and a pro who just finished being shown
 * "finish setting up payouts" would reasonably conclude the app lost their
 * work. Best-effort, like everything else here.
 */
export async function refreshConnectAccount(
  contractorId: string
): Promise<{ status: ConnectStatus }> {
  const { status, row } = await readConnectRow(contractorId);
  const accountId = row?.stripe_account_id;
  if (!accountId) return { status };

  try {
    const account = await stripe.accounts.retrieve(accountId);
    await syncConnectAccount(account, new Date());
  } catch (err) {
    console.error(
      "refreshConnectAccount failed:",
      err instanceof Error ? err.message : err
    );
    return { status };
  }

  // Re-read rather than deriving from the Stripe object, so the page renders
  // exactly what is stored - including the case where the write was skipped.
  return { status: (await readConnectRow(contractorId)).status };
}

/**
 * The pro disconnected OakTend from their Stripe account
 * (account.application.deauthorized).
 *
 * Everything goes false and the requirement list is emptied, so no surface can
 * still read "ready" and let an invoice go out. stripe_account_id is KEPT on
 * purpose - it is the audit trail for every charge already made against that
 * account, and clearing it would also make the next ensureConnectAccount()
 * mint a second account for the same business. The state lives in
 * stripe_disabled_reason = 'deauthorized' instead.
 */
export async function disconnectAccount(
  accountId: string | null | undefined
): Promise<{ matched: boolean }> {
  if (!accountId) return { matched: false };

  try {
    const admin = createAdminClient();
    const { data, error } = await (admin.from("contractors") as any)
      .update({
        stripe_charges_enabled: false,
        stripe_payouts_enabled: false,
        stripe_details_submitted: false,
        stripe_requirements_currently_due: [],
        stripe_disabled_reason: "deauthorized",
        stripe_account_synced_at: new Date().toISOString(),
      })
      .eq("stripe_account_id", accountId)
      .select("id");

    if (error) {
      if (!isMissingSchemaError(error)) {
        console.error("disconnectAccount failed:", error.message ?? error);
      }
      return { matched: false };
    }
    return { matched: Array.isArray(data) && data.length > 0 };
  } catch (err) {
    console.error("disconnectAccount threw:", err);
    return { matched: false };
  }
}

// Re-exported so a server module needs one import, not two. The definitions
// live in the pure module so client components and tests can use them too.
export {
  connectStatusFor,
  canSendInvoices,
  humanizeRequirement,
  humanizeRequirements,
} from "@/lib/connectStatus";
export type { ConnectStatus, ConnectRow } from "@/lib/connectStatus";
