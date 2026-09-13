import { describe, it, expect, vi } from "vitest";

// "server-only" has no Node resolution outside the Next build, so it is
// stubbed the same way every other server-module test in this repo does it
// (src/app/(app)/plus/planSwitch.test.ts, the push/Stripe/Twilio route tests).
vi.mock("server-only", () => ({}));

// And the service-role client is faked, so these helpers can be driven for
// real against a fake table instead of asserted at the level of source text.
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => currentAdmin,
}));

let currentAdmin: unknown = null;

import {
  isInternalUser,
  isInternalContractor,
  internalUserIdsAmong,
} from "./internalAccounts";

type Row = { id: string; is_internal: boolean };
type Result = { data: unknown; error: unknown };

// The slice of the client these helpers use: .from(table).select(cols) then
// either .eq(...).maybeSingle() (single lookup) or .in(...).eq(...) (batch).
function fakeAdmin(opts: {
  users?: Row[];
  contractors?: Row[];
  // When set, every query answers this error instead of data.
  error?: { code?: string; message?: string };
  // When set, .from() throws - the "client blew up entirely" case.
  throws?: boolean;
}) {
  const tables: Record<string, Row[]> = {
    users: opts.users ?? [],
    contractors: opts.contractors ?? [],
  };
  return {
    from(table: string) {
      if (opts.throws) throw new Error("boom");
      let rows = tables[table] ?? [];
      const api: Record<string, unknown> = {};
      const settle = (): Result =>
        opts.error ? { data: null, error: opts.error } : { data: rows, error: null };
      Object.assign(api, {
        select: () => api,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((r) => (r as any)[col] === val);
          return api;
        },
        in: (col: string, vals: unknown[]) => {
          rows = rows.filter((r) => vals.includes((r as any)[col]));
          return api;
        },
        maybeSingle: () => {
          const res = settle();
          return Promise.resolve(
            res.error ? res : { data: rows[0] ?? null, error: null }
          );
        },
        // The batch helper awaits the builder itself rather than calling a
        // terminal method, so it has to be thenable.
        then: (resolve: (r: Result) => unknown) => resolve(settle()),
      });
      return api;
    },
  };
}

const MISSING_COLUMN = {
  code: "42703",
  message: 'column "is_internal" does not exist',
};

describe("isInternalUser", () => {
  it("is true for a user row flagged internal", async () => {
    currentAdmin = fakeAdmin({ users: [{ id: "u-yes", is_internal: true }] });
    await expect(isInternalUser("u-yes")).resolves.toBe(true);
  });

  it("is false for a real user row", async () => {
    currentAdmin = fakeAdmin({ users: [{ id: "u-no", is_internal: false }] });
    await expect(isInternalUser("u-no")).resolves.toBe(false);
  });

  it("is false for an id with no row at all", async () => {
    currentAdmin = fakeAdmin({ users: [] });
    await expect(isInternalUser("u-ghost")).resolves.toBe(false);
  });

  // The whole point of the missing-schema tolerance: until 0165 is pasted to
  // the live database the column does not exist, and answering "false" is the
  // pre-0165 behaviour. Failing closed would hide real pros from real
  // homeowners the moment the database hiccuped.
  it("is false when migration 0165 has not been applied (missing column)", async () => {
    currentAdmin = fakeAdmin({ users: [], error: MISSING_COLUMN });
    await expect(isInternalUser("u-premigration")).resolves.toBe(false);
  });

  it("is false, not a throw, when the read fails for any other reason", async () => {
    currentAdmin = fakeAdmin({
      users: [],
      error: { code: "57014", message: "canceling statement due to timeout" },
    });
    await expect(isInternalUser("u-timeout")).resolves.toBe(false);
  });

  it("is false, not a throw, when the client itself blows up", async () => {
    currentAdmin = fakeAdmin({ throws: true });
    await expect(isInternalUser("u-boom")).resolves.toBe(false);
  });

  // An anonymous visitor is never internal. This is what keeps the public pro
  // pages, the OG cards and the sitemap showing real pros only, and it must
  // cost no query at all.
  it("is false for a null / undefined / empty id, without querying", async () => {
    currentAdmin = fakeAdmin({ throws: true });
    await expect(isInternalUser(null)).resolves.toBe(false);
    await expect(isInternalUser(undefined)).resolves.toBe(false);
    await expect(isInternalUser("")).resolves.toBe(false);
  });
});

describe("isInternalContractor", () => {
  it("is true for a contractors row flagged internal", async () => {
    currentAdmin = fakeAdmin({
      contractors: [{ id: "c-yes", is_internal: true }],
    });
    await expect(isInternalContractor("c-yes")).resolves.toBe(true);
  });

  it("is false for a real contractors row", async () => {
    currentAdmin = fakeAdmin({
      contractors: [{ id: "c-no", is_internal: false }],
    });
    await expect(isInternalContractor("c-no")).resolves.toBe(false);
  });

  it("is false when migration 0165 has not been applied", async () => {
    currentAdmin = fakeAdmin({ contractors: [], error: MISSING_COLUMN });
    await expect(isInternalContractor("c-premigration")).resolves.toBe(false);
  });

  it("is false for a null id, without querying", async () => {
    currentAdmin = fakeAdmin({ throws: true });
    await expect(isInternalContractor(null)).resolves.toBe(false);
  });
});

describe("internalUserIdsAmong", () => {
  it("returns just the internal ids out of the batch", async () => {
    currentAdmin = fakeAdmin({
      users: [
        { id: "a", is_internal: true },
        { id: "b", is_internal: false },
        { id: "c", is_internal: true },
      ],
    });
    const got = await internalUserIdsAmong(["a", "b", "c", "d"]);
    expect([...got].sort()).toEqual(["a", "c"]);
  });

  it("is empty for an empty input, without querying", async () => {
    currentAdmin = fakeAdmin({ throws: true });
    expect((await internalUserIdsAmong([])).size).toBe(0);
  });

  // Empty means "nobody is internal", which makes the caller's filter a no-op
  // and keeps the notification fan-out working rather than silently dropping
  // every recipient.
  it("is empty when migration 0165 has not been applied", async () => {
    currentAdmin = fakeAdmin({ users: [], error: MISSING_COLUMN });
    expect((await internalUserIdsAmong(["a", "b"])).size).toBe(0);
  });

  it("is empty, not a throw, when the client blows up", async () => {
    currentAdmin = fakeAdmin({ throws: true });
    expect((await internalUserIdsAmong(["a"])).size).toBe(0);
  });
});
