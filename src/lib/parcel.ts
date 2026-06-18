// Parcel pre-fill (Screen 1). Looks up baseline property facts from a parcel
// layer so onboarding feels magic. In Phase 1 this returns mock data unless a
// REGRID_API_TOKEN is configured — wire the real lookup in fetchFromRegrid().

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
  source: "regrid" | "mock";
}

export async function lookupParcel(rawAddress: string): Promise<ParcelFacts> {
  const token = process.env.REGRID_API_TOKEN;
  if (token) {
    try {
      const real = await fetchFromRegrid(rawAddress, token);
      if (real) return real;
    } catch (err) {
      console.error("Regrid lookup failed, falling back to mock:", err);
    }
  }
  return mockParcel(rawAddress);
}

// TODO (needs API key): autofill ALL property facts from a real source —
// Zillow / Regrid / county records — keyed off the entered address:
//   - year built, sqft, beds/baths, lot size, property type
//   - city -> ZIP (geocode) so ZIP autofills when the city is entered
//   - permit history -> last install / repair / remodel dates per system
//     (feed these into the auto-built starter inventory in onboarding/actions.ts)
// Until a token is set, lookupParcel() returns mockParcel() below.
async function fetchFromRegrid(
  _address: string,
  _token: string
): Promise<ParcelFacts | null> {
  return null;
}

// Deterministic placeholder so onboarding has something to confirm in dev.
function mockParcel(rawAddress: string): ParcelFacts {
  const parts = rawAddress.split(",").map((s) => s.trim());
  return {
    parcel_id: null,
    address_line1: parts[0] || rawAddress,
    city: parts[1] || "San Francisco",
    state: parts[2]?.split(" ")[0] || "CA",
    zip: parts[2]?.split(" ")[1] || "94110",
    year_built: 1978,
    sqft: 1640,
    beds: 3,
    baths: 2,
    lot_size_sqft: 3200,
    property_type: "single_family",
    source: "mock",
  };
}
