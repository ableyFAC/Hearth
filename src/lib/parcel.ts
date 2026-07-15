// Parcel pre-fill (Screen 1). Looks up baseline property facts from a real
// records source so onboarding can skip re-typing what public records already
// know. The wired source is RentCast (https://www.rentcast.io/api): public
// tax-assessor and county-record data behind a simple JSON API with a free
// tier (50 lookups/month), which fits launch scale - each lookup now makes up
// to 2 calls (the property record and the AVM market value), so budget
// accordingly. Enable it by setting RENTCAST_API_KEY in the environment;
// without a key, lookupParcel() never invents facts: it only echoes back the
// street and ZIP the homeowner typed and leaves everything it doesn't
// actually know (city, state, year built, sqft, beds/baths, lot size,
// property type, and everything else below) null for them to fill in or
// skip.

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
  source: "rentcast" | "none";
}

export async function lookupParcel(
  street: string,
  zip: string
): Promise<ParcelFacts> {
  const key = process.env.RENTCAST_API_KEY;
  if (key) {
    try {
      const [record, avm] = await Promise.all([
        fetchFromRentcast(street.trim(), zip.trim(), key),
        fetchAvmValue(`${street.trim()}, ${zip.trim()}`, key),
      ]);
      if (record) {
        return {
          ...record,
          market_value: avm.market_value,
          market_value_low: avm.market_value_low,
          market_value_high: avm.market_value_high,
        };
      }
      // No property record, but the AVM call may still have succeeded:
      // degrade gracefully by folding whatever it found into the blank
      // facts rather than throwing the whole lookup away.
      if (avm.market_value !== null) {
        return {
          ...blankFacts(street, zip),
          market_value: avm.market_value,
          market_value_low: avm.market_value_low,
          market_value_high: avm.market_value_high,
        };
      }
    } catch (err) {
      console.error("RentCast lookup failed:", err);
    }
  }
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
};

type RentcastTaxAssessment = { year?: number; value?: number; land?: number; improvements?: number };
type RentcastPropertyTax = { year?: number; total?: number };
type RentcastHistoryEntry = { event?: string; date?: string; price?: number };

type RentcastRecord = {
  id?: string;
  formattedAddress?: string;
  addressLine1?: string;
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
};

// RentCast returns human-readable property types ("Single Family", "Condo",
// "Townhouse", "Multi-Family", "Apartment", "Manufactured", "Land"), but the
// onboarding confirm screen's <select> only knows Hearth's snake_case enum
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

// Fetches property facts from RentCast's /v1/properties endpoint, which
// matches a single address against county assessor records. Returns null on
// any miss or failure so the caller falls back to blankFacts(): a lookup
// hiccup must degrade to "type it yourself", never block onboarding.
async function fetchFromRentcast(
  street: string,
  zip: string,
  apiKey: string
): Promise<ParcelFacts | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const address = `${street}, ${zip}`;
    const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`RentCast returned HTTP ${res.status} for address lookup`);
      return null;
    }
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
    return {
      parcel_id: record.assessorID ?? record.id ?? null,
      // Prefer the canonical county-record address over the typed one, but
      // never lose what the homeowner typed if the record omits a part.
      address_line1: record.addressLine1 ?? typed.address_line1,
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
      source: "rentcast",
    };
  } catch {
    // AbortError (timeout), DNS/network failure: degrade to manual entry.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Fetches RentCast's automated market valuation from /v1/avm/value. Same
// timeout/error-handling shape as fetchFromRentcast, but this one must NEVER
// throw or return null - a miss just means all-null fields, since the caller
// always folds this result into a ParcelFacts (either the record's or
// blankFacts's) rather than branching on failure.
async function fetchAvmValue(
  address: string,
  apiKey: string
): Promise<{
  market_value: number | null;
  market_value_low: number | null;
  market_value_high: number | null;
}> {
  const blank = { market_value: null, market_value_low: null, market_value_high: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`;
    const res = await fetch(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`RentCast returned HTTP ${res.status} for AVM value lookup`);
      return blank;
    }
    const body: unknown = await res.json();
    if (!body || typeof body !== "object") return blank;
    const avm = body as {
      price?: number;
      priceRangeLow?: number;
      priceRangeHigh?: number;
    };
    return {
      market_value: typeof avm.price === "number" ? avm.price : null,
      market_value_low: typeof avm.priceRangeLow === "number" ? avm.priceRangeLow : null,
      market_value_high: typeof avm.priceRangeHigh === "number" ? avm.priceRangeHigh : null,
    };
  } catch {
    // AbortError (timeout), DNS/network failure: never block onboarding.
    return blank;
  } finally {
    clearTimeout(timeout);
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
    source: "none",
  };
}
