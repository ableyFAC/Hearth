import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// parcel.ts imports the service-role Supabase client, which pulls in
// "server-only" and throws the moment it is imported outside a server
// component. Mocking that module out means the real lookup logic below can be
// exercised for real against a fake table, the same trick aiUsage.test.ts uses.
// parcel.ts also states the "server-only" guard directly now (it reads
// RENTCAST_API_KEY), and that module does not resolve outside a Next build.
vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => currentAdmin,
}));

// Every parcel_cache row the code under test tried to write, in order.
let writes: { cache_key: string; source: string }[] = [];
// What the parcel_cache read should hand back (null = a miss, which is most
// tests here: those are about what happens on the way OUT).
let cachedRow: { facts: unknown; source: string; fetched_at: string } | null =
  null;

// The SECOND cache (migration 0167): the call log that sits under
// parcel_cache at the network boundary and remembers 429s and outages too, so
// a spent quota or a bad afternoon costs one call instead of one per page
// load. Tracked separately from `writes` because these are different rows in a
// different table and the assertions above must not see them.
type CacheRow = { status: string; payload: unknown; fetched_at: string };
// Keyed exactly the way the table is - (address_key, kind) - and written to by
// the fake's own upsert, so a test can assert that two differently-typed
// spellings of one address genuinely land on one row instead of being told so.
let rentcastRows = new Map<string, CacheRow>();
let rentcastWrites: { address_key: string; kind: string; status: string }[] = [];
// A PostgREST-shaped error for the rentcast_cache table only, so the
// missing-schema path (a live DB that has not run 0167) can be exercised.
let rentcastError: { code?: string; message?: string } | null = null;
// app_events rows, i.e. the F4 usage counter.
let events: { event: string; props: Record<string, unknown> | null }[] = [];
let currentAdmin: unknown = null;

function fakeAdmin() {
  return {
    from(table: string) {
      return {
        select() {
          // One chainable object: .eq() can be called once (parcel_cache) or
          // twice (rentcast_cache is keyed on address_key AND kind), and the
          // filters are kept so the lookup is by key rather than by "whatever
          // the test happened to set".
          const filters: Record<string, string> = {};
          const chain: Record<string, unknown> = {};
          chain.eq = (column: string, value: string) => {
            filters[column] = value;
            return chain;
          };
          chain.limit = async () => ({ data: [], error: null });
          chain.maybeSingle = async () => {
            if (table === "rentcast_cache") {
              if (rentcastError) return { data: null, error: rentcastError };
              const row = rentcastRows.get(
                cacheRowKey(filters.address_key, filters.kind)
              );
              return { data: row ?? null, error: null };
            }
            if (table === "users") return { data: null, error: null };
            return { data: cachedRow, error: null };
          };
          return chain;
        },
        async upsert(row: Record<string, string>) {
          if (table === "rentcast_cache") {
            rentcastWrites.push({
              address_key: row.address_key,
              kind: row.kind,
              status: row.status,
            });
            if (!rentcastError) {
              rentcastRows.set(cacheRowKey(row.address_key, row.kind), {
                status: row.status,
                payload: (row as unknown as { payload: unknown }).payload,
                fetched_at: row.fetched_at,
              });
            }
            return { error: rentcastError };
          }
          writes.push({ cache_key: row.cache_key, source: row.source });
          return { error: null };
        },
        async insert(row: {
          event: string;
          props: Record<string, unknown> | null;
        }) {
          events.push({ event: row.event, props: row.props });
          return { error: null };
        },
      };
    },
  };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function cacheRowKey(addressKey: string, kind: string): string {
  return `${addressKey}||${kind}`;
}

function agoIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

// Put a row in the call cache under the SAME key the code under test will look
// it up by - computed with the real normalizer, never hand-written, so a test
// cannot accidentally pass by seeding a key nothing reads.
function seedRentcastCache(
  street: string,
  zip: string,
  kind: "property" | "avm",
  row: { status: string; payload?: unknown; ageMs: number },
  unit?: string | null
) {
  rentcastRows.set(cacheRowKey(rentcastAddressKey(street, zip, unit), kind), {
    status: row.status,
    payload: row.payload ?? null,
    fetched_at: agoIso(row.ageMs),
  });
}

// A minimal RentCast property record: enough of an address echo that the
// parser accepts it as a real hit.
const RECORD = {
  id: "abc",
  addressLine1: "17361 Ash St",
  city: "Fountain Valley",
  state: "CA",
  zipCode: "92708",
  yearBuilt: 1968,
  owner: { names: ["JANE DOE"], type: "Individual" },
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

import { rentcastAddressKey } from "./rentcastCache";

let lookupParcel: typeof import("./parcel").lookupParcel;
let lookupMarketValue: typeof import("./parcel").lookupMarketValue;

beforeEach(async () => {
  writes = [];
  cachedRow = null;
  rentcastRows = new Map();
  rentcastWrites = [];
  rentcastError = null;
  events = [];
  currentAdmin = fakeAdmin();
  process.env.RENTCAST_API_KEY = "test-key";
  ({ lookupParcel, lookupMarketValue } = await import("./parcel"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RENTCAST_API_KEY;
});

describe("lookupParcel source semantics", () => {
  it('a found record is "rentcast" and gets cached', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, [RECORD]))
    );
    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(facts.source).toBe("rentcast");
    expect(facts.year_built).toBe(1968);
    expect(writes.some((w) => w.source === "rentcast")).toBe(true);
  });

  it('an empty array is a true miss: "none", and cached as one', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, []))
    );
    const facts = await lookupParcel("123 Fake St", "92648");
    expect(facts.source).toBe("none");
    // A miss IS an answer, so remembering it for a day is right: it keeps a
    // retype of the same unknown address from re-billing RentCast.
    expect(writes.map((w) => w.source)).toEqual(["none"]);
  });

  // Measured against the live API on 2026-08-28: RentCast answers an address
  // it holds no record for with HTTP 404 and
  // {"error":"resource/not-found","message":"No data found for address..."},
  // NOT with an empty 200 array. Four real Orange County addresses returned
  // 404 in every format tried (typed-out and USPS-abbreviated, with and
  // without city/state), while a known-good address returned 200 in ~1s - so
  // this is the shape of a MISS, and treating it as an outage told five of ten
  // testers "we couldn't reach the county records right now" about an address
  // the county records had answered plainly.
  it('a 404 is a true miss: "none", and cached as one', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(404, {
          status: 404,
          error: "resource/not-found",
          message: "No data found for address '1920 Main Street, 92614'",
        })
      )
    );
    const facts = await lookupParcel("1920 Main Street", "92614");
    expect(facts.source).toBe("none");
    // Cached, so a retype of the same unknown address does not re-bill a
    // lookup out of a 50-a-month quota. This is the whole practical
    // difference between a miss and an outage.
    expect(writes.map((w) => w.source)).toEqual(["none"]);
  });

  // The rule the two tests either side of this one enforce together: only a
  // 404 may be cached as a miss. Every other non-ok status is an outage.
  it("never caches a non-404 error status as a miss", async () => {
    for (const status of [401, 403, 429, 500, 502, 503]) {
      writes = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(status, { error: "nope" }))
      );
      const facts = await lookupParcel("17361 Ash St", "92708");
      expect(facts.source, `status ${status}`).toBe("unavailable");
      expect(writes, `status ${status}`).toEqual([]);
    }
  });

  it('a record with no address echo is also a miss, not "unavailable"', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, [{ id: "x" }]))
    );
    const facts = await lookupParcel("123 Fake St", "92648");
    expect(facts.source).toBe("none");
  });

  // The 2026-08-24 outage: a bad key on the host answered 401 for every real
  // address, every one of them collapsed into "none", and onboarding refused
  // them all for a day. Each of these must be "unavailable" instead.
  it.each([
    ["401 (bad or expired key)", 401],
    ["429 (quota exhausted)", 429],
    ["500 (provider outage)", 500],
  ])('%s is "unavailable" and is NEVER cached', async (_label, status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(status, { error: "nope" }))
    );
    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(facts.source).toBe("unavailable");
    // Blank facts, so the confirm step is a manual-entry form.
    expect(facts.year_built).toBeNull();
    expect(facts.address_line1).toBe("17361 Ash St");
    // Nothing written, under either the typed key or the canonical one: a
    // cached non-answer would outlive the fix to the key.
    expect(writes).toEqual([]);
  });

  it('an aborted (timed out) request is "unavailable" and is not cached', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        throw err;
      })
    );
    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(facts.source).toBe("unavailable");
    expect(writes).toEqual([]);
  });

  it('a network failure is "unavailable" and is not cached', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(facts.source).toBe("unavailable");
    expect(writes).toEqual([]);
  });

  // REVERSED ON 2026-09-12 (Landen addendum 4, F1), and deliberately.
  //
  // The 2026-08-28 measurement that justified a retry was real: two of eight
  // live calls never opened a socket, rejecting in ~270ms, and both succeeded
  // immediately on a second attempt. What it did not price in is that the free
  // tier is fifty calls a MONTH and the paid tier is waiting on a card. A
  // retry doubles the worst case of every failure mode - a 5xx storm most of
  // all - against a budget one bad afternoon can exhaust for everybody. The
  // call it rescued costs one homeowner some typing; the month it can burn
  // costs all of them the feature.
  it("does not retry a connection failure - one attempt, then manual entry", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        throw new TypeError("fetch failed");
      })
    );
    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(calls).toBe(1);
    expect(facts.source).toBe("unavailable");
  });

  it("does not retry an abort either", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        throw err;
      })
    );
    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(calls).toBe(1);
    expect(facts.source).toBe("unavailable");
  });

  // A status is an answer. Retrying one spends a second billed call to be told
  // the same thing - and on a 429 it pushes further into the ceiling that
  // caused it.
  it.each([
    ["404 (no such address)", 404],
    ["401 (bad or expired key)", 401],
    ["429 (quota exhausted)", 429],
    ["500 (provider outage)", 500],
  ])("never retries a %s", async (_label, status) => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return jsonResponse(status, { error: "nope" });
      })
    );
    await lookupParcel("17361 Ash St", "92708");
    expect(calls).toBe(1);
  });

  it("gives up after ONE failed attempt rather than looping", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        throw new TypeError("fetch failed");
      })
    );
    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(calls).toBe(1);
    expect(facts.source).toBe("unavailable");
    // parcel_cache still refuses to remember a non-answer as facts...
    expect(writes).toEqual([]);
    // ...while the call log remembers that we asked and could not be told, so
    // the next hundred page loads do not each buy the same silence.
    expect(rentcastWrites.map((w) => w.status)).toEqual(["error"]);
  });

  it('an unparseable body is "unavailable" and is not cached', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token < in JSON");
        },
      }))
    );
    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(facts.source).toBe("unavailable");
    expect(writes).toEqual([]);
  });

  // fetch() resolves as soon as the HEADERS arrive - the body is streamed
  // after that, and res.json() waits for all of it. The abort timer used to
  // be cleared the instant those headers landed, so a body that stalled
  // mid-stream was bounded by nothing at all: the await never returned, and
  // the whole request behind it (a claim, or a job post's lazy ownership
  // re-check) hung with it. Fake timers here so the 15s budget can be walked
  // past without the test actually waiting for it.
  it('a body that never arrives is "unavailable" and is not cached', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          // Never settles, and never rejects either.
          json: () => new Promise(() => {}),
        }))
      );
      const pending = lookupParcel("17361 Ash St", "92708");
      await vi.advanceTimersByTimeAsync(20_000);
      const facts = await pending;
      expect(facts.source).toBe("unavailable");
      expect(writes).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('an AVM body that never arrives is "unavailable" and is not cached', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          json: () => new Promise(() => {}),
        }))
      );
      const pending = lookupMarketValue("17361 Ash St", "92708");
      await vi.advanceTimersByTimeAsync(20_000);
      const facts = await pending;
      expect(facts.source).toBe("unavailable");
      expect(writes).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('with no key configured nothing is looked up and the source is "none"', async () => {
    delete process.env.RENTCAST_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(facts.source).toBe("none");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("lookupMarketValue source semantics", () => {
  it("caches a real estimate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          price: 890_000,
          priceRangeLow: 840_000,
          priceRangeHigh: 950_000,
        })
      )
    );
    const facts = await lookupMarketValue("17361 Ash St", "92708");
    expect(facts.market_value).toBe(890_000);
    expect(facts.source).toBe("rentcast");
    expect(writes.map((w) => w.source)).toEqual(["rentcast"]);
    // The AVM key is separate from the property-record key, so the two can
    // never overwrite each other for the same address. It is a JSON array
    // tagged "avm" rather than a string with separators in it - see the
    // collision test below.
    expect(JSON.parse(writes[0].cache_key)[0]).toBe("avm");
  });

  it("keys the cache per unit, so two condos never share one estimate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { price: 500_000 }))
    );
    await lookupMarketValue("17361 Ash St", "92708", "4B");
    expect(JSON.parse(writes[0].cache_key)).toEqual([
      "avm",
      "17361 ash st",
      "4b",
      "92708",
    ]);
  });

  // The street line is free text a homeowner types, and the old key glued the
  // parts together with "/" and "|". "17361 Ash St/4b" with no unit built
  // BYTE-FOR-BYTE the same key as "17361 Ash St" with unit "4B", so one
  // address could be served - and could overwrite - another's estimate.
  it("cannot collide when the street itself contains the separator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { price: 500_000 }))
    );
    await lookupMarketValue("17361 Ash St/4b", "92708");
    await lookupMarketValue("17361 Ash St", "92708", "4B");
    expect(writes).toHaveLength(2);
    expect(writes[0].cache_key).not.toBe(writes[1].cache_key);
  });

  it("cannot collide when the street contains the field separator", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { price: 500_000 }))
    );
    await lookupMarketValue("17361 Ash St|92708", "12345");
    await lookupMarketValue("17361 Ash St", "92708");
    expect(writes).toHaveLength(2);
    expect(writes[0].cache_key).not.toBe(writes[1].cache_key);
  });

  it('a valid object with no price is a real miss: "none", and is cached', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, { message: "no estimate available" }))
    );
    const facts = await lookupMarketValue("17361 Ash St", "92708");
    expect(facts.source).toBe("none");
    expect(facts.market_value).toBeNull();
    expect(writes.map((w) => w.source)).toEqual(["none"]);
  });

  // Same rule as the property record: a 404 is RentCast saying it has no
  // estimate for this address, which is an answer worth remembering for a day
  // rather than an outage worth re-billing on every visit to /value.
  it('a 404 is a real miss: "none", and is cached', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(404, { error: "resource/not-found" }))
    );
    const facts = await lookupMarketValue("17361 Ash St", "92708");
    expect(facts.source).toBe("none");
    expect(facts.market_value).toBeNull();
    expect(writes.map((w) => w.source)).toEqual(["none"]);
  });

  it.each([
    ["401 (bad or expired key)", 401],
    ["429 (quota exhausted)", 429],
    ["500 (provider outage)", 500],
  ])('%s is "unavailable" and is NEVER cached', async (_label, status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(status, { error: "nope" }))
    );
    const facts = await lookupMarketValue("17361 Ash St", "92708");
    expect(facts.source).toBe("unavailable");
    expect(writes).toEqual([]);
  });

  it('a 200 body that is not even an object is "unavailable", not a miss', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(200, "service temporarily down"))
    );
    const facts = await lookupMarketValue("17361 Ash St", "92708");
    expect(facts.source).toBe("unavailable");
    expect(writes).toEqual([]);
  });

  it('a timeout is "unavailable" and is not cached', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        throw err;
      })
    );
    const facts = await lookupMarketValue("17361 Ash St", "92708");
    expect(facts.source).toBe("unavailable");
    expect(writes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Source-text checks. The refusal gates are one-line conditions whose exact
// SHAPE is the fix: rewriting an explicit `=== "no_match"` as `!== "match"`
// (or as a truthy check on blank facts) compiles, passes every other test,
// works perfectly while the sources are up, and re-creates the outage the
// moment one of them goes down.
// ---------------------------------------------------------------------------
function src(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("the onboarding refusal gates", () => {
  const onboarding = src("../app/onboarding/actions.ts");

  // 2026-08-28: the Continue step used to refuse on `publicFacts.source ===
  // "none"`, i.e. on RentCast having no record. Measuring RentCast against
  // four plausible Orange County addresses (all four a hard 404) showed its
  // silence is not evidence about whether a home exists, so the refusal moved
  // to the geocoder. This shape must not come back.
  it("never refuses on a records miss", () => {
    expect(onboarding).not.toContain('publicFacts.source === "none"');
    expect(onboarding).not.toContain('facts.source === "none"');
  });

  it("refuses only on an explicit geocoder no_match", () => {
    // `=== "no_match"` and nothing looser. `!== "match"` would swallow
    // "unavailable" - a Photon timeout, a 500, an empty answer - back into a
    // refusal, which is the 2026-08-24 outage with a different vendor's name
    // on it.
    expect(onboarding).toContain('verdict === "no_match"');
    expect(onboarding).not.toContain('verdict !== "match"');
    expect(onboarding).not.toContain("!verdict");
  });

  it("spends a geocoder call only when there is no county record", () => {
    // A found record IS confirmation the address is real; asking Photon to
    // agree would be a second lookup to learn nothing.
    expect(onboarding).toContain('publicFacts.source !== "rentcast"');
    expect(onboarding).toContain('claimFacts?.source === "rentcast"');
  });

  it("routes the claim-time decision through the tested gate", () => {
    // The claim gate's behaviour lives in parcelGate.test.ts; this just holds
    // the action to calling it rather than re-deriving the rule inline.
    expect(onboarding).toContain("claimAddressGate({");
    expect(onboarding).toContain('gate.reason === "lookup_blocked"');
  });

  it("attaches parcel facts only when a record was actually found", () => {
    // Now that a miss walks on to the claim, every parcel-derived value on an
    // unedited claim still comes out of a hidden form field - so a hand-made
    // POST for an address nothing has a record for could otherwise arrive
    // carrying a parcel number, a sale price and an assessed value.
    expect(onboarding).toContain('claimFacts.source === "rentcast"');
  });

  it("gates the ownership write on the shared recording rule", () => {
    // Not just "unverified vs verified": recording ANYTHING stamps
    // ownership_checked_at and burns the lazy re-check. See
    // shouldRecordOwnershipCheck in ownershipMatch.ts.
    expect(onboarding).toContain("shouldRecordOwnershipCheck(facts)");
    // And the third lookupParcel call is gone: the ownership check reuses the
    // facts the gate already fetched - and drops them when the record turns
    // out to describe a different street than the one being claimed (see
    // parcelFactsMatchClaim / src/lib/addressMatch.ts).
    expect(onboarding).toContain(
      "const facts = parcelFactsMatchClaim ? claimFacts : null;"
    );
    // Three lookupParcel calls in the whole file, and no more: one in
    // lookupParcelAction (the Continue step), and two in claimPropertyAction
    // (the corrected-address lookup and the unedited re-check, only one of
    // which ever runs). A fourth would be the ownership check re-asking a
    // question the gate already answered.
    expect(onboarding.match(/await lookupParcel\(/g)?.length ?? 0).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// The claim path's hardening, 2026-08-28. Each of these is a one-line shape
// whose absence is silent: the claim still works, the tests still pass, and the
// only difference is that a hand-made POST gets to choose the answer.
// ---------------------------------------------------------------------------
describe("claimPropertyAction's outbound metering", () => {
  const onboarding = src("../app/onboarding/actions.ts");
  // Just the claim action, so lookupParcelAction's own limiter next door
  // cannot stand in for the one being checked here.
  const claim = onboarding.slice(
    onboarding.indexOf("export async function claimPropertyAction")
  );

  // The two calls that can reach a third party from inside the claim. RentCast
  // is billed per lookup; Photon is free but rate-limited by a stranger, and
  // both used to be metered only when the homeowner had EDITED the street.
  // address_line1 and looked_up_address both come from FormData, so a post that
  // sets them equal to each other and to a fresh street each time took the
  // "unedited" branch, spent both calls, and consumed nothing on the way.
  it("spends the budget before either outbound call, on both branches", () => {
    const meter = claim.indexOf("rate_limit_hit");
    const rentcast = claim.indexOf("await lookupParcel(");
    const photon = claim.indexOf("verifyAddressExists(");
    expect(meter).toBeGreaterThan(-1);
    expect(rentcast).toBeGreaterThan(meter);
    expect(photon).toBeGreaterThan(meter);
  });

  it("spends the same per-user buckets the Continue step does", () => {
    expect(claim).toContain("parcel:${user.id}");
    expect(claim).toContain("parcel-day:${user.id}");
  });

  it("skips both lookups when the budget is spent", () => {
    // One flag, read by the edited branch, the unedited branch AND the
    // geocoder call - a refusal that still asked Photon would not be a meter.
    expect(claim).toContain("if (addressEdited && !lookupBlocked) {");
    expect(claim).toContain("!addressEdited && !lookupBlocked");
    expect(claim).toContain("const addressVerdict = lookupBlocked");
  });

  it("fails open, so a limiter outage never blocks a real claim", () => {
    // `allowed === false` and nothing looser: `!allowed` would turn a null
    // from a missing RPC into a refused signup.
    expect(claim).toContain(
      "const lookupBlocked = allowedHour === false || allowedDay === false;"
    );
  });
});

describe("claimPropertyAction's parcel facts", () => {
  const onboarding = src("../app/onboarding/actions.ts");
  const claim = onboarding.slice(
    onboarding.indexOf("export async function claimPropertyAction")
  );

  // Until 2026-08-28 an unedited claim read every one of these back out of a
  // hidden form field. parcelFactsMatchClaim only ever proved that SOME record
  // exists for the street - never that the posted numbers came out of it - so a
  // forged post could pick its own coordinates (which /value, the weather
  // alerts and pro matching all key off), its own county assessment and its own
  // parcel number, on a real address, and every one of them would be stored as
  // county data.
  it.each([
    "parcel_id",
    "latitude",
    "longitude",
    "hoa_fee",
    "county",
    "assessed_value",
    "assessed_year",
    "purchase_date",
    "purchase_price",
    "market_value",
    "market_value_low",
    "market_value_high",
    "property_tax_history",
    "system_facts",
  ])("never reads %s out of the post", (field) => {
    expect(claim).not.toContain(`formData.get("${field}")`);
    expect(claim).not.toContain(`formData, "${field}"`);
  });

  it("reads them from the server's own lookup instead", () => {
    // claimFacts, not relookupFacts: the latter is null on the unedited
    // branch, which is the branch that was being trusted.
    expect(claim).toContain("parcelText(claimFacts?.parcel_id");
    expect(claim).toContain("parcelNum(claimFacts?.latitude");
    expect(claim).toContain("parcelNum(claimFacts?.longitude");
    expect(claim).toContain("parcelNum(claimFacts?.purchase_price");
    expect(claim).toContain("parcelNum(claimFacts?.assessed_value");
    expect(claim).toContain("claimFacts?.property_tax_history");
    expect(claim).toContain("claimFacts?.system_facts");
  });

  // lookupParcel asks for the property record only and never for an estimate,
  // so ParcelFacts.market_value is null on every path through onboarding. The
  // only numbers that ever filled these columns came from the post.
  it("writes no AVM at claim time", () => {
    expect(claim).toContain("market_value: null,");
    expect(claim).toContain("market_value_low: null,");
    expect(claim).toContain("market_value_high: null,");
  });

  // The sanity gate measures a figure against the home's estimate and its
  // size. Both used to come from the claim: a posted market_value raised the
  // building-level ceiling to ten times whatever it liked, and a posted sqft
  // over SMALL_HOME_SQFT switched the absolute ceiling off - either one walks
  // the $34,000,000 building price this gate exists to refuse onto the row.
  it("hands the sanity gate nothing the post can set", () => {
    expect(claim).toContain("estimate: null,");
    expect(claim).toContain("sqft: parcelInt(claimFacts?.sqft, 1, 1_000_000),");
    expect(claim).not.toContain("estimate: claimMarketValue");
  });

  // system_facts is typed Record<string, string>, but a type annotation is
  // not a runtime check: its values are built out of a third-party JSON body
  // and land on home_systems.material_or_model for every starter row. The
  // coercion itself moved to buildStarterSystems (src/lib/starterSystems.ts,
  // materialText()) when the starter-seed logic was pulled out of this file -
  // asserted behaviorally there (starterSystems.test.ts, "untrusted material
  // values"), and asserted here only that claimPropertyAction still feeds it
  // the server's own systemFacts map rather than something the post could
  // shape.
  it("passes the server's own systemFacts map into the starter-seed builder", () => {
    expect(claim).toContain("materials: systemFacts,");
    const starterSystems = src("./starterSystems.ts");
    expect(starterSystems).toContain(
      'typeof value === "string" && value.trim()'
    );
  });
});

describe("the lazy ownership re-check on first job post", () => {
  const contractors = src("../app/(app)/contractors/actions.ts");

  it("uses the same recording rule, so an outage keeps its retry", () => {
    expect(contractors).toContain("shouldRecordOwnershipCheck(facts)");
  });
});

describe("the AVM refresh action", () => {
  const valueActions = src("../app/(app)/value/actions.ts");

  it("is metered, since an uncached outage would reach RentCast every call", () => {
    expect(valueActions).toContain("rate_limit_hit");
    expect(valueActions).toContain("avm:${userId}");
    expect(valueActions).toContain("avm-day:${userId}");
  });

  it("spends its own buckets, never the onboarding lookup budget", () => {
    expect(valueActions).not.toContain("parcel:${userId}");
    expect(valueActions).not.toContain("parcel-day:${userId}");
  });

  it("meters BOTH paths that can reach RentCast, on the one budget", () => {
    // There are two: the free first-estimate fetch, and the Plus-only manual
    // refresh. They cost the same money, so they share one per-user budget -
    // a second entry point with its own (or no) limit would be a way around
    // the first one's.
    const calls = valueActions.match(/avmBudgetAllows\(/g) ?? [];
    // One declaration plus one call from each action.
    expect(calls.length).toBe(3);
  });

  it("refuses a refresh from a free account server-side", () => {
    // The button a free account sees is a link to /plus, not a submit, but
    // the action is callable directly by anything holding a session: the only
    // path that can bill RentCast a SECOND time for one home checks
    // membership on the server before it spends anything.
    const refresh = valueActions.indexOf(
      "export async function refreshMarketValueAction"
    );
    expect(refresh).toBeGreaterThan(-1);
    const gate = valueActions.indexOf("await hasPlus()", refresh);
    const lookup = valueActions.indexOf("lookupMarketValue(", refresh);
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(lookup);
  });
});

describe("parcel.ts caching", () => {
  const parcel = src("./parcel.ts");

  it("guards both cache writers against an unavailable result", () => {
    // Two writers (the property record and the AVM), each gated.
    const guards = parcel.match(/facts\.source !== "unavailable"/g) ?? [];
    expect(guards.length).toBe(2);
  });

  it("logs the HTTP status on the unavailable path", () => {
    expect(parcel).toContain(
      "RentCast returned HTTP ${res.status} for address lookup"
    );
  });

  // Order is the fix. `if (!res.ok)` matches a 404 too, so the 404 branch only
  // means anything while it comes first - move it after and every unknown
  // address is an "outage" again, with the tests above the only thing to say
  // so. Checked on both call sites (property record and AVM).
  it("classifies a 404 before falling into the not-ok branch", () => {
    const miss1 = parcel.indexOf("res.status === 404");
    const notOk1 = parcel.indexOf("if (!res.ok)");
    const miss2 = parcel.indexOf("res.status === 404", miss1 + 1);
    const notOk2 = parcel.indexOf("if (!res.ok)", notOk1 + 1);
    expect(miss1).toBeGreaterThan(-1);
    expect(miss2).toBeGreaterThan(miss1);
    expect(notOk2).toBeGreaterThan(notOk1);
    expect(miss1).toBeLessThan(notOk1);
    expect(miss2).toBeLessThan(notOk2);
  });

  // One timeout, one attempt (F1). The retry loop and its second budget are
  // gone, so the only thing left to pin is that the single ceiling is real,
  // generous against a measured 0.5-2.3s answer, and short enough that a
  // homeowner is not left watching a spinner.
  it("bounds the one attempt with a single timeout and no retry loop", () => {
    const timeout = Number(
      parcel.match(/RENTCAST_TIMEOUT_MS = ([\d_]+)/)?.[1].replace(/_/g, "")
    );
    expect(timeout).toBeGreaterThanOrEqual(3_000);
    expect(timeout).toBeLessThanOrEqual(12_000);
    // The signal is the timeout: no hand-rolled AbortController/attempt
    // bookkeeping to drift out of step with it.
    expect(parcel).toContain("AbortSignal.timeout(RENTCAST_TIMEOUT_MS)");
    // The retry loop is gone, not merely bounded to one pass.
    expect(parcel).not.toContain("attempt <= 2");
    expect(parcel).not.toContain("RENTCAST_MIN_RETRY_MS");
  });

  // The read-through that actually defends the 50-a-month ceiling (F2/F5):
  // every outbound call is funnelled through one function, so there is no
  // second path around the cache.
  it("routes every outbound call through the one cached request helper", () => {
    // Exactly one fetch( call site in the whole module.
    const fetchCalls = parcel.match(/await fetch\(/g) ?? [];
    expect(fetchCalls.length).toBe(1);
    // ...and it is inside rentcastRequest, after the cache read.
    const request = parcel.indexOf("async function rentcastRequest");
    const cacheRead = parcel.indexOf("readRentcastCache(", request);
    const theFetch = parcel.indexOf("await fetch(", request);
    expect(request).toBeGreaterThan(-1);
    expect(cacheRead).toBeGreaterThan(request);
    expect(theFetch).toBeGreaterThan(cacheRead);
  });
});

// CEO pass D4 (persona H4): lookupParcelAction only floored the street field
// (MIN_ADDRESS_LENGTH) before spending it on a billed RentCast call and,
// on a miss, a geocoder call - there was no ceiling, so a crafted post could
// hand an arbitrarily long string to an outbound request URL. Scoped to just
// lookupParcelAction, the same slicing trick "the onboarding refusal gates"
// above uses, so claimPropertyAction's own (pre-existing) cappedField call on
// address_line1 can't stand in for the one being checked here.
describe("lookupParcelAction caps the street field before any outbound call", () => {
  const onboarding = src("../app/onboarding/actions.ts");
  const lookup = onboarding.slice(
    onboarding.indexOf("export async function lookupParcelAction"),
    onboarding.indexOf("export async function claimPropertyAction")
  );

  it("slices street to MAX_ADDRESS_LENGTH once, right after the floor check", () => {
    expect(lookup).toContain(
      "const cappedStreet = street.trim().slice(0, MAX_ADDRESS_LENGTH);"
    );
  });

  it("spends the capped value on both outbound calls, not the raw field", () => {
    // The RentCast call (lookupParcel) and the geocoder fallback
    // (verifyAddressExists) are the two calls this action can make; neither
    // may read the uncapped `street` directly.
    //
    // Matched with a whitespace-tolerant regex rather than an exact "(\n      "
    // literal: this checkout has CRLF line endings, so a pinned "\n" plus a
    // fixed indent failed on the line break and on any reformat of the call,
    // neither of which is the thing being guarded. What matters is that the
    // FIRST argument is cappedStreet.
    expect(lookup).toMatch(/await lookupParcel\(\s*cappedStreet,/);
    expect(lookup).toContain(
      "await verifyAddressExists(cappedStreet, zip.trim());"
    );
    expect(lookup).not.toMatch(/lookupParcel\(\s*street\.trim\(\),/);
    expect(lookup).not.toContain("verifyAddressExists(street.trim(),");
  });
});

// ---------------------------------------------------------------------------
// Landen addendum 4 (2026-09-12): the free tier is FIFTY calls a month and the
// paid tier is waiting on the business card, so every one of these is really
// the same test - "did this cost a call it did not have to?".
// ---------------------------------------------------------------------------
describe("F1: every failure is a typed miss, and costs exactly one call", () => {
  let rentcastRequest: typeof import("./parcel").rentcastRequest;
  const ctx = {
    kind: "property" as const,
    addressKey: '["17361 ash st","92708",null]',
    userId: null,
  };

  beforeEach(async () => {
    ({ rentcastRequest } = await import("./parcel"));
  });

  it("a 429 is a quota miss, with exactly one fetch", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(429, { error: "quota" }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await rentcastRequest("https://example.test", "k", "test", ctx);
    expect(out).toEqual({ ok: false, reason: "quota", status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a 404 is a not_found miss, not an outage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(404, { error: "no" })));
    const out = await rentcastRequest("https://example.test", "k", "test", ctx);
    expect(out).toEqual({ ok: false, reason: "not_found" });
  });

  it("a 5xx and a network failure are both error misses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(500, {})));
    expect(
      await rentcastRequest("https://example.test", "k", "test", ctx)
    ).toMatchObject({ ok: false, reason: "error" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    expect(
      await rentcastRequest("https://example.test", "k", "test", ctx)
    ).toEqual({ ok: false, reason: "error" });
  });

  // A ceiling does not always arrive as a 429: a plan limit can come back as a
  // 403 with an explanatory body. Filed as "quota" so it gets the quota TTL
  // rather than being retried as if something had merely broken.
  it("reads a quota-shaped body on a non-429 as quota", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 403,
        headers: new Headers(),
        text: async () => '{"message":"You have exceeded your plan limit"}',
        json: async () => ({}),
      }))
    );
    const out = await rentcastRequest("https://example.test", "k", "test", ctx);
    expect(out).toMatchObject({ ok: false, reason: "quota" });
  });

  it("never throws at its caller", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      })
    );
    await expect(
      rentcastRequest("https://example.test", "k", "test", ctx)
    ).resolves.toMatchObject({ ok: false });
  });
});

describe("F2/F5: the call cache is read before anything goes out", () => {
  it("serves a cached property record without fetching", async () => {
    // Written years ago as far as the clock is concerned: a parcel's year
    // built and lot size do not change, so an "ok" property row never expires.
    seedRentcastCache("17361 Ash St", "92708", "property", {
      status: "ok",
      payload: [RECORD],
      ageMs: 900 * DAY_MS,
    });
    const fetchMock = vi.fn(async () => jsonResponse(200, [RECORD]));
    vi.stubGlobal("fetch", fetchMock);

    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(facts.source).toBe("rentcast");
    expect(facts.year_built).toBe(1968);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("serves a cached quota miss for an hour, then asks again", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, [RECORD]));
    vi.stubGlobal("fetch", fetchMock);

    // 59 minutes into a spent quota: do not go back and ask.
    seedRentcastCache("17361 Ash St", "92708", "property", {
      status: "quota",
      ageMs: 59 * 60_000,
    });
    const stillOut = await lookupParcel("17361 Ash St", "92708");
    expect(stillOut.source).toBe("unavailable");
    expect(fetchMock).not.toHaveBeenCalled();

    // Past the hour, the ceiling may well have moved: ask once.
    seedRentcastCache("17361 Ash St", "92708", "property", {
      status: "quota",
      ageMs: 2 * HOUR_MS,
    });
    const retried = await lookupParcel("17361 Ash St", "92708");
    expect(retried.source).toBe("rentcast");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-fetches an AVM older than 30 days, and serves a younger one", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { price: 910_000 }));
    vi.stubGlobal("fetch", fetchMock);

    // An estimate IS a moving number, so unlike a parcel record it goes stale.
    seedRentcastCache("17361 Ash St", "92708", "avm", {
      status: "ok",
      payload: { price: 800_000 },
      ageMs: 31 * DAY_MS,
    });
    const refreshed = await lookupMarketValue("17361 Ash St", "92708");
    expect(refreshed.market_value).toBe(910_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    seedRentcastCache("17361 Ash St", "92708", "avm", {
      status: "ok",
      payload: { price: 800_000 },
      ageMs: 3 * DAY_MS,
    });
    const served = await lookupMarketValue("17361 Ash St", "92708");
    expect(served.market_value).toBe(800_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The property record is filed against the STREET (RentCast returns the same
  // building record whichever unit rides along), but an AVM is a price for one
  // dwelling - so unit 4B must never be served unit 2A's estimate.
  it("keys the AVM per unit and the property record per street", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { price: 500_000 }));
    vi.stubGlobal("fetch", fetchMock);

    seedRentcastCache(
      "500 Beach Blvd",
      "92648",
      "avm",
      { status: "ok", payload: { price: 640_000 }, ageMs: DAY_MS },
      "4B"
    );
    // Unit 4B is cached; unit 2A is a different dwelling and a different row.
    expect((await lookupMarketValue("500 Beach Blvd", "92648", "4B")).market_value).toBe(
      640_000
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await lookupMarketValue("500 Beach Blvd", "92648", "2A")).market_value).toBe(
      500_000
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // A live DB that has not run 0167 yet must behave exactly as it did before
  // this change: call RentCast, show the homeowner their facts, degrade
  // silently. The cache is an optimisation, never a dependency.
  it("falls through to the fetch when the table is missing", async () => {
    rentcastError = { code: "42P01", message: "relation does not exist" };
    const fetchMock = vi.fn(async () => jsonResponse(200, [RECORD]));
    vi.stubGlobal("fetch", fetchMock);

    const facts = await lookupParcel("17361 Ash St", "92708");
    expect(facts.source).toBe("rentcast");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The household case the cap was written for: a second member of the same
  // home re-runs onboarding. They type the address their own way, so the row
  // is only shared if the KEY canonicalizes both spellings to one string.
  it("a household member re-running onboarding hits the same cached row", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, [RECORD]));
    vi.stubGlobal("fetch", fetchMock);

    // The first person types it out in full. Nothing is seeded: this call is
    // what WRITES the row, through the fake's own upsert.
    await lookupParcel("1770 South Harbor Boulevard", "92708");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rentcastWrites).toHaveLength(1);

    // The second types the USPS-abbreviated form, in a different case, with a
    // stray double space and a ZIP+4. Same home, same row, no second call -
    // and the row is the one the first call actually left behind, not one this
    // test planted. parcel_cache is keyed on the raw lowercase line, so it
    // misses here on purpose: this is about the call cache underneath it.
    const second = await lookupParcel("1770  s harbor blvd", "92708-1234");
    expect(second.source).toBe("rentcast");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("F4: the usage counter", () => {
  it("records one rentcast_call per REAL call, with the endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, [RECORD])));
    await lookupParcel("17361 Ash St", "92708");
    const calls = events.filter((e) => e.event === "rentcast_call");
    expect(calls.length).toBe(1);
    expect(calls[0].props).toMatchObject({ endpoint: "property", status: 200 });
  });

  it("records nothing for a cache hit, because a cache hit is not a call", async () => {
    seedRentcastCache("17361 Ash St", "92708", "property", {
      status: "ok",
      payload: [RECORD],
      ageMs: DAY_MS,
    });
    const fetchMock = vi.fn(async () => jsonResponse(200, [RECORD]));
    vi.stubGlobal("fetch", fetchMock);
    await lookupParcel("17361 Ash St", "92708");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(events.filter((e) => e.event === "rentcast_call")).toEqual([]);
  });

  it("marks a network failure as such rather than inventing a status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    await lookupMarketValue("17361 Ash St", "92708");
    const calls = events.filter((e) => e.event === "rentcast_call");
    expect(calls.length).toBe(1);
    expect(calls[0].props).toMatchObject({ endpoint: "avm", status: "network" });
  });

  // The header names are READ off the response, never guessed: RentCast's
  // docs do not pin them down and this has not been run against a live 429.
  it("logs whatever ratelimit headers the response actually carries", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({
          "X-RateLimit-Remaining": "37",
          "X-RateLimit-Reset": "1757721600",
          "Content-Type": "application/json",
        }),
        json: async () => [RECORD],
        text: async () => "",
      }))
    );
    await lookupParcel("17361 Ash St", "92708");
    const props = events.find((e) => e.event === "rentcast_call")?.props;
    expect(props).toMatchObject({
      ratelimit_remaining: "37",
      ratelimit_reset: "1757721600",
    });
    // Content-Type is not a rate-limit header and must not be dragged along.
    expect(
      Object.keys(
        (props as { ratelimit_headers?: Record<string, string> })
          ?.ratelimit_headers ?? {}
      )
    ).toEqual(["x-ratelimit-remaining", "x-ratelimit-reset"]);
  });
});

describe("F3: the lookups that are skipped entirely", () => {
  const onboarding = src("../app/onboarding/actions.ts");
  const lookup = onboarding.slice(
    onboarding.indexOf("export async function lookupParcelAction"),
    onboarding.indexOf("export async function claimPropertyAction")
  );

  it("checks for an already-claimed address before calling RentCast", () => {
    const reuse = lookup.indexOf("parcelFactsFromExistingProperty(");
    const call = lookup.indexOf("await lookupParcel(");
    expect(reuse).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(reuse);
  });

  // Read through src/lib/internalAccounts.ts (migration 0165), not a second
  // copy of the same users.is_internal query: one reader, so "internal" can
  // never mean one thing on the pro side and another here.
  it("checks the internal flag before calling RentCast", () => {
    const internal = lookup.indexOf("isInternalUser(");
    const call = lookup.indexOf("await lookupParcel(");
    expect(internal).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(internal);
    expect(onboarding).toContain('from "@/lib/internalAccounts"');
  });

  // An internal account gets the manual-entry note, NOT a refusal - so the
  // geocoder's "no_match" verdict, which is the only thing that can turn this
  // action into an error, must not run for them.
  it("never turns a skipped internal lookup into a refusal", () => {
    expect(lookup).toContain(
      'if (publicFacts.source !== "rentcast" && !internalAccount) {'
    );
  });

  // Copying a stranger's purchase price or assessment onto a new draft would
  // be handing one household another's numbers. Only the building's public
  // shape travels.
  it("copies building facts off an existing row, never money or owner", () => {
    const parcel = src("./parcel.ts");
    const reuse = parcel.slice(
      parcel.indexOf("export async function parcelFactsFromExistingProperty"),
      parcel.indexOf("function numOrNull")
    );
    expect(reuse).toContain("year_built:");
    expect(reuse).toContain("sqft:");
    expect(reuse).toContain("beds:");
    expect(reuse).toContain("lot_size_sqft:");
    for (const forbidden of [
      "purchase_price:",
      "purchase_date:",
      "assessed_value:",
      "assessed_year:",
      "hoa_fee:",
      "property_tax_history:",
      "owner_names:",
      "owner_type:",
    ]) {
      expect(reuse).not.toContain(forbidden);
    }
  });
});

describe("F2: the manual refresh's 24-hour floor", () => {
  const valueActions = src("../app/(app)/value/actions.ts");
  const refresh = valueActions.slice(
    valueActions.indexOf("export async function refreshMarketValueAction")
  );

  it("checks the cached call's age before spending anything", () => {
    const age = refresh.indexOf("cachedMarketValueAgeMs(");
    const budget = refresh.indexOf("avmBudgetAllows(");
    const call = refresh.indexOf("lookupMarketValue(");
    expect(age).toBeGreaterThan(-1);
    // Before the rate-limit budget as well as before the call: a press that
    // costs nothing must not eat the allowance a real refresh needs.
    expect(budget).toBeGreaterThan(age);
    expect(call).toBeGreaterThan(age);
  });

  it("returns the stored value with a plain 'Updated ...' line", () => {
    expect(refresh).toContain("RENTCAST_REFRESH_MIN_AGE_MS");
    expect(refresh).toContain("`Updated ${relativeAge(cachedAge)}`");
  });
});
