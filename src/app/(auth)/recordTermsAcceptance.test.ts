import { beforeEach, describe, expect, it, vi } from "vitest";

// Campaign attribution at sign-up: the analytics event (app_events) AND the
// permanent stamp on public.users (migration 0166). Landen addendum 5, I2/I4.
//
// The property this file exists to pin is "FIRST CODE WINS, NEVER
// OVERWRITTEN", and the thing that guarantees it is a WHERE clause, not a
// branch in TypeScript: the UPDATE is filtered on `campaign_code is null`, so
// an account that already carries a code is simply not matched. Two entry
// points call recordTermsAcceptance for the same signup (the signup page and
// /auth/callback), and a homeowner can later sign up on the pro side too, so a
// read-then-write in application code would race with itself. That is why the
// assertions below check for the `.is("campaign_code", null)` filter on the
// query rather than checking a value afterwards - there is no value to check,
// the database is what enforces it.
//
// Deliberately NOT tested here: anything about plans, payments or preview
// mode. Nothing in this path touches them (addendum 4 G / I4) - the /go route,
// the cookie and this write are all free of them - and a test that mocked a
// billing state would create the coupling it was meant to rule out.

const CURTIS = "curtis";
const OTHER_CODE = "ig-d01";
const USER_ID = "11111111-2222-4333-8444-555555555555";

type UpdateCall = {
  values: Record<string, unknown>;
  eq: Array<[string, unknown]>;
  is: Array<[string, unknown]>;
};

let cookieValue: string | null = null;
let sessionUser: { id: string; email: string } | null = null;
// What the terms_acceptances existence check reads back. Non-null means "this
// account already accepted this doc", which makes the whole function a no-op.
let existingTermsRow: { id: string } | null = null;
let usersUpdateError: { code?: string; message?: string } | null = null;

let usersUpdates: UpdateCall[] = [];
let termsInserts: Record<string, unknown>[] = [];
let tracked: Array<{
  userId: string | null;
  event: string;
  props: Record<string, unknown>;
}> = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: vi.fn(async () => ({ data: true, error: null })),
    auth: {
      admin: {
        getUserById: vi.fn(async () => ({
          data: { user: null },
          error: null,
        })),
      },
    },
    from: (table: string) => {
      if (table === "terms_acceptances") {
        const selectChain = {
          eq: () => selectChain,
          limit: () => selectChain,
          maybeSingle: async () => ({ data: existingTermsRow, error: null }),
        };
        return {
          select: () => selectChain,
          insert: (row: Record<string, unknown>) => {
            termsInserts.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }
      if (table === "users") {
        return {
          update: (values: Record<string, unknown>) => {
            const call: UpdateCall = { values, eq: [], is: [] };
            usersUpdates.push(call);
            // .eq() keeps chaining; .is() is the last link in the real call
            // and is what gets awaited, so it resolves.
            const chain = {
              eq: (col: string, val: unknown) => {
                call.eq.push([col, val]);
                return chain;
              },
              is: (col: string, val: unknown) => {
                call.is.push([col, val]);
                return Promise.resolve({ error: usersUpdateError });
              },
            };
            return chain;
          },
        };
      }
      throw new Error(`unexpected table "${table}"`);
    },
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: sessionUser } })),
    },
  })),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => null })),
  cookies: vi.fn(async () => ({
    // Hard-coded rather than importing CAMPAIGN_COOKIE, because a vi.mock
    // factory is hoisted above the imports. The name is pinned by its own
    // assertion in the first test below, so the two cannot drift.
    get: (name: string) =>
      name === "oaktend_campaign" && cookieValue !== null
        ? { value: cookieValue }
        : undefined,
  })),
}));

vi.mock("@/lib/risk/signals", () => ({
  recordRequestSignals: vi.fn(async () => {}),
  recordEmailSignals: vi.fn(async () => {}),
}));

vi.mock("@/lib/trackServer", () => ({
  trackServerEvent: vi.fn(
    async (
      userId: string | null,
      event: string,
      props: Record<string, unknown>
    ) => {
      tracked.push({ userId, event, props });
    }
  ),
}));

import { CAMPAIGN_COOKIE } from "@/lib/campaigns";
import { recordTermsAcceptance } from "./recordTermsAcceptance";

function campaignUpdates(): UpdateCall[] {
  return usersUpdates.filter((u) => "campaign_code" in u.values);
}

beforeEach(() => {
  cookieValue = null;
  sessionUser = { id: USER_ID, email: "new.signup@example.com" };
  existingTermsRow = null;
  usersUpdateError = null;
  usersUpdates = [];
  termsInserts = [];
  tracked = [];
});

describe("recordTermsAcceptance - permanent campaign attribution (0166)", () => {
  it("stamps a known code on the account exactly once, filtered on campaign_code is null", async () => {
    // The cookie mock keys off this literal; if the constant ever moves, this
    // assertion fails before the misleading ones below do.
    expect(CAMPAIGN_COOKIE).toBe("oaktend_campaign");

    cookieValue = CURTIS;
    await recordTermsAcceptance(USER_ID, "terms");

    const updates = campaignUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0].values.campaign_code).toBe(CURTIS);
    // Written in the same statement as the code, so the two can never
    // disagree about when attribution happened.
    expect(typeof updates[0].values.campaign_recorded_at).toBe("string");
    expect(
      Number.isFinite(Date.parse(updates[0].values.campaign_recorded_at as string))
    ).toBe(true);

    // Scoped to the SERVER-VERIFIED id, never the caller's argument.
    expect(updates[0].eq).toEqual([["id", USER_ID]]);
    // THE GUARANTEE: first code wins. Enforced by the query, not by a branch.
    expect(updates[0].is).toEqual([["campaign_code", null]]);

    // The existing analytics event is untouched by any of this.
    expect(tracked).toEqual([
      { userId: USER_ID, event: "campaign_signup", props: { code: CURTIS } },
    ]);
  });

  it("a later signup carrying a DIFFERENT code cannot overwrite the first", async () => {
    // Real shape of this: a homeowner who arrived via /go/curtis later signs
    // up on the contractor side too, by then carrying a different campaign
    // cookie. recordTermsAcceptance runs again for doc "pro_terms" (its own
    // terms row, so the idempotency guard does not stop it).
    cookieValue = CURTIS;
    await recordTermsAcceptance(USER_ID, "terms");

    cookieValue = OTHER_CODE;
    await recordTermsAcceptance(USER_ID, "pro_terms");

    const updates = campaignUpdates();
    expect(updates).toHaveLength(2);
    // The second statement is issued - the app does not try to be clever and
    // read first, which would race with the other entry point - but it is
    // filtered exactly like the first, so the database matches no row and
    // the original attribution stands. Nothing anywhere issues an UPDATE of
    // campaign_code without this filter.
    for (const update of updates) {
      expect(update.is).toEqual([["campaign_code", null]]);
    }
    expect(updates[1].values.campaign_code).toBe(OTHER_CODE);
  });

  it("writes nothing for a cookie code that is not on the allowlist", async () => {
    // Well-formed, so it would pass CAMPAIGN_CODE_RE, but it is not in the
    // frozen CAMPAIGN_CODES map. httpOnly stops a page script forging the
    // cookie but not a hand-crafted request, so this re-validation is the
    // last gate before a string reaches app_events.props AND, now, a column
    // that gets grouped by in a partner report.
    cookieValue = "not-a-real-code";
    await recordTermsAcceptance(USER_ID, "terms");

    expect(campaignUpdates()).toHaveLength(0);
    expect(tracked).toHaveLength(0);
    // The audit-trail row itself is unaffected - a bogus cookie must not cost
    // the user their terms acceptance.
    expect(termsInserts).toHaveLength(1);
  });

  it("writes nothing for an ill-formed cookie value", async () => {
    for (const bad of ["CURTIS", "curtis!", "c", "<script>alert(1)</script>", ""]) {
      cookieValue = bad;
      usersUpdates = [];
      tracked = [];
      await recordTermsAcceptance(USER_ID, "terms");
      expect(campaignUpdates(), bad).toHaveLength(0);
      expect(tracked, bad).toHaveLength(0);
    }
  });

  it("writes nothing when there is no campaign cookie at all", async () => {
    cookieValue = null;
    await recordTermsAcceptance(USER_ID, "terms");
    expect(campaignUpdates()).toHaveLength(0);
    expect(tracked).toHaveLength(0);
  });

  it("writes nothing for the pro_terms_onboarding doc", async () => {
    // The later onboarding-wizard acknowledgment, not a signup. Attribution
    // must fire once per NEW ACCOUNT, at the same moment signup_homeowner /
    // signup_pro do - not again when a pro works through the wizard weeks
    // later, by which time the cookie could belong to a different campaign
    // entirely.
    cookieValue = CURTIS;
    await recordTermsAcceptance(USER_ID, "pro_terms_onboarding");

    expect(campaignUpdates()).toHaveLength(0);
    expect(tracked).toHaveLength(0);
  });

  it("is a complete no-op when the acceptance row already exists", async () => {
    // The idempotency guard (a confirmation link opened twice, or both entry
    // points firing for one signup) returns before the campaign block, so the
    // event is not double-logged either.
    existingTermsRow = { id: "existing" };
    cookieValue = CURTIS;
    await recordTermsAcceptance(USER_ID, "terms");

    expect(termsInserts).toHaveLength(0);
    expect(campaignUpdates()).toHaveLength(0);
    expect(tracked).toHaveLength(0);
  });

  it("survives migration 0166 not being pasted yet, without throwing", async () => {
    // PostgREST's "column not found" shape. isMissingSchemaError recognises
    // it; the function must log and continue, never throw and never block a
    // signup - and the analytics event must still land, so the signup is
    // still recoverable from app_events.
    usersUpdateError = {
      code: "PGRST204",
      message: "Could not find the 'campaign_code' column of 'users'",
    };
    cookieValue = CURTIS;

    await expect(
      recordTermsAcceptance(USER_ID, "terms")
    ).resolves.toBeUndefined();

    expect(campaignUpdates()).toHaveLength(1);
    expect(tracked).toEqual([
      { userId: USER_ID, event: "campaign_signup", props: { code: CURTIS } },
    ]);
    expect(termsInserts).toHaveLength(1);
  });

  it("never blocks a signup when the attribution write fails for a real reason", async () => {
    usersUpdateError = { code: "57014", message: "canceling statement due to statement timeout" };
    cookieValue = CURTIS;

    await expect(
      recordTermsAcceptance(USER_ID, "terms")
    ).resolves.toBeUndefined();
    expect(termsInserts).toHaveLength(1);
  });

  it("refuses a userId that does not match the verified session, writing nothing", async () => {
    // A "use server" action can be called with a forged argument. The
    // attribution write must not be a way to stamp someone else's account.
    sessionUser = { id: USER_ID, email: "new.signup@example.com" };
    cookieValue = CURTIS;

    await recordTermsAcceptance(
      "99999999-8888-4777-8666-555555555555",
      "terms"
    );

    expect(campaignUpdates()).toHaveLength(0);
    expect(termsInserts).toHaveLength(0);
    expect(tracked).toHaveLength(0);
  });
});
