// TODO(verify): generated from general OC ZIP knowledge; verify against the
// HUD-USPS ZIP crosswalk (huduser.gov) before launch. Border ZIPs shared with
// LA County are a known imperfect edge.
//
// Standard (residential-delivery) 5-digit ZIP codes for Orange County,
// California, across its cities: Aliso Viejo, Anaheim, Brea, Buena Park,
// Costa Mesa, Cypress, Dana Point, Fountain Valley, Fullerton, Garden Grove,
// Huntington Beach, Irvine, La Habra, La Palma, Laguna Beach, Laguna Hills,
// Laguna Niguel, Laguna Woods, Lake Forest, Los Alamitos, Mission Viejo,
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
  // Laguna Beach, Laguna Hills, Aliso Viejo, Newport Beach, San Clemente,
  // San Juan Capistrano
  "92651", "92653", "92656", "92657", "92660", "92661", "92662", "92663",
  "92672", "92673", "92675",
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
