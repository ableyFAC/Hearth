// The cities Hearth serves at launch, and the pure mapping from the two
// checkboxes to what a contractors row actually stores.
//
// Neither pro signup nor the profile editor asks for a free-text service area
// any more. A pro checks Huntington Beach, Fountain Valley, or both, and that
// single answer feeds three columns:
//
//   service_area          the same comma-separated free text the rest of the
//                         app already renders (browse pros, applicant cards,
//                         the AI prompt builders): "Huntington Beach,
//                         Fountain Valley".
//   serves_orange_county  0074's launch attestation, which the job board
//                         (open_jobs_for_me) and apply_to_lead both gate on.
//                         Both launch cities ARE in Orange County, so checking
//                         either one is a truthful yes.
//   launch_cities         0124's per-city pick, the narrower gate both of
//                         those functions ALSO apply: a job whose property ZIP
//                         maps to a city not in this array is hidden from the
//                         board and refused at apply time. This is why the
//                         answer can no longer be collapsed into the boolean.
//
// Both forms post the same field names (`service_cities` plus the hidden
// `service_cities_present` marker) to the same saveCompanyAction, so this is
// the single place the answer is interpreted.
//
// Order is canonical (the LAUNCH_CITIES order), never the order the pro
// happened to click, so the stored string is stable and comparable.

export const LAUNCH_CITIES = ["Huntington Beach", "Fountain Valley"] as const;

export type LaunchCity = (typeof LAUNCH_CITIES)[number];

export type LaunchCitySelection = {
  /** The checked cities, in canonical order. */
  cities: LaunchCity[];
  /** What to write to contractors.service_area, or null when nothing is checked. */
  serviceArea: string | null;
  /** What to write to contractors.serves_orange_county. */
  servesOrangeCounty: boolean;
};

// Maps raw posted checkbox values to the stored fields. Anything that isn't a
// launch city is dropped: the form only offers these two, so any other value
// is a crafted post rather than a pro's answer. Trimmed and case-insensitive
// because the values ride through a form post, and de-duplicated because the
// output is built from LAUNCH_CITIES rather than from the input.
export function selectLaunchCities(
  raw: readonly string[]
): LaunchCitySelection {
  const posted = new Set(raw.map((value) => String(value).trim().toLowerCase()));
  const cities = LAUNCH_CITIES.filter((city) =>
    posted.has(city.toLowerCase())
  );
  return {
    cities: [...cities],
    serviceArea: cities.length > 0 ? cities.join(", ") : null,
    servesOrangeCounty: cities.length > 0,
  };
}
