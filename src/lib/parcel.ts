// Parcel pre-fill (Screen 1). Looks up baseline property facts from a real
// records source so onboarding can skip re-typing what public records already
// know. The wired source is RentCast (https://www.rentcast.io/api): public
// tax-assessor and county-record data behind a simple JSON API with a free
// tier (50 lookups/month), which fits launch scale - each lookup makes a
// single call (the property record only). Enable it by setting
// RENTCAST_API_KEY in the environment;
// without a key, lookupParcel() never invents facts: it only echoes back the
// street and ZIP the homeowner typed and leaves everything it doesn't
// actually know (city, state, year built, sqft, beds/baths, lot size,
// property type, and everything else below) null for them to fill in or
// skip.

// Build-time guard: this module reads RENTCAST_API_KEY, so importing it from a
// Client Component must fail the build rather than ship the key. It was
// already guarded transitively (it imports the service-role client, which is
// "server-only"), but a transitive guard survives only as long as that import
// does. Stated directly here it cannot be lost to a refactor.
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/dbErrors";
import { trackServerEvent } from "@/lib/trackServer";
import {
  isRentcastCacheFresh,
  readRentcastCache,
  rentcastAddressKey,
  writeRentcastCache,
  type RentcastCacheKind,
} from "@/lib/rentcastCache";
import type { Json } from "@/lib/database.types";

// The amenity flags/specs the starter-seed expansion (src/lib/starterSystems.ts)
// gates its EXTRA rows on - garage door, pool equipment, fireplace/chimney -
// plus the exterior material the always-added siding row uses. A separate
// shape from system_facts (below) because these aren't strings: pool/garage/
// fireplace are true booleans from RentCast's `features` object, and
// materialText-style coercion doesn't apply to a boolean the way it does to a
// brand name.
export interface HomeSeedFeatures {
  exteriorType: string | null;
  pool: boolean | null;
  garage: boolean | null;
  garageSpaces: number | null;
  fireplace: boolean | null;
}

export interface ParcelFacts {
  parcel_id: string | null;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  year_built: number | null;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  lot_size_sqft: number | null;
  property_type: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  assessed_value: number | null;
  assessed_year: number | null;
  property_tax_history: { year: number; amount: number }[] | null;
  latitude: number | null;
  longitude: number | null;
  hoa_fee: number | null;
  county: string | null;
  market_value: number | null;
  market_value_low: number | null;
  market_value_high: number | null;
  // Maps a home_systems system_type (matching STARTER_SYSTEMS in
  // onboarding/actions.ts) to a material/model string read off the property
  // record, so the starter-seeded rows aren't left blank when RentCast
  // actually knows the roof/foundation/HVAC.
  system_facts: Record<string, string> | null;
  // Garage/pool/fireplace/exterior flags for the starter-seed expansion (see
  // HomeSeedFeatures above). Server-only, same reasoning as owner_names below:
  // PublicParcelFacts omits it, so it never ships to the browser. There is no
  // legitimate client use for it today (claimPropertyAction reads it off its
  // own server-side lookupParcel call, never off the post), and keeping it
  // server-only means a future client field can't accidentally start trusting
  // amenity flags a forged post could otherwise supply.
  home_features: HomeSeedFeatures | null;
  // County assessor owner-of-record, for ownership verification (migration
  // 0093, src/lib/ownershipMatch.ts). Server-only, and enforced as such:
  // lookupParcelAction (onboarding/actions.ts) strips these three fields from
  // the value it returns to the browser (see PublicParcelFacts below), so the
  // client never receives the owner-of-record that claimPropertyAction later
  // matches the typed name against - exposing it would be handing over the
  // answer key. Server callers that legitimately need it (claimPropertyAction
  // and contractors/actions.ts) read the full ParcelFacts from lookupParcel()
  // directly instead.
  owner_names: string[] | null;
  owner_type: "individual" | "organization" | null;
  owner_occupied: boolean | null;
  // Three states, and the difference between the last two is the whole reason
  // this union has three members:
  //   "rentcast"    - the records source answered and knows this address.
  //   "none"        - the records source answered and has NO such address (a
  //                   true miss: an HTTP 404, or an empty result), or no
  //                   RENTCAST_API_KEY is configured so nothing was looked up
  //                   at all.
  //   "unavailable" - we could not ask: a non-ok HTTP status OTHER than 404 (a
  //                   bad or expired key returns 401, an exhausted quota 429,
  //                   an outage 5xx), a timeout/abort, a network error, or a
  //                   body we couldn't parse. Not evidence about the address,
  //                   so it must
  //                   never be treated as "this home does not exist" and must
  //                   never be cached - see lookupParcel below and the refusal
  //                   gates in src/app/onboarding/actions.ts. On 2026-08-24 a
  //                   bad key on the host turned every real address into a
  //                   refusal for a day, because this used to collapse into
  //                   "none".
  source: "rentcast" | "none" | "unavailable";
}

// The client-safe subset of ParcelFacts. lookupParcelAction returns this, not
// ParcelFacts, so the owner-of-record fields (owner_names/owner_type/
// owner_occupied) can never ship to the browser: they are the answer key the
// claim-time ownership check compares the typed name against. OnboardingForm
// only ever reads the fields below, so nothing on the client loses anything.
// home_features joins the omitted list for the same reason: it's read by
// claimPropertyAction off its own server-side lookup, never off what the
// client posts back (see the field's own comment on ParcelFacts above).
export type PublicParcelFacts = Omit<
  ParcelFacts,
  "owner_names" | "owner_type" | "owner_occupied" | "home_features"
>;

// Shared by lookupParcel's request key and its canonical-key dual-write
// below: normalizes whitespace/case on the street and takes the 5-digit ZIP
// so "123  Main St" / "123 main st" hit the same row.
// "|v2" (migration 0093): ParcelFacts gained owner_names/owner_type/
// owner_occupied for ownership verification, so a row cached before that
// change has no owner data. Bumping the key makes every such row a natural
// miss - it just refetches once instead of silently serving stale facts
// with owner data missing.
//
// The unit is deliberately NOT part of this key, and lookupParcel does not
// send it either. The tempting theory is that unit 4B and unit 2A are separate
// parcels with separate owners of record - true of the county filing, but not
// of what RentCast returns: /v1/properties matches on the street address and
// hands back the same base building record whichever unit rides along in the
// string. Keying per unit would therefore buy nothing but N billed lookups and
// N cache rows for one building, all holding identical facts, and the
// ownership match it would appear to sharpen would still be a match against
// the BUILDING's owner of record. Street + ZIP is what the record is actually
// keyed on, so that is the key - and a claim that carries a unit is treated as
// unverifiable rather than checked against the building (see
// claimPropertyAction in src/app/onboarding/actions.ts).
function parcelCacheKey(street: string, zip: string): string {
  return (
    street.trim().replace(/\s+/g, " ").toLowerCase() +
    "|" +
    zip.trim().slice(0, 5) +
    "|v2"
  );
}

// RentCast's endpoints take ONE `address` query parameter - a single formatted
// string, "Street, City, State, Zip" per their docs - with no separate
// unit/secondary-address field anywhere in the request, so a unit can only
// travel as part of the street portion. Only lookupMarketValue below still
// does that: an AVM is a price for a specific dwelling, so asking for the unit
// is asking a different question. The property-record lookup does not (see
// parcelCacheKey above) - it gets the same building record regardless.
function lookupStreet(street: string, unit?: string | null): string {
  const s = street.trim();
  const u = (unit ?? "").trim();
  return u ? `${s} ${u}` : s;
}

export async function lookupParcel(
  street: string,
  zip: string,
  // Accepted and ignored. Callers that hold a property row (the claim, the
  // lazy re-check in contractors/actions.ts) still pass property.unit, and
  // taking it here keeps them compiling - but nothing is done with it, because
  // RentCast returns the base building record for the street either way. The
  // unit is display-only (formatAddressLine, src/lib/addressLine.ts); it is
  // never a lookup key and never narrows the owner of record.
  _unit?: string | null,
  // Who the call is on behalf of, for the usage counter only (F4). Null is a
  // legitimate value - a cron or a background path has no user - and nothing
  // about the lookup itself changes with it.
  userId?: string | null
): Promise<ParcelFacts> {
  // A successful RentCast lookup bills one call, so serve a fresh cached
  // result (migration 0069) instead of re-billing the same address. All
  // cache I/O below is wrapped so any error degrades to "just call
  // RentCast": the cache must never break onboarding. parcel.ts is
  // server-only, so the admin client is safe here.
  const cacheKey = parcelCacheKey(street, zip);
  const admin = createAdminClient();

  try {
    const { data: row } = await admin
      .from("parcel_cache")
      .select("facts, source, fetched_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (row) {
      // Fresh = a real record inside 30 days, or a "nothing found" miss inside
      // 1 day (so a newly-listed / recently-recorded parcel gets re-checked
      // soon rather than staying blank for a month).
      const ageMs = Date.now() - new Date(row.fetched_at).getTime();
      const fresh =
        (row.source === "rentcast" && ageMs < 30 * 24 * 60 * 60 * 1000) ||
        (row.source === "none" && ageMs < 24 * 60 * 60 * 1000);
      if (fresh) return row.facts as unknown as ParcelFacts;
    }
  } catch (err) {
    console.error("Parcel cache read failed:", err);
  }

  const facts = await fetchParcelFacts(street, zip, userId ?? null);

  // NEVER cache an "unavailable" result, under this key or the canonical one
  // below. A 401 from a bad key, a 429, a 5xx or a timeout says nothing about
  // the address, and writing it would freeze that non-answer in front of the
  // home for a whole cache window - which is how one bad key on the host
  // turned into a day of rejected signups. A miss ("none") is still cached for
  // a day: that IS an answer, and remembering it keeps a retype of the same
  // unknown address from re-billing RentCast.
  if (facts.source !== "unavailable") {
    try {
      await admin.from("parcel_cache").upsert(
        {
          cache_key: cacheKey,
          facts: facts as unknown as Json,
          source: facts.source,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" }
      );
    } catch (err) {
      console.error("Parcel cache write failed:", err);
    }
  }

  // Dual-write under RentCast's own canonical address+ZIP too (read-through
  // miss only - a fresh cache hit above already returned before reaching
  // here). RentCast can correct the ZIP the homeowner typed (e.g. typed
  // 92708, the record's real ZIP is 92647), and the onboarding confirm
  // screen pre-fills that corrected ZIP (OnboardingForm.tsx), so
  // claimPropertyAction's claim-time re-check (src/app/onboarding/actions.ts)
  // calls lookupParcel with the CORRECTED zip, not the one this call cached
  // under. Without this, that second call misses the cache and bills
  // RentCast a second time for the same signup. Best-effort, same as every
  // other cache write here.
  if (facts.source === "rentcast" && facts.zip) {
    const canonicalKey = parcelCacheKey(facts.address_line1, facts.zip);
    if (canonicalKey !== cacheKey) {
      try {
        await admin.from("parcel_cache").upsert(
          {
            cache_key: canonicalKey,
            facts: facts as unknown as Json,
            source: facts.source,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "cache_key" }
        );
      } catch (err) {
        console.error("Parcel cache canonical-key write failed:", err);
      }
    }
  }

  return facts;
}

// The actual RentCast lookup, unchanged from the original lookupParcel body.
// Split out so lookupParcel can wrap it in the read-through cache above.
async function fetchParcelFacts(
  street: string,
  zip: string,
  userId: string | null
): Promise<ParcelFacts> {
  const key = process.env.RENTCAST_API_KEY;
  if (key) {
    try {
      // Single call: the property record only. The AVM market-value lookup
      // was removed, so market_value fields stay null (home value can be
      // entered manually later on the value page).
      // Either a real record, blank facts marked "unavailable" (we couldn't
      // ask), or null for a true miss. Only null falls through to blankFacts.
      const record = await fetchFromRentcast(street.trim(), zip.trim(), key, userId);
      if (record) return record;
    } catch (err) {
      // fetchFromRentcast catches its own failures, so this is a belt-and-
      // braces path (an unexpected throw). It is still a "couldn't ask", not
      // a "no such address".
      console.error("RentCast lookup failed:", err);
      return unavailableFacts(street, zip);
    }
  }
  // address_line1 is the street line; the unit lives in its own column and is
  // never folded in here.
  return blankFacts(street, zip);
}

// The subset of RentCast's property-record response we read. Every field is
// optional: records for rural or recently subdivided parcels can be sparse,
// and a missing field must stay null rather than become a guess.
type RentcastFeatures = {
  roofType?: string;
  heatingType?: string;
  coolingType?: string;
  foundationType?: string;
  exteriorType?: string;
  pool?: boolean;
  garage?: boolean;
  fireplace?: boolean;
  architectureType?: string;
  floorCount?: number;
  roomCount?: number;
  // Documented on RentCast's property-record features object but not read
  // until now. Widening the type costs nothing (every field here is already
  // optional, and the request/URL is unchanged - this only reads more of the
  // SAME response body), and garageSpaces feeds the starter-seed's garage
  // door note (src/lib/starterSystems.ts). unitCount is read but not acted on
  // yet - see the API proposal in reports/seed-expand.md for what it could
  // unlock (multi-family unit-count-aware seeding).
  garageSpaces?: number;
  unitCount?: number;
};

type RentcastTaxAssessment = { year?: number; value?: number; land?: number; improvements?: number };
type RentcastPropertyTax = { year?: number; total?: number };
type RentcastHistoryEntry = { event?: string; date?: string; price?: number };

// The assessor's owner-of-record. Optional throughout: sparse/rural records
// can omit it entirely, and a missing owner must resolve to "can't verify",
// never a guessed match.
type RentcastOwner = {
  names?: string[];
  type?: string;
  mailingAddress?: { addressLine1?: string; zipCode?: string };
};

type RentcastRecord = {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
  // RentCast's secondary address line, where a condo/apartment unit usually
  // lands. Not read as a value (the homeowner's own typed unit is the one
  // stored), only acknowledged here so the shape is documented.
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  latitude?: number;
  longitude?: number;
  yearBuilt?: number;
  squareFootage?: number;
  bedrooms?: number;
  bathrooms?: number;
  lotSize?: number;
  propertyType?: string;
  assessorID?: string;
  lastSaleDate?: string;
  hoa?: { fee?: number };
  features?: RentcastFeatures;
  taxAssessments?: Record<string, RentcastTaxAssessment>;
  propertyTaxes?: Record<string, RentcastPropertyTax>;
  history?: Record<string, RentcastHistoryEntry>;
  owner?: RentcastOwner;
  ownerOccupied?: boolean;
};

// Normalizes RentCast's owner.type ("Individual" | "Organization", per their
// docs) to OakTend's lowercase enum. Anything unrecognized stays null rather
// than guessed - ownershipMatch.ts treats a null owner_type as "can't
// verify", same as a missing owner entirely.
function normalizeOwnerType(value: string | null | undefined): "individual" | "organization" | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (v === "individual" || v === "organization") return v;
  return null;
}

// RentCast returns human-readable property types ("Single Family", "Condo",
// "Townhouse", "Multi-Family", "Apartment", "Manufactured", "Land"), but the
// onboarding confirm screen's <select> only knows OakTend's snake_case enum
// (PROPERTY_TYPES in src/lib/constants.ts). An unmapped defaultValue makes the
// browser silently fall back to the first option, "single_family", so every
// unnormalized value would misfile as a single-family home. Map what we
// recognize and return null for everything else (Manufactured, Land, future
// values): an honest blank beats a confident wrong answer.
const RENTCAST_PROPERTY_TYPES: Record<string, string> = {
  "single family": "single_family",
  condo: "condo",
  townhouse: "townhouse",
  "multi-family": "multi_family",
  apartment: "multi_family",
};

function normalizePropertyType(value: string | null | undefined): string | null {
  if (!value) return null;
  return RENTCAST_PROPERTY_TYPES[value.trim().toLowerCase()] ?? null;
}

// There used to be a stripUnit() here, to take the unit back off an address
// the records source echoed after we had sent it as part of the street. The
// unit no longer goes out with the property-record request at all (see
// parcelCacheKey), so there is nothing to take back off: record.addressLine1
// is the building's street line, which is exactly what address_line1 means.

// lastSaleDate is an ISO timestamp string; onboarding only stores the date
// portion (properties.purchase_date is a `date` column).
function toDateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

// The sale price isn't always on the lastSaleDate entry itself (RentCast's
// most recent sale can be missing a price, e.g. a non-arm's-length transfer),
// so fall back to the most recent history entry that DOES have one.
function derivePurchasePrice(
  history: Record<string, RentcastHistoryEntry> | undefined,
  lastSaleDate: string | undefined
): number | null {
  if (!history) return null;
  const entries = Object.values(history);
  if (lastSaleDate) {
    const match = entries.find((e) => e.date === lastSaleDate);
    if (match && typeof match.price === "number") return match.price;
  }
  const withPrice = entries
    .filter((e): e is RentcastHistoryEntry & { date: string; price: number } =>
      typeof e.price === "number" && typeof e.date === "string"
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return withPrice[0]?.price ?? null;
}

function deriveAssessed(
  taxAssessments: Record<string, RentcastTaxAssessment> | undefined
): { assessed_value: number | null; assessed_year: number | null } {
  if (!taxAssessments) return { assessed_value: null, assessed_year: null };
  const entries = Object.values(taxAssessments).filter(
    (e): e is RentcastTaxAssessment & { year: number } => typeof e.year === "number"
  );
  if (entries.length === 0) return { assessed_value: null, assessed_year: null };
  const latest = entries.reduce((a, b) => (b.year > a.year ? b : a));
  return {
    assessed_value: typeof latest.value === "number" ? latest.value : null,
    assessed_year: latest.year,
  };
}

function derivePropertyTaxHistory(
  propertyTaxes: Record<string, RentcastPropertyTax> | undefined
): { year: number; amount: number }[] | null {
  if (!propertyTaxes) return null;
  const entries = Object.values(propertyTaxes)
    .filter(
      (e): e is RentcastPropertyTax & { year: number; total: number } =>
        typeof e.year === "number" && typeof e.total === "number"
    )
    .map((e) => ({ year: e.year, amount: e.total }))
    .sort((a, b) => a.year - b.year);
  return entries.length > 0 ? entries : null;
}

// Maps a subset of RentCast's `features` object to the STARTER_SYSTEMS
// system_type keys onboarding seeds (foundation, roof, hvac), so those rows
// start with a real material instead of a blank. Only keys we actually have a
// value for are included.
function deriveSystemFacts(
  features: RentcastFeatures | undefined
): Record<string, string> | null {
  if (!features) return null;
  const facts: Record<string, string> = {};
  if (features.roofType) facts.roof = features.roofType;
  if (features.foundationType) facts.foundation = features.foundationType;
  const hvacParts: string[] = [];
  if (features.heatingType) hvacParts.push(`${features.heatingType} heat`);
  if (features.coolingType) hvacParts.push(`${features.coolingType} A/C`);
  if (hvacParts.length > 0) facts.hvac = hvacParts.join(", ");
  return Object.keys(facts).length > 0 ? facts : null;
}

// Maps RentCast's `features` object to HomeSeedFeatures (above), for the
// starter-seed expansion's flagged extra rows (garage door, pool, fireplace)
// and its always-added siding material. Returns null only when there is no
// features object at all - a features object with every flag false/absent
// still returns real (all-null/false) facts, which is different information
// than "we don't know": it says RentCast checked and this home has none of
// them, not that the question was never asked.
function deriveHomeFeatures(
  features: RentcastFeatures | undefined
): HomeSeedFeatures | null {
  if (!features) return null;
  return {
    exteriorType: features.exteriorType ?? null,
    pool: typeof features.pool === "boolean" ? features.pool : null,
    garage: typeof features.garage === "boolean" ? features.garage : null,
    garageSpaces:
      typeof features.garageSpaces === "number" ? features.garageSpaces : null,
    fireplace:
      typeof features.fireplace === "boolean" ? features.fireplace : null,
  };
}

// The whole time budget for one RentCast call, headers AND body, and the only
// timeout in this file.
//
// ONE ATTEMPT, NO RETRY - a deliberate reversal of the 2026-08-28 policy, and
// the reason is the meter rather than the wire. That measurement was real: two
// of eight live calls never opened a socket, rejecting in ~270ms, and both
// succeeded immediately on a second attempt, so a retry genuinely rescued
// them. What it did not price in is that the free tier is 50 calls a MONTH and
// the paid tier is waiting on a card. A retry doubles the worst case of every
// failure mode - including a 5xx storm, which is exactly when a provider least
// wants a second request - and it does it against a budget that a single bad
// afternoon can exhaust for everyone. The failure it rescued now degrades to
// manual entry, which onboarding already handles gracefully and which costs a
// homeowner some typing; the failure it caused (a burnt month of quota) costs
// every homeowner the feature. 6 seconds against a healthy answer measured at
// 0.5-2.3s leaves ample headroom for the slow tail.
const RENTCAST_TIMEOUT_MS = 6_000;

// What rentcastFetch hands back: the status classification its callers need,
// plus a body reader.
//
// The body reader is the whole point of this wrapper existing instead of a
// bare Response. fetch() resolves as soon as the HEADERS arrive; the body is
// streamed afterwards, and res.json() waits for all of it. The abort timer
// used to be cleared the moment the headers landed, so from that instant on
// nothing bounded the read at all: a RentCast response whose body stalled
// mid-stream left the caller awaiting res.json() forever, and with it the
// whole request - a homeowner's claim, or a job post's lazy ownership
// re-check - with no timeout anywhere above it. rentcastRequest below reads
// the body inside the same budget, so what reaches here is already settled.
type RentcastResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

// The typed miss every RentCast call degrades to (Landen addendum 4, F1).
// Three reasons, because the three want three different things done about
// them:
//   "not_found" - RentCast answered and holds no record. A settled answer,
//                 cached forever for a property record.
//   "quota"     - a 429, or a body that says the plan's ceiling was hit. The
//                 free tier is spent; stop asking for an hour.
//   "error"     - everything else: a 401 from a bad key, a 5xx, a timeout, a
//                 dropped socket, an unparseable body. Not evidence about the
//                 address, and also not worth hammering - cached for an hour
//                 so an outage costs one call, not one per page load.
// `status` rides along on an "error" that HAD an HTTP status, so the callers
// below can keep logging it.
export type RentcastMiss = {
  ok: false;
  reason: "quota" | "not_found" | "error";
  status?: number;
};

export type RentcastOutcome =
  | { ok: true; status: number; body: unknown }
  | RentcastMiss;

// Everything a call needs to be cached and counted: which endpoint it is,
// which address it is about, and who asked (for the usage counter; null is
// fine, and is what a cron or an unauthenticated path passes).
type RentcastCallContext = {
  kind: RentcastCacheKind;
  addressKey: string;
  userId: string | null;
};

// Does a non-2xx body say "you are out of calls" rather than "something
// broke"? RentCast signals an exhausted plan with 429, which is the primary
// test; this is the belt to that brace, for the case where the ceiling
// arrives dressed as a 403 or a 402 with an explanatory body. Deliberately
// narrow - a phrase match, not a status guess - so a generic 500 never gets
// filed as "quota" and frozen behind the wrong TTL.
function bodyLooksLikeQuota(text: string): boolean {
  return /quota|rate.?limit|too many requests|plan limit|exceeded your|usage limit/i.test(
    text
  );
}

// Every `x-ratelimit-*` / `ratelimit-*` header the response actually carries,
// lowercased, for the usage counter.
//
// READ, NOT GUESSED. RentCast's docs do not pin these names down and this code
// has never been run against a live 429, so nothing here assumes a particular
// header exists: whatever is on the response is what gets logged, and if
// RentCast exposes none, the event simply records none. `remaining` and
// `reset` are surfaced as their own fields when present because those are the
// two the monthly view is actually read for.
function rateLimitHeaders(headers: Headers | undefined): {
  all: Record<string, string>;
  remaining: string | null;
  reset: string | null;
} {
  const all: Record<string, string> = {};
  let remaining: string | null = null;
  let reset: string | null = null;
  try {
    headers?.forEach((value, name) => {
      const key = name.toLowerCase();
      if (!/^(x-)?ratelimit-/.test(key)) return;
      all[key] = value;
      if (/remaining$/.test(key)) remaining = value;
      if (/reset$/.test(key)) reset = value;
    });
  } catch {
    // A stubbed Response in a test may not carry a real Headers object. An
    // absent header set is not a reason to lose the call count.
  }
  return { all, remaining, reset };
}

// One RentCast call, cached and counted (Landen addendum 4, F1/F2/F4/F5).
//
// THE ONLY PLACE IN THE APP THAT CAN REACH RENTCAST. Everything above it -
// the property-record parser, the AVM parser, and through them onboarding,
// /value, the dashboard, /taxes, the appeal route and the digest cron - gets
// its answer from here, so the read-through below is the single gate the free
// tier is defended at and there is no second path around it.
//
// Order matters and is the whole design:
//   1. Cache read. A fresh row means NO fetch and NO usage event: it was not
//      a call. An "ok"/"not_found" property row is fresh forever, an AVM row
//      for 30 days, a "quota"/"error" row for an hour.
//   2. One fetch, 6s, no retry.
//   3. The usage event - recorded for a REAL outbound call only, so
//      rentcast_usage_monthly counts calls rather than lookups.
//   4. Classify, cache, return. Never throws.
//
// Exported for its tests only - nothing outside this module should call
// RentCast directly, and nothing does. The typed miss it returns IS the
// contract F1 describes, so it is worth asserting against directly rather than
// only through the two parsers that translate it.
export async function rentcastRequest(
  url: string,
  apiKey: string,
  label: string,
  ctx: RentcastCallContext
): Promise<RentcastOutcome> {
  const cached = await readRentcastCache(ctx.addressKey, ctx.kind);
  if (cached && isRentcastCacheFresh(ctx.kind, cached.status, cached.fetchedAt)) {
    if (cached.status === "ok") {
      return { ok: true, status: 200, body: cached.payload };
    }
    return { ok: false, reason: cached.status };
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      // ONE attempt, hard-bounded. AbortSignal.timeout covers the body stream
      // too, not just the header wait, so a response that stalls mid-body is
      // released rather than held open.
      signal: AbortSignal.timeout(RENTCAST_TIMEOUT_MS),
    });
  } catch (err) {
    // An abort (the 6s ceiling), a DNS/TLS/connect failure, a dropped socket.
    // It still counts as a call for the meter - it may well have been billed,
    // and a burst of them is precisely what the counter exists to show.
    console.error(`RentCast ${label} could not be reached:`, err);
    await recordRentcastCall(ctx, "network", undefined);
    await writeRentcastCache(ctx.addressKey, ctx.kind, "error", null);
    return { ok: false, reason: "error" };
  }

  await recordRentcastCall(ctx, res.status, res.headers);

  if (res.status === 404) {
    await writeRentcastCache(ctx.addressKey, ctx.kind, "not_found", null);
    return { ok: false, reason: "not_found" };
  }

  if (!res.ok) {
    const text = await readTextWithinBudget(res);
    const reason = res.status === 429 || bodyLooksLikeQuota(text) ? "quota" : "error";
    await writeRentcastCache(ctx.addressKey, ctx.kind, reason, null);
    return { ok: false, reason, status: res.status };
  }

  try {
    const body = await readJsonWithinBudget(res, label);
    await writeRentcastCache(ctx.addressKey, ctx.kind, "ok", body);
    return { ok: true, status: res.status, body };
  } catch (err) {
    // A 200 whose body never arrived or would not parse. Not an answer about
    // the address, and not worth retrying inside the hour.
    console.error(`RentCast ${label} body failed:`, err);
    await writeRentcastCache(ctx.addressKey, ctx.kind, "error", null);
    return { ok: false, reason: "error", status: res.status };
  }
}

// F4: one app_events row per REAL outbound call, never for a cache hit.
//
// trackServerEvent takes a null user id (src/lib/trackServer.ts) and already
// swallows a missing app_events table, so this needs no tolerance of its own -
// but it is still awaited inside a try, because a usage counter must never be
// the thing that breaks a homeowner's address lookup.
async function recordRentcastCall(
  ctx: RentcastCallContext,
  status: number | "network",
  headers: Headers | undefined
): Promise<void> {
  try {
    const limits = rateLimitHeaders(headers);
    await trackServerEvent(ctx.userId, "rentcast_call", {
      endpoint: ctx.kind === "property" ? "property" : "avm",
      status,
      ratelimit_remaining: limits.remaining,
      ratelimit_reset: limits.reset,
      // Whatever else RentCast exposed under a ratelimit-ish name. Omitted
      // entirely when there is nothing, so the props bag stays small.
      ...(Object.keys(limits.all).length > 0
        ? { ratelimit_headers: limits.all }
        : {}),
    });
  } catch (err) {
    console.error("rentcast_call event failed:", err);
  }
}

// res.json() raced against the same 6s budget the request was given. The
// AbortSignal.timeout above already releases the socket; this race is what
// turns a body that never settles into a rejection the caller can classify,
// rather than an await that hangs the page behind it.
async function readJsonWithinBudget(
  res: Response,
  label: string
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      res.json(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(`RentCast ${label} body did not arrive within the budget`)
          );
        }, RENTCAST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// The error body of a non-2xx, read only to tell "out of quota" from "broken".
// Failure to read it is not interesting: an unreadable error body just means
// the status is all we have to go on.
async function readTextWithinBudget(res: Response): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const text = await Promise.race([
      typeof res.text === "function" ? res.text() : Promise.resolve(""),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(""), RENTCAST_TIMEOUT_MS);
      }),
    ]);
    return typeof text === "string" ? text.slice(0, 2_000) : "";
  } catch {
    return "";
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// The RentcastResponse-shaped adapter the two parsers below still use, so the
// 404-before-not-ok classification each of them owns stays where it is and
// stays readable. A typed miss maps back onto the status the parsers already
// branch on; a "quota"/"error" WITHOUT a status (a timeout, a dead socket)
// stays null, which is what those parsers already read as "we could not ask".
async function rentcastFetch(
  url: string,
  apiKey: string,
  label: string,
  ctx: RentcastCallContext
): Promise<RentcastResponse | null> {
  const outcome = await rentcastRequest(url, apiKey, label, ctx);
  if (outcome.ok) {
    return {
      ok: true,
      status: outcome.status,
      json: async () => outcome.body,
    };
  }
  if (outcome.reason === "not_found") {
    return { ok: false, status: 404, json: async () => null };
  }
  const status = outcome.status ?? (outcome.reason === "quota" ? 429 : null);
  if (status == null) return null;
  return { ok: false, status, json: async () => null };
}

// Fetches property facts from RentCast's /v1/properties endpoint, which
// matches a single address against county assessor records. Three outcomes,
// and they are deliberately not the same thing:
//   - a ParcelFacts with source "rentcast": the record was found.
//   - null: RentCast answered and has no such address - an HTTP 404
//     ("resource/not-found"), an empty array, or a record shape with no
//     address echo. A TRUE miss, safe to cache and safe to refuse an
//     onboarding claim on.
//   - a ParcelFacts with source "unavailable": we never got an answer -
//     a non-ok HTTP status other than 404 (401 bad key, 429 quota, 5xx
//     outage), an abort/timeout, a network error, or an unparseable body. Not
//     evidence about the address.
async function fetchFromRentcast(
  street: string,
  zip: string,
  apiKey: string,
  userId: string | null
): Promise<ParcelFacts | null> {
  const address = `${street.trim()}, ${zip}`;
  const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`;
  // No unit in the property-record key: RentCast files this endpoint against
  // the street and hands back the same building record either way (see
  // parcelCacheKey above and rentcastAddressKey in src/lib/rentcastCache.ts).
  const res = await rentcastFetch(url, apiKey, "address lookup", {
    kind: "property",
    addressKey: rentcastAddressKey(street, zip),
    userId,
  });
  if (!res) return unavailableFacts(street, zip);

  // A 404 IS RentCast's answer, not a failure to get one. Their /v1/properties
  // returns 404 with {"error":"resource/not-found","message":"No data found
  // for address '...'"} for an address it holds no record for - it does NOT
  // return an empty 200 array, which is what this code assumed until
  // 2026-08-28. Every unknown address therefore came back "unavailable", which
  // is wrong three ways at once, and all three showed up in one persona run:
  //   1. The homeowner was told "we couldn't reach the county records right
  //      now" - a claim that we had an outage, when in fact we asked and were
  //      told no. Verified against the live API for four real Orange County
  //      addresses: all four are a 404, in every address format tried.
  //   2. "unavailable" is deliberately never cached (see lookupParcel), so
  //      every retype of the same unknown address re-billed a lookup out of a
  //      50-a-month quota. A 404 is an answer and now gets the 24h miss cache.
  //   3. The "the records source has to actually know this address" gate in
  //      src/app/onboarding/actions.ts refuses only on source "none", so
  //      routing every miss to "unavailable" left that gate unreachable for
  //      the live source: "123 Fake St" walked straight through it.
  // Checked BEFORE the !res.ok branch below, which is only for the statuses
  // that really are "we could not ask".
  if (res.status === 404) return null;

  if (!res.ok) {
    // 401 (bad/expired key), 429 (quota), 5xx (outage): we could not ask, so
    // the answer is "unavailable", never "no such address".
    console.error(`RentCast returned HTTP ${res.status} for address lookup`);
    return unavailableFacts(street, zip);
  }

  try {
    const body: unknown = await res.json();
    const record: RentcastRecord | undefined = Array.isArray(body)
      ? body[0]
      : undefined;
    // No record, or a record with no address echo: treat as a miss rather
    // than trusting a shape we don't recognize.
    if (!record || (!record.addressLine1 && !record.formattedAddress)) {
      return null;
    }
    const typed = blankFacts(street, zip);
    const purchase_date = toDateOnly(record.lastSaleDate);
    const purchase_price = derivePurchasePrice(record.history, record.lastSaleDate);
    const { assessed_value, assessed_year } = deriveAssessed(record.taxAssessments);
    const property_tax_history = derivePropertyTaxHistory(record.propertyTaxes);
    const system_facts = deriveSystemFacts(record.features);
    const home_features = deriveHomeFeatures(record.features);
    return {
      parcel_id: record.assessorID ?? record.id ?? null,
      // Prefer the canonical county-record address over the typed one, but
      // never lose what the homeowner typed if the record omits a part. No
      // unit is sent, so what comes back is the building's street line, which
      // is what address_line1 means here.
      address_line1: record.addressLine1?.trim() || typed.address_line1,
      city: record.city ?? typed.city,
      state: record.state ?? typed.state,
      zip: record.zipCode ?? typed.zip,
      year_built: record.yearBuilt ?? null,
      sqft: record.squareFootage ?? null,
      beds: record.bedrooms ?? null,
      baths: record.bathrooms ?? null,
      lot_size_sqft: record.lotSize ?? null,
      property_type: normalizePropertyType(record.propertyType),
      purchase_date,
      purchase_price,
      assessed_value,
      assessed_year,
      property_tax_history,
      latitude: record.latitude ?? null,
      longitude: record.longitude ?? null,
      hoa_fee: record.hoa?.fee ?? null,
      county: record.county ?? null,
      market_value: null,
      market_value_low: null,
      market_value_high: null,
      system_facts,
      home_features,
      owner_names:
        record.owner?.names && record.owner.names.length > 0
          ? record.owner.names
          : null,
      owner_type: normalizeOwnerType(record.owner?.type),
      owner_occupied:
        typeof record.ownerOccupied === "boolean" ? record.ownerOccupied : null,
      source: "rentcast",
    };
  } catch (err) {
    // A 200 whose body isn't JSON, or a shape that blew up on the way through:
    // degrade to manual entry, marked "unavailable" so onboarding lets the
    // homeowner through instead of telling them their house isn't real.
    // Reaching RentCast at all is rentcastFetch's problem, not this block's.
    console.error("RentCast address lookup could not complete:", err);
    return unavailableFacts(street, zip);
  }
}

// The AVM market-value lookup (/v1/avm/value) was removed from onboarding so
// it makes a single RentCast call for the property record only. market_value
// fields stay null there; the /value page fetches the AVM lazily instead (see
// lookupMarketValue below), only once per property and only for someone who
// actually opens the page, rather than billing every signup.

export interface MarketValueFacts {
  market_value: number | null;
  market_value_low: number | null;
  market_value_high: number | null;
  // Same three-state meaning as ParcelFacts.source above. "unavailable" (a
  // 401/429/5xx, a timeout, a network error, an unparseable body) is never
  // cached, so a bad key can't pin a null estimate in front of a home for 24
  // hours.
  source: "rentcast" | "none" | "unavailable";
}

const BLANK_MARKET_VALUE: MarketValueFacts = {
  market_value: null,
  market_value_low: null,
  market_value_high: null,
  source: "none",
};

const UNAVAILABLE_MARKET_VALUE: MarketValueFacts = {
  market_value: null,
  market_value_low: null,
  market_value_high: null,
  source: "unavailable",
};

// Lazy AVM (estimated market value) lookup for the /value page. Mirrors
// lookupParcel's read-through cache (same parcel_cache table, same 30-day
// freshness for a real hit / 1-day freshness for a miss) so opening /value
// repeatedly, or multiple household members on the same property, doesn't
// re-bill RentCast. The cache key is a JSON array tagged "avm" (see below), so
// it never collides with lookupParcel's property-record cache row for the same
// address - and, as of 2026-08-28, no street line can collide with another
// address's row either. That key change makes every row written under the old
// string key a natural miss: each address re-fetches its estimate once.
export async function lookupMarketValue(
  street: string,
  zip: string,
  // Condo/townhome unit (migration 0127). An AVM for "123 Main St" is the
  // building, not unit 4B, so the unit rides into the request the same way it
  // does for the property record above - and into the cache key, so two units
  // never share one estimate. Omitted = unchanged behaviour, same key as
  // before.
  unit?: string | null,
  // Usage-counter attribution only (F4); see lookupParcel above.
  userId?: string | null
): Promise<MarketValueFacts> {
  const u = (unit ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  // JSON, not concatenation with separators. The key used to be
  // `street + "/" + unit + "|" + zip + "|avm"`, and a street is free text a
  // homeowner types: "123 Main St/4b" with no unit built exactly the same key
  // as "123 Main St" with unit "4B", so one address could be served - and
  // could overwrite - another's estimate. JSON.stringify escapes the
  // separators into the values instead of letting them run together, so
  // distinct inputs always produce distinct keys. The leading "avm" is what
  // keeps this row separate from lookupParcel's property-record row for the
  // same address.
  const cacheKey = JSON.stringify([
    "avm",
    street.trim().replace(/\s+/g, " ").toLowerCase(),
    u || null,
    zip.trim().slice(0, 5),
  ]);
  const admin = createAdminClient();

  try {
    const { data: row } = await admin
      .from("parcel_cache")
      .select("facts, source, fetched_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (row) {
      const ageMs = Date.now() - new Date(row.fetched_at).getTime();
      const fresh =
        (row.source === "rentcast" && ageMs < 30 * 24 * 60 * 60 * 1000) ||
        (row.source === "none" && ageMs < 24 * 60 * 60 * 1000);
      // The row's own `source` column is authoritative: rows written before
      // MarketValueFacts gained a source field have none inside the jsonb.
      if (fresh) {
        const cached = row.facts as unknown as MarketValueFacts;
        return {
          market_value: cached?.market_value ?? null,
          market_value_low: cached?.market_value_low ?? null,
          market_value_high: cached?.market_value_high ?? null,
          source: row.source === "rentcast" ? "rentcast" : "none",
        };
      }
    }
  } catch (err) {
    console.error("Market value cache read failed:", err);
  }

  const facts = await fetchMarketValueFacts(street, zip, unit, userId ?? null);

  // Never cache "unavailable", same rule as lookupParcel: an outage or a bad
  // key is not an answer about this address, and freezing it would keep the
  // estimate blank long after the key was fixed. A real miss (source "none")
  // is still cached for a day so a reload doesn't re-bill.
  if (facts.source !== "unavailable") {
    try {
      await admin.from("parcel_cache").upsert(
        {
          cache_key: cacheKey,
          facts: facts as unknown as Json,
          source: facts.market_value != null ? "rentcast" : "none",
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "cache_key" }
      );
    } catch (err) {
      console.error("Market value cache write failed:", err);
    }
  }

  return facts;
}

// The actual RentCast AVM call. Never throws: no key, a non-ok response, a
// timeout, or an unrecognized response shape all degrade to all-null so the
// /value page just falls back to its existing purchase-price estimate.
async function fetchMarketValueFacts(
  street: string,
  zip: string,
  unit?: string | null,
  userId: string | null = null
): Promise<MarketValueFacts> {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) return BLANK_MARKET_VALUE;

  const address = `${lookupStreet(street, unit)}, ${zip}`;
  const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`;
  // The unit IS part of the AVM key: an estimate is a price for one dwelling,
  // so unit 4B must never be served unit 2A's number.
  const res = await rentcastFetch(url, key, "AVM lookup", {
    kind: "avm",
    addressKey: rentcastAddressKey(street, zip, unit),
    userId,
  });
  if (!res) return UNAVAILABLE_MARKET_VALUE;

  // Same 404 rule as the property record above, for the same reason: RentCast
  // answers 404 when it has no estimate for an address, and that IS an answer.
  // Treating it as "unavailable" made every unvalued address re-bill the AVM
  // endpoint on each visit to /value instead of being remembered for a day.
  if (res.status === 404) return BLANK_MARKET_VALUE;

  if (!res.ok) {
    console.error(`RentCast returned HTTP ${res.status} for AVM lookup`);
    return UNAVAILABLE_MARKET_VALUE;
  }

  try {
    const body: unknown = await res.json();
    // A 200 that isn't even an object is a shape we don't recognize, not an
    // answer about this address - same call the property-record path makes on
    // an unparseable body, and it must not be cached either.
    if (!body || typeof body !== "object") return UNAVAILABLE_MARKET_VALUE;
    const rec = body as {
      price?: number;
      priceRangeLow?: number;
      priceRangeHigh?: number;
    };
    // A well-formed object with no price IS an answer: RentCast has no
    // estimate for this address. That is a real miss, so it stays "none" and
    // is cached for a day like any other.
    if (typeof rec.price !== "number") return BLANK_MARKET_VALUE;
    return {
      market_value: rec.price,
      market_value_low:
        typeof rec.priceRangeLow === "number" ? rec.priceRangeLow : null,
      market_value_high:
        typeof rec.priceRangeHigh === "number" ? rec.priceRangeHigh : null,
      source: "rentcast",
    };
  } catch (err) {
    // An unparseable body: degrade to null, never throw - but marked
    // "unavailable" so it isn't cached as if RentCast had said "no estimate
    // for this address". Timeouts and network failures are rentcastFetch's.
    console.error("RentCast AVM lookup could not complete:", err);
    return UNAVAILABLE_MARKET_VALUE;
  }
}

// No real records source is configured (or the lookup failed): return only
// what the homeowner actually typed. Input is now structured (a separate
// street box and ZIP box), so there's no comma string left to parse - city
// and state simply aren't known yet and stay null until a records lookup or
// the confirm screen fills them in. Nothing here is a guess or a
// placeholder - it never gets shown as if it came from a records lookup.
function blankFacts(street: string, zip: string): ParcelFacts {
  return {
    parcel_id: null,
    address_line1: street.trim() || street,
    city: null,
    state: null,
    zip: zip.trim() || null,
    year_built: null,
    sqft: null,
    beds: null,
    baths: null,
    lot_size_sqft: null,
    property_type: null,
    purchase_date: null,
    purchase_price: null,
    assessed_value: null,
    assessed_year: null,
    property_tax_history: null,
    latitude: null,
    longitude: null,
    hoa_fee: null,
    county: null,
    market_value: null,
    market_value_low: null,
    market_value_high: null,
    system_facts: null,
    home_features: null,
    owner_names: null,
    owner_type: null,
    owner_occupied: null,
    source: "none",
  };
}

// blankFacts for callers OUTSIDE this module: the shape a lookup that was
// deliberately not made returns. Source "none" is the honest marking - no
// record is attached - and it is what makes onboarding show its manual-entry
// note rather than an error (src/app/onboarding/OnboardingForm.tsx).
export function manualEntryFacts(street: string, zip: string): ParcelFacts {
  return blankFacts(street, zip);
}

// Same blank shape as blankFacts, but marked "unavailable": we could not reach
// the records source, so nothing here is a statement about the address. Kept
// as a sibling of blankFacts rather than a flag on it so every call site has
// to pick one on purpose.
function unavailableFacts(street: string, zip: string): ParcelFacts {
  return { ...blankFacts(street, zip), source: "unavailable" };
}

// ===========================================================================
// F3: the two ways to answer a lookup with NO outbound call at all.
// ===========================================================================

// Someone in this database already claimed this exact address, so the county's
// answer for it is already on a row here. Reuse it instead of buying it again.
//
// WHAT IS COPIED AND WHAT IS NOT, and the line is privacy, not convenience.
// Copied: the building's public-record shape - year built, size, beds/baths,
// lot, property type, county, coordinates, the assessor's parcel number. Those
// are facts about the structure that RentCast would return to anyone who asked
// about the address, and the whole point of the free tier's ceiling is not to
// ask twice.
// NOT copied: purchase price, purchase date, assessed value and year, HOA fee,
// tax history. Those describe a TRANSACTION and a household, not a building,
// and lifting them from a stranger's row onto a new draft would be handing one
// homeowner another's numbers. They stay null and get re-derived (or left
// blank) the normal way.
// Also NOT copied: owner_names / owner_type / owner_occupied. The ownership
// check must never pass on a record we did not just fetch - an unverified
// claim is the correct, safe outcome here.
//
// Missing-schema tolerant and never throws: on any trouble this returns null
// and the caller calls RentCast exactly as before.
export async function parcelFactsFromExistingProperty(
  street: string,
  zip: string
): Promise<ParcelFacts | null> {
  try {
    const admin = createAdminClient();
    const z = zip.trim().slice(0, 5);
    // Matched on the NORMALIZED line, not on raw equality: the stored row may
    // hold the county's canonical spelling ("1770 S Harbor Blvd") while the
    // new draft holds what this homeowner typed ("1770 South Harbor
    // Boulevard"). rentcastAddressKey is the same normalizer the call cache
    // keys on, so "already cached" and "already claimed" agree on what one
    // address is. Narrowed by ZIP in the query so this reads a handful of
    // rows, not the table.
    const { data, error } = await (admin as any)
      .from("properties")
      .select(
        "address_line1, city, state, zip, county, year_built, sqft, beds, baths, lot_size_sqft, property_type, latitude, longitude, parcel_id"
      )
      .eq("zip", z)
      .limit(200);
    if (error) {
      if (!isMissingSchemaError(error)) {
        console.error("Existing-property reuse read failed:", error.message);
      }
      return null;
    }
    const wanted = rentcastAddressKey(street, z);
    const row = (data ?? []).find(
      (r: { address_line1?: string | null }) =>
        rentcastAddressKey(String(r.address_line1 ?? ""), z) === wanted
    );
    if (!row) return null;
    // Nothing worth reusing: a row with no facts on it saves no call, and
    // returning it would suppress the lookup that could still fill them in.
    if (
      row.year_built == null &&
      row.sqft == null &&
      row.beds == null &&
      row.lot_size_sqft == null
    ) {
      return null;
    }
    const typed = blankFacts(street, z);
    return {
      ...typed,
      parcel_id: row.parcel_id ?? null,
      // The homeowner's own street line stays the one on screen; the stored
      // row supplies only the facts. Swapping in another row's line here
      // would re-introduce the silent address-rewrite the confirm step was
      // built to stop (src/lib/addressMatch.ts).
      city: row.city ?? null,
      state: row.state ?? null,
      zip: row.zip ?? typed.zip,
      county: row.county ?? null,
      year_built: numOrNull(row.year_built),
      sqft: numOrNull(row.sqft),
      beds: numOrNull(row.beds),
      baths: numOrNull(row.baths),
      lot_size_sqft: numOrNull(row.lot_size_sqft),
      property_type: typeof row.property_type === "string" ? row.property_type : null,
      latitude: numOrNull(row.latitude),
      longitude: numOrNull(row.longitude),
      // A home already in this database is a real address - someone claimed
      // it and the B8 address lock let them - so this counts as a records
      // answer and the geocoder fallback has nothing left to check. The money
      // and owner fields above stay null regardless.
      source: "rentcast",
    };
  } catch (err) {
    console.error("Existing-property reuse read failed:", err);
    return null;
  }
}

function numOrNull(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// WHO CHECKS THE INTERNAL FLAG. Not this file: src/lib/internalAccounts.ts
// owns the read of users.is_internal (migration 0165) and onboarding calls
// isInternalUser() from there directly. This note is here because "skip the
// lookup for internal accounts" is a RentCast quota rule and this is where
// someone will come looking for it - see lookupParcelAction in
// src/app/onboarding/actions.ts for the rule itself. A second reader of the
// same column would only be a way for the two to drift apart.

// How old the cached AVM call for this address is, in milliseconds, or null if
// there is no settled ("ok") row for it. Used by the manual "Refresh estimate"
// button, which is the one control a homeowner can press repeatedly and the
// only path that can bill a SECOND call for one home: under 24 hours it shows
// the number already on file instead of spending anything (F2).
export async function cachedMarketValueAgeMs(
  street: string,
  zip: string,
  unit?: string | null
): Promise<number | null> {
  const row = await readRentcastCache(
    rentcastAddressKey(street, zip, unit),
    "avm"
  );
  if (!row || row.status !== "ok") return null;
  return Math.max(0, Date.now() - row.fetchedAt);
}
