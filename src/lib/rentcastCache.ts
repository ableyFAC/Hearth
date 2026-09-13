// The RentCast call cache: one row per (normalized address, endpoint), so the
// free tier's 50 lookups a month are never spent twice on the same question.
//
// WHY THIS EXISTS ALONGSIDE parcel_cache (migration 0071). parcel_cache stores
// the DERIVED facts (a ParcelFacts / MarketValueFacts blob) and deliberately
// never stores a non-answer: a 401, a 429, a 5xx or a timeout is not evidence
// about an address, so it is not written, and every retry of that address goes
// back out to the network. That rule is right for the facts layer and wrong
// for the quota: during an outage, or once the monthly ceiling is hit, the old
// behaviour was an unbounded retry storm against an API that bills per call.
//
// So this table sits UNDER that one, at the network boundary, and remembers
// the CALL rather than the facts:
//   * "ok" / "not_found" - a settled answer from RentCast. Kept forever for a
//     property record (a parcel's year built and lot size do not change) and
//     for 30 days for an AVM (an estimate does).
//   * "quota" / "error"  - we asked and could not be told. Kept for ONE HOUR:
//     long enough that a hundred page loads during an outage cost one call,
//     short enough that a transient failure is not frozen in front of a home.
// Nothing here is ever shown to a homeowner as a fact; the facts layer above
// re-derives everything it displays from the cached payload, exactly as it
// would from a live response body.
//
// Service-role only, by table grant (migration 0167): the admin client is the
// only reader and the only writer.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/dbErrors";
import { houseNumberOf, streetTokensOf } from "@/lib/addressMatch";
import type { Json } from "@/lib/database.types";

// Which RentCast endpoint a row is about. These are the two the app calls:
// /v1/properties (the assessor record) and /v1/avm/value (the estimate).
export type RentcastCacheKind = "property" | "avm";

// What happened on the call. Mirrors the typed miss the fetch layer hands its
// callers (src/lib/parcel.ts): a 404 is "not_found", a 429 or a quota-shaped
// body is "quota", anything else that isn't a 2xx - including a timeout or a
// network failure - is "error".
export type RentcastCacheStatus = "ok" | "not_found" | "quota" | "error";

export type RentcastCacheRow = {
  status: RentcastCacheStatus;
  // The parsed response body for an "ok" row, null for every other status.
  payload: unknown;
  fetchedAt: number;
};

// An AVM is a moving number, so a stored estimate goes stale. A property
// record is not: the year a house was built and the size of its lot are the
// same answer next year, so an "ok"/"not_found" property row never expires.
export const RENTCAST_AVM_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// A property "not_found" is re-asked after 90 days (see isRentcastCacheFresh):
// RentCast's coverage of the launch metro is patchy and improving, so a miss
// must not be permanent, but it also must not be re-bought daily on a
// 50-call monthly budget.
export const RENTCAST_PROPERTY_NOT_FOUND_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// How long a "we could not be told" is remembered. One hour is the whole
// point of the row: it stops a retry storm without hiding a transient outage
// (or a restored quota) for the rest of the day.
export const RENTCAST_MISS_TTL_MS = 60 * 60 * 1000;

// The manual "Refresh estimate" button's own floor (F2). Shorter than the
// 30-day AVM TTL on purpose: this is the answer to "did pressing this button
// need to spend a call?", not to "is the stored estimate still usable?".
export const RENTCAST_REFRESH_MIN_AGE_MS = 24 * 60 * 60 * 1000;

// Is a stored row still good enough to serve instead of calling RentCast?
//
// Exported and pure so the TTL rules are testable without a database, and so
// the one place that needs a DIFFERENT window (the manual refresh, above) is
// visibly the exception rather than a second copy of this logic.
export function isRentcastCacheFresh(
  kind: RentcastCacheKind,
  status: RentcastCacheStatus,
  fetchedAt: number,
  now: number = Date.now()
): boolean {
  const age = now - fetchedAt;
  if (age < 0) return true; // clock skew: a future timestamp is not stale.
  if (status === "quota" || status === "error") return age < RENTCAST_MISS_TTL_MS;
  // "ok" / "not_found" from here down.
  //
  // KNOWN TRADE-OFF, and the one rule here worth arguing about. "ok" forever
  // is uncontroversial: a parcel's year built and lot size are the same answer
  // next year. "not_found" forever is the sharp edge. RentCast's coverage of
  // the launch metro is patchy and measurably improving - four plausible
  // Orange County addresses came back 404 in one night in August - and
  // parcel_cache deliberately re-checked a miss after 24 hours so a
  // newly-recorded parcel would be picked up "rather than staying blank for a
  // month". Under this rule it stays blank permanently: that home's auto-fill
  // never fills, and the lazy ownership re-check on first job post
  // (src/app/(app)/contractors/actions.ts) can never upgrade it either.
  //
  // So a property "ok" is kept forever, and a property "not_found" gets a
  // finite 90-day window (RENTCAST_PROPERTY_NOT_FOUND_TTL_MS): long enough that
  // 50 calls a month are never spent re-asking the same unknown address, short
  // enough that a newly recorded parcel is picked up within a season. Decided
  // 2026-09-12 at review; the AVM window below is unchanged.
  if (kind === "property") {
    return status === "ok" || age < RENTCAST_PROPERTY_NOT_FOUND_TTL_MS;
  }
  return age < RENTCAST_AVM_TTL_MS;
}

// The address key every row is filed under.
//
// NOT a new normalizer: it is built from the repo's existing address
// normalizers (houseNumberOf / streetTokensOf in src/lib/addressMatch.ts), the
// same pair the onboarding confirm step already uses to decide whether a
// county record describes the address the homeowner picked. That buys more
// than a lowercase-and-trim would: "1770 South Harbor Boulevard" and "1770 S
// Harbor Blvd" canonicalize to the same tokens, so they are one cached call
// rather than two billed ones.
//
// The ZIP is part of the key (street lines repeat across cities). Only the
// first five digits: a ZIP+4 is the same post office.
//
// THE UNIT IS THE CALLER'S CHOICE, and the two endpoints answer differently.
// /v1/properties is filed against the STREET - RentCast hands back the same
// building record whichever unit rides along - so the property-record key
// omits it (same reasoning as parcelCacheKey in src/lib/parcel.ts). An AVM is
// a price for a specific dwelling, so the AVM key includes it and unit 4B
// never inherits unit 2A's estimate.
//
// JSON, not concatenation: a street is free text a homeowner types, and
// "123 Main St|4b" typed as a street must not collide with "123 Main St" plus
// unit "4B". JSON.stringify escapes the separators into the values.
export function rentcastAddressKey(
  street: string,
  zip: string,
  unit?: string | null
): string {
  const houseNumber = houseNumberOf(street);
  const tokens = streetTokensOf(street);
  const canonical = [houseNumber, ...tokens].filter(Boolean).join(" ");
  // A line the tokenizer could make nothing of (punctuation only, an empty
  // box) must NOT collapse to "", which would file every such address under
  // one row. Fall back to the plain collapsed line instead.
  const line =
    canonical || street.trim().replace(/\s+/g, " ").toLowerCase();
  const z = (zip ?? "").trim().slice(0, 5);
  const u = (unit ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return JSON.stringify([line, z, u || null]);
}

// Read one cached call. Returns null for a miss AND for every failure mode -
// a database that has not run 0167, a dropped connection, an unrecognized
// row - because the caller's correct response to all of them is identical:
// behave as if there were no cache and call RentCast. Never throws.
export async function readRentcastCache(
  addressKey: string,
  kind: RentcastCacheKind
): Promise<RentcastCacheRow | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("rentcast_cache")
      .select("status, payload, fetched_at")
      .eq("address_key", addressKey)
      .eq("kind", kind)
      .maybeSingle();
    if (error) {
      if (!isMissingSchemaError(error)) {
        console.error("RentCast cache read failed:", error.message);
      }
      return null;
    }
    if (!data) return null;
    const fetchedAt = new Date(data.fetched_at).getTime();
    if (!Number.isFinite(fetchedAt)) return null;
    const status = data.status as RentcastCacheStatus;
    if (
      status !== "ok" &&
      status !== "not_found" &&
      status !== "quota" &&
      status !== "error"
    ) {
      return null;
    }
    return { status, payload: data.payload ?? null, fetchedAt };
  } catch (err) {
    console.error("RentCast cache read failed:", err);
    return null;
  }
}

// Remember one call. Best-effort in exactly the same way as the read: a write
// that cannot land costs a future duplicate call, which is strictly better
// than failing the lookup it was meant to make cheaper. Never throws.
export async function writeRentcastCache(
  addressKey: string,
  kind: RentcastCacheKind,
  status: RentcastCacheStatus,
  payload: unknown
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await (admin as any).from("rentcast_cache").upsert(
      {
        address_key: addressKey,
        kind,
        status,
        // Only a settled "ok" carries a body. A miss stores null rather than
        // an error blob: nothing reads it, and a provider error message is
        // not something to keep.
        payload: (status === "ok" ? (payload as Json) : null) ?? null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "address_key,kind" }
    );
    if (error && !isMissingSchemaError(error)) {
      console.error("RentCast cache write failed:", error.message);
    }
  } catch (err) {
    console.error("RentCast cache write failed:", err);
  }
}
