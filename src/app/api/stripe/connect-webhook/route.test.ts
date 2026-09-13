import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";

// The route reaches the service-role client and the Stripe client through
// src/lib/stripeConnect.ts, which imports "server-only" - unresolvable under
// vitest. Mocking "server-only" out (the pattern the rest of this repo uses)
// lets stripeConnect itself run FOR REAL, which is the point: the assertion
// that matters below is the exact column payload written to contractors, and
// mocking stripeConnect away would test nothing but the switch statement.

vi.mock("server-only", () => ({}));

const constructEvent = vi.fn();
const accountsRetrieve = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: {
      constructEvent: (...args: unknown[]) => constructEvent(...args),
    },
    accounts: {
      create: vi.fn(),
      retrieve: (...args: unknown[]) => accountsRetrieve(...args),
    },
    accountLinks: { create: vi.fn() },
    accountSessions: { create: vi.fn() },
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => fakeAdmin(),
}));

// Every .from(table).insert(payload) - i.e. every processed_stripe_events
// claim the route makes.
let tableInserts: { table: string; payload: Record<string, unknown> }[] = [];

// Every .from(table).update(payload) plus the filters applied after it, so a
// test can assert both WHAT was written and WHICH ROW it was aimed at. A
// payout-readiness write landing on the wrong contractor is the failure this
// pins down.
let tableUpdates: {
  table: string;
  payload: Record<string, unknown>;
  filters: { op: string; args: unknown[] }[];
}[] = [];

// What the claim insert answers. null = the claim succeeded; set it to a
// PostgREST error to make this delivery lose the race.
let insertError: { code?: string; message?: string } | null = null;

// What the .select() after an .update() resolves to - [] means "matched no
// row", a one-element array means the mirror landed.
let updateMatches: Record<string, unknown>[] = [{ id: "con_1" }];

function fakeAdmin() {
  return {
    from(table: string) {
      const api: Record<string, unknown> = {};
      const filters: { op: string; args: unknown[] }[] = [];
      let isUpdate = false;
      const record = (op: string) => (...args: unknown[]) => {
        filters.push({ op, args });
        return api;
      };
      Object.assign(api, {
        insert: (payload: Record<string, unknown>) => {
          tableInserts.push({ table, payload });
          return Promise.resolve({ data: null, error: insertError });
        },
        update: (payload: Record<string, unknown>) => {
          isUpdate = true;
          tableUpdates.push({ table, payload, filters });
          return api;
        },
        eq: record("eq"),
        is: record("is"),
        or: record("or"),
        select: (...args: unknown[]) => {
          filters.push({ op: "select", args });
          if (isUpdate) {
            return Promise.resolve({ data: updateMatches, error: null });
          }
          return api;
        },
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      });
      return api;
    },
  };
}

// The route only ever reads .text() and one header off the request.
function post(body = "{}", signature = "t=1,v1=deadbeef") {
  return {
    text: async () => body,
    headers: {
      get: (key: string) => (key === "stripe-signature" ? signature : null),
    },
  } as unknown as NextRequest;
}

function accountUpdatedEvent(account: Record<string, unknown>) {
  return {
    id: "evt_connect_1",
    type: "account.updated",
    account: account.id,
    // 2026-09-12T00:00:00Z, in seconds, the way Stripe sends it.
    created: 1_789_516_800,
    data: { object: account },
  };
}

const ORIGINAL_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

beforeEach(() => {
  tableInserts = [];
  tableUpdates = [];
  insertError = null;
  updateMatches = [{ id: "con_1" }];
  constructEvent.mockReset();
  accountsRetrieve.mockReset();
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  } else {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = ORIGINAL_SECRET;
  }
  vi.restoreAllMocks();
});

describe("the Connect webhook fails CLOSED without its own signing secret", () => {
  it("refuses before constructEvent when STRIPE_CONNECT_WEBHOOK_SECRET is missing", async () => {
    // Same bug the money webhook guards against: stripe-node happily computes
    // HMAC-SHA256 keyed by the empty string, so an unconfigured deployment
    // ACCEPTS forged deliveries. Here that means a forged account.updated
    // could mark any connected account payout-ready - the exact lie step 2
    // would send an invoice on.
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");

    const res = await POST(post());

    expect(res.status).toBe(500);
    expect(await res.text()).toBe("Webhook not configured");
    expect(constructEvent).not.toHaveBeenCalled();
    expect(tableInserts).toEqual([]);
    expect(tableUpdates).toEqual([]);
    expect(logged).toHaveBeenCalled();
  });

  it("treats an empty-string secret the same as a missing one", async () => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "";
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");

    const res = await POST(post());

    expect(res.status).toBe(500);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("500, not 400, so Stripe redelivers once the secret is set", async () => {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    expect((await POST(post())).status).not.toBe(400);
  });

  it("rejects a bad signature with 400, verified against the CONNECT secret", async () => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_test";
    constructEvent.mockImplementation(() => {
      throw new Error("no signatures found matching the expected signature");
    });
    const { POST } = await import("./route");

    const res = await POST(post());

    expect(res.status).toBe(400);
    expect(constructEvent).toHaveBeenCalledTimes(1);
    // Not STRIPE_WEBHOOK_SECRET: a Connect endpoint has its own secret, and
    // signing against the wrong one rejects every real delivery.
    expect(constructEvent.mock.calls[0][2]).toBe("whsec_connect_test");
  });
});

describe("account.updated mirrors the connected account onto the contractor", () => {
  beforeEach(() => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_test";
  });

  it("writes the six mirrored columns, keyed on stripe_account_id", async () => {
    constructEvent.mockReturnValue(
      accountUpdatedEvent({
        id: "acct_live_1",
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
        requirements: { currently_due: [], disabled_reason: null },
      })
    );
    const { POST } = await import("./route");

    const res = await POST(post());

    expect(res.status).toBe(200);

    const write = tableUpdates.find((u) => u.table === "contractors");
    expect(write).toBeTruthy();
    expect(write!.payload).toMatchObject({
      stripe_charges_enabled: true,
      stripe_payouts_enabled: true,
      stripe_details_submitted: true,
      stripe_requirements_currently_due: [],
      stripe_disabled_reason: null,
    });
    // The sixth column is a timestamp, taken from the EVENT's clock rather
    // than now(), so a redelivery cannot stamp a stale payload as fresh.
    expect(write!.payload.stripe_account_synced_at).toBe(
      new Date(1_789_516_800 * 1000).toISOString()
    );

    // Keyed on the connected account id - never on a contractor id from the
    // payload, which is attacker-chosen JSON on any endpoint.
    expect(write!.filters).toContainEqual({
      op: "eq",
      args: ["stripe_account_id", "acct_live_1"],
    });
    // And scoped so an out-of-order delivery cannot walk a newer state back.
    const or = write!.filters.find((f) => f.op === "or");
    expect(String(or?.args[0])).toContain("stripe_account_synced_at.is.null");
    expect(String(or?.args[0])).toContain("stripe_account_synced_at.lt.");
  });

  it("carries a restricted account's requirements through verbatim", async () => {
    constructEvent.mockReturnValue(
      accountUpdatedEvent({
        id: "acct_live_2",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: true,
        requirements: {
          currently_due: ["external_account", "individual.id_number"],
          disabled_reason: "requirements.past_due",
        },
      })
    );
    const { POST } = await import("./route");

    await POST(post());

    const write = tableUpdates.find((u) => u.table === "contractors");
    expect(write!.payload).toMatchObject({
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: true,
      stripe_requirements_currently_due: [
        "external_account",
        "individual.id_number",
      ],
      stripe_disabled_reason: "requirements.past_due",
    });
  });

  it("claims the event id under its own namespace before writing", async () => {
    constructEvent.mockReturnValue(
      accountUpdatedEvent({ id: "acct_live_3", charges_enabled: true })
    );
    const { POST } = await import("./route");

    await POST(post());

    expect(tableInserts).toEqual([
      {
        table: "processed_stripe_events",
        payload: {
          // "connect:" so it can never collide with the money paths (bare id)
          // or the risk paths ("risk:"), which claim the same table.
          event_id: "connect:evt_connect_1",
          kind: "connect_account_updated",
        },
      },
    ]);
  });

  it("does nothing on a redelivery whose claim loses (23505)", async () => {
    insertError = { code: "23505", message: "duplicate key value" };
    constructEvent.mockReturnValue(
      accountUpdatedEvent({ id: "acct_live_4", charges_enabled: true })
    );
    const { POST } = await import("./route");

    const res = await POST(post());

    expect(res.status).toBe(200);
    // The claim was attempted, and the mirror was NOT written a second time.
    expect(tableInserts).toHaveLength(1);
    expect(tableUpdates).toEqual([]);
  });

  it("still returns 200 when the account matches no contractor row", async () => {
    // An account this platform does not know, or an event older than what is
    // already stored. Neither is an error worth making Stripe retry over.
    updateMatches = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    constructEvent.mockReturnValue(
      accountUpdatedEvent({ id: "acct_stranger", charges_enabled: true })
    );
    const { POST } = await import("./route");

    expect((await POST(post())).status).toBe(200);
  });
});

describe("account.application.deauthorized turns everything off", () => {
  beforeEach(() => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_test";
  });

  it("uses event.account (the connected account), not the payload object id", async () => {
    constructEvent.mockReturnValue({
      id: "evt_connect_deauth",
      type: "account.application.deauthorized",
      // On a Connect event this is the connected account. The data object is
      // the APPLICATION - reading .id off it would aim the write at the
      // platform's own application id and disconnect nobody.
      account: "acct_live_5",
      created: 1_789_516_800,
      data: { object: { id: "ca_platform_application", object: "application" } },
    });
    const { POST } = await import("./route");

    const res = await POST(post());

    expect(res.status).toBe(200);
    const write = tableUpdates.find((u) => u.table === "contractors");
    expect(write!.filters).toContainEqual({
      op: "eq",
      args: ["stripe_account_id", "acct_live_5"],
    });
    expect(write!.payload).toMatchObject({
      stripe_charges_enabled: false,
      stripe_payouts_enabled: false,
      stripe_details_submitted: false,
      stripe_requirements_currently_due: [],
      stripe_disabled_reason: "deauthorized",
    });
    // The account id is KEPT: it is the audit trail for every charge already
    // made, and clearing it would mint a second account for one business.
    expect(write!.payload).not.toHaveProperty("stripe_account_id");
  });
});

describe("anything else is acknowledged and ignored", () => {
  beforeEach(() => {
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = "whsec_connect_test";
  });

  it("returns 200 without touching the database", async () => {
    constructEvent.mockReturnValue({
      id: "evt_connect_other",
      type: "payout.paid",
      account: "acct_live_6",
      created: 1_789_516_800,
      data: { object: { id: "po_1" } },
    });
    const { POST } = await import("./route");

    const res = await POST(post());

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ignored: "payout.paid" });
    expect(tableInserts).toEqual([]);
    expect(tableUpdates).toEqual([]);
  });
});
