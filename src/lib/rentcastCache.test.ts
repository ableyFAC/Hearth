import { describe, expect, it, vi } from "vitest";

// rentcastCache.ts states the "server-only" guard directly (it reads and
// writes through the service-role client), and that module does not resolve
// outside a Next build. Same trick parcel.test.ts uses.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => {
    throw new Error("no database in this test");
  },
}));

import {
  isRentcastCacheFresh,
  rentcastAddressKey,
  RENTCAST_AVM_TTL_MS,
  RENTCAST_MISS_TTL_MS,
  RENTCAST_REFRESH_MIN_AGE_MS,
} from "./rentcastCache";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// The address key is the whole cap. Two spellings of one home that produce two
// keys are two billed calls out of fifty a month, and nobody would ever see it
// happen - the product would just quietly work and quietly cost double.
describe("rentcastAddressKey", () => {
  it("collapses case, whitespace and ZIP+4", () => {
    const a = rentcastAddressKey("17361 Ash St", "92708");
    expect(rentcastAddressKey("  17361   ASH st ", "92708-1234")).toBe(a);
  });

  // The pay-off for building on the repo's existing normalizers
  // (houseNumberOf/streetTokensOf, src/lib/addressMatch.ts) rather than a
  // lowercase-and-trim: a homeowner typing a street out in full and a county
  // record using USPS abbreviations are one cached call, not two.
  it("canonicalizes directionals and street types", () => {
    const spelled = rentcastAddressKey("1770 South Harbor Boulevard", "92708");
    expect(rentcastAddressKey("1770 S Harbor Blvd", "92708")).toBe(spelled);
    expect(rentcastAddressKey("1770 s harbor blvd", "92708")).toBe(spelled);
  });

  it("keeps genuinely different homes apart", () => {
    const base = rentcastAddressKey("1770 S Harbor Blvd", "92708");
    // A different house number is a different home...
    expect(rentcastAddressKey("2170 S Harbor Blvd", "92708")).not.toBe(base);
    // ...as is a different street, a different directional, and the same
    // street line in another ZIP.
    expect(rentcastAddressKey("1770 S Beach Blvd", "92708")).not.toBe(base);
    expect(rentcastAddressKey("1770 N Harbor Blvd", "92708")).not.toBe(base);
    expect(rentcastAddressKey("1770 S Harbor Blvd", "92648")).not.toBe(base);
  });

  it("includes the unit only when one is given", () => {
    const street = rentcastAddressKey("500 Beach Blvd", "92648");
    expect(rentcastAddressKey("500 Beach Blvd", "92648", null)).toBe(street);
    expect(rentcastAddressKey("500 Beach Blvd", "92648", "  ")).toBe(street);
    const unit4b = rentcastAddressKey("500 Beach Blvd", "92648", "4B");
    expect(unit4b).not.toBe(street);
    expect(rentcastAddressKey("500 Beach Blvd", "92648", "4b")).toBe(unit4b);
    expect(rentcastAddressKey("500 Beach Blvd", "92648", "2A")).not.toBe(unit4b);
  });

  // A street is free text a homeowner types. Concatenating it with separators
  // let "123 Main St|4b" typed as a street build the same key as "123 Main St"
  // with unit "4B" - one address served, and overwriting, another's answer.
  it("cannot be made to collide by typing separators into the street", () => {
    expect(rentcastAddressKey('123 Main St","92708","4b', "92708")).not.toBe(
      rentcastAddressKey("123 Main St", "92708", "4b")
    );
  });

  // A line the tokenizer can make nothing of must not collapse to the empty
  // string, which would file every junk address in a ZIP under one row and
  // serve the first one's answer to all of them.
  it("never files unparseable lines under one shared key", () => {
    const a = rentcastAddressKey("...", "92708");
    const b = rentcastAddressKey("???", "92708");
    expect(a).not.toBe(b);
    expect(a).not.toBe(rentcastAddressKey("", "92708"));
  });
});

describe("isRentcastCacheFresh", () => {
  const now = Date.UTC(2026, 8, 12, 12, 0, 0);
  const fresh = (
    kind: "property" | "avm",
    status: "ok" | "not_found" | "quota" | "error",
    ageMs: number
  ) => isRentcastCacheFresh(kind, status, now - ageMs, now);

  // A parcel's year built and lot size are the same answer next year, so a
  // settled property record is never worth re-buying.
  it("keeps a settled property record forever", () => {
    expect(fresh("property", "ok", 10 * 365 * DAY)).toBe(true);
  });

  // A miss is not settled: coverage improves, so an unknown address is
  // re-asked after 90 days (and not before, on a 50-call monthly budget).
  it("re-asks a property not_found after 90 days", () => {
    expect(fresh("property", "not_found", 89 * DAY)).toBe(true);
    expect(fresh("property", "not_found", 91 * DAY)).toBe(false);
  });

  // An estimate is a moving number, so it does go stale.
  it("expires an AVM at 30 days", () => {
    expect(fresh("avm", "ok", RENTCAST_AVM_TTL_MS - MINUTE)).toBe(true);
    expect(fresh("avm", "ok", RENTCAST_AVM_TTL_MS + MINUTE)).toBe(false);
    expect(fresh("avm", "not_found", RENTCAST_AVM_TTL_MS + MINUTE)).toBe(false);
  });

  // The point of the negative TTL: an outage or a spent quota costs one call
  // an hour instead of one per page load, without freezing a transient failure
  // in front of a home for the rest of the day.
  it("holds a quota or error for one hour, both kinds", () => {
    for (const kind of ["property", "avm"] as const) {
      for (const status of ["quota", "error"] as const) {
        expect(fresh(kind, status, RENTCAST_MISS_TTL_MS - MINUTE)).toBe(true);
        expect(fresh(kind, status, RENTCAST_MISS_TTL_MS + MINUTE)).toBe(false);
      }
    }
  });

  // Server clocks drift and a row can come back stamped in the future. Reading
  // that as "infinitely stale" would make the cache fire a call every time.
  it("treats a future timestamp as fresh rather than infinitely stale", () => {
    expect(isRentcastCacheFresh("avm", "ok", now + HOUR, now)).toBe(true);
  });
});

describe("the refresh floor", () => {
  // Deliberately shorter than the 30-day AVM TTL and longer than the 1-hour
  // negative TTL: it answers "did pressing this button need to spend a call?",
  // which is a different question from "is the stored estimate still usable?".
  it("sits between the negative TTL and the AVM TTL", () => {
    expect(RENTCAST_REFRESH_MIN_AGE_MS).toBe(DAY);
    expect(RENTCAST_REFRESH_MIN_AGE_MS).toBeGreaterThan(RENTCAST_MISS_TTL_MS);
    expect(RENTCAST_REFRESH_MIN_AGE_MS).toBeLessThan(RENTCAST_AVM_TTL_MS);
  });
});
