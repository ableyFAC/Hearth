// TODO(verify): generated from general OC ZIP knowledge; verify against the
// HUD-USPS ZIP crosswalk (huduser.gov) before launch. Border ZIPs shared with
// LA County are a known imperfect edge.
//
// Standard (residential-delivery) 5-digit ZIP codes for Orange County,
// California, across its cities: Aliso Viejo, Anaheim, Brea, Buena Park,
// Costa Mesa, Cypress, Dana Point, Fountain Valley, Fullerton, Garden Grove,
// Huntington Beach, Irvine, La Habra, La Palma, Laguna Beach, Laguna Hills,
// Laguna Niguel, Laguna Woods, Lake Forest, Los Alamitos, Midway City,
// Mission Viejo,
// Newport Beach, Orange, Placentia, Rancho Santa Margarita, San Clemente,
// San Juan Capistrano, Santa Ana, Seal Beach, Stanton, Trabuco Canyon,
// Tustin, Villa Park, Westminster, Yorba Linda, and unincorporated areas
// (Silverado/Modjeska, Sunset Beach, Surfside). Excludes unique/PO-box-only
// ZIPs that have no residential delivery.
export const ORANGE_COUNTY_ZIPS: Set<string> = new Set([
  // Buena Park, Cypress, La Habra, Stanton, Los Alamitos, Seal Beach,
  // Sunset Beach, Surfside, La Palma - OC cities routed through 90xxx ZIPs,
  // the classic OC/LA County border overlap.
  "90620", "90621", "90623", "90630", "90631", "90680", "90720", "90740",
  "90742", "90743",
  // Irvine
  "92602", "92603", "92604", "92606", "92610", "92612", "92614", "92617",
  "92618", "92620",
  // Dana Point, Costa Mesa, San Juan Capistrano, Lake Forest, Laguna Woods,
  // Huntington Beach
  "92624", "92625", "92626", "92627", "92629", "92630", "92637", "92646",
  "92647", "92648", "92649",
  // Laguna Beach, Laguna Hills, Midway City, Aliso Viejo, Newport Beach,
  // San Clemente, San Juan Capistrano
  "92651", "92653", "92655", "92656", "92657", "92660", "92661", "92662",
  "92663", "92672", "92673", "92675",
  // Silverado/Modjeska, Laguna Niguel, Trabuco Canyon, Westminster, Rancho
  // Santa Margarita, Mission Viejo, Santa Ana
  "92676", "92677", "92678", "92679", "92683", "92688", "92691", "92692",
  "92701", "92703", "92704",
  // Santa Ana, Fountain Valley, Tustin, Anaheim
  "92705", "92706", "92707", "92708", "92780", "92782", "92801", "92802",
  "92804", "92805", "92806",
  // Anaheim, Brea, Fullerton
  "92807", "92808", "92821", "92823", "92831", "92833", "92835",
  // Garden Grove
  "92840", "92841", "92843", "92844", "92845",
  // Orange, Villa Park
  "92856", "92861", "92864", "92865", "92866", "92867", "92868", "92869",
  // Placentia, Yorba Linda
  "92870", "92885", "92886", "92887",
]);

// Normalizes to the first 5 digits (handles ZIP+4 and stray whitespace) and
// checks membership in ORANGE_COUNTY_ZIPS.
export function isOrangeCountyZip(zip: string): boolean {
  const normalized = (zip ?? "").trim().slice(0, 5);
  return ORANGE_COUNTY_ZIPS.has(normalized);
}

// The nine cities Hearth actually launches in, in canonical order. Everything
// city-shaped reads this list: the signup/profile checkboxes
// (src/app/pro/onboarding/launchCities.ts re-exports it as LAUNCH_CITIES), the
// LaunchCityName type below, and the CHECK constraint on
// contractors.launch_cities in migration 0126, which must list the same nine
// names.
//
// Order is the launch order, not alphabetical: the two original cities first,
// then the seven bordering cities added in 0126.
export const LAUNCH_CITY_NAMES = [
  "Huntington Beach",
  "Fountain Valley",
  "Seal Beach",
  "Westminster",
  "Midway City",
  "Garden Grove",
  "Santa Ana",
  "Costa Mesa",
  "Newport Beach",
] as const;

export type LaunchCityName = (typeof LAUNCH_CITY_NAMES)[number];

// How the launch area is described to a person. One string, because the same
// claim appears on the landing page, /pros, both onboarding flows, the profile
// editor, and the pro AI prompt, and nine city names read as a wall of text in
// running copy. Naming the two anchor cities keeps the claim concrete without
// promising a city Hearth has no pros in - the exact list is what the ZIP gates
// below enforce, and what the checkboxes show a pro.
export const LAUNCH_AREA_LABEL =
  "Huntington Beach, Fountain Valley, and nearby Orange County cities";

// The one message every homeowner-side onboarding gate shows: the two ZIP
// checks in src/app/onboarding/actions.ts and the fast client-side copy in
// OnboardingForm.tsx. Lives here rather than in a "use server" file because
// such a file can only export async functions, which is why the client copy
// used to be duplicated by hand.
export const LAUNCH_ONLY_MESSAGE =
  `Hearth serves ${LAUNCH_AREA_LABEL} right now. We added you to the ` +
  "waitlist and will email you the moment we expand to your area.";

// The post-time twin of the message above, for a home that was claimed before
// the launch gate existed and sits outside the launch area. Read by all three
// gates in src/app/(app)/contractors/actions.ts (postJobAction,
// requestProAction, postDirectPubliclyAction). Different wording from
// LAUNCH_ONLY_MESSAGE on purpose: nothing is being added to a waitlist here,
// and the home is already claimed.
export const OUT_OF_AREA_POST_MESSAGE =
  `Hearth pros serve ${LAUNCH_AREA_LABEL} right now, and this home is ` +
  "outside that area. We'll email you the moment we expand.";

// The cities Hearth actually launches in, keyed by ZIP. Narrower than
// ORANGE_COUNTY_ZIPS above on purpose: Orange County is where the launch
// cities sit, not where Hearth has pros. The homeowner onboarding gate and
// the pro-side alert filter both read this; the DB gates read the identical
// mapping in public.launch_city_for_zip() (migration 0126, which replaced
// 0124's two-city map), and the two are kept in sync by hand.
//
// 90742 (Sunset Beach), 90740 and 90743 (Surfside) route through 90xxx ZIPs -
// the same OC/LA border overlap ORANGE_COUNTY_ZIPS documents, not a mistake.
// Sunset Beach was annexed by Huntington Beach; Surfside is a Seal Beach
// colony, which 0124 had wrong (it mapped 90743 to Huntington Beach) and 0126
// corrects on both sides.
export const LAUNCH_CITY_BY_ZIP: Record<string, LaunchCityName> = {
  // Huntington Beach, including Sunset Beach (90742)
  "92646": "Huntington Beach",
  "92647": "Huntington Beach",
  "92648": "Huntington Beach",
  "92649": "Huntington Beach",
  "90742": "Huntington Beach",
  // Fountain Valley
  "92708": "Fountain Valley",
  // Seal Beach, including Surfside (90743)
  "90740": "Seal Beach",
  "90743": "Seal Beach",
  // Westminster
  "92683": "Westminster",
  // Midway City (unincorporated, its own single ZIP)
  "92655": "Midway City",
  // Garden Grove
  "92840": "Garden Grove",
  "92841": "Garden Grove",
  "92843": "Garden Grove",
  "92844": "Garden Grove",
  "92845": "Garden Grove",
  // Santa Ana
  "92701": "Santa Ana",
  "92703": "Santa Ana",
  "92704": "Santa Ana",
  "92705": "Santa Ana",
  "92706": "Santa Ana",
  "92707": "Santa Ana",
  // Costa Mesa
  "92626": "Costa Mesa",
  "92627": "Costa Mesa",
  // Newport Beach, including Balboa Island (92662) and Corona del Mar (92625)
  "92625": "Newport Beach",
  "92657": "Newport Beach",
  "92660": "Newport Beach",
  "92661": "Newport Beach",
  "92662": "Newport Beach",
  "92663": "Newport Beach",
};

// Which launch city a ZIP belongs to, or null when it is neither. Same
// normalization as isOrangeCountyZip (trim, first 5 characters) so a ZIP+4 or
// a padded value resolves the same way it does everywhere else.
export function launchCityForZip(zip: string): LaunchCityName | null {
  const normalized = (zip ?? "").trim().slice(0, 5);
  // hasOwnProperty, not a bare index: this reads a plain object with untrusted
  // input, and a bare lookup would happily return Object.prototype's members
  // for a crafted key. The 5-character slice happens to make that unreachable
  // today, which is exactly the kind of accident a future edit removes.
  return Object.prototype.hasOwnProperty.call(LAUNCH_CITY_BY_ZIP, normalized)
    ? LAUNCH_CITY_BY_ZIP[normalized]
    : null;
}

// True only for a ZIP inside one of the launch cities. This is the gate
// homeowner onboarding uses; isOrangeCountyZip stays exported for anything
// that still needs the wider county question.
export function isLaunchZip(zip: string): boolean {
  return launchCityForZip(zip) !== null;
}
