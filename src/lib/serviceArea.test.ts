import { describe, expect, it } from "vitest";
import {
  isLaunchZip,
  isOrangeCountyZip,
  launchCityForZip,
  LAUNCH_CITY_BY_ZIP,
  LAUNCH_CITY_NAMES,
} from "./serviceArea";

// The homeowner-side launch gate. This is the narrower twin of
// isOrangeCountyZip: everything here must ALSO be an Orange County ZIP, but
// plenty of Orange County ZIPs must NOT pass, because Hearth has no pros
// outside the launch cities. The same mapping lives in SQL as
// public.launch_city_for_zip() (migration 0126, which widened 0124's two-city
// map to nine) and the two are kept in sync by hand, so the ZIP list itself is
// asserted, not just the behavior.
describe("launchCityForZip", () => {
  it("maps every Huntington Beach ZIP, Sunset Beach included", () => {
    // 90742 (Sunset Beach) is an annexed part of HB that routes through a
    // 90xxx ZIP - the OC/LA border overlap, not a typo.
    for (const zip of ["92646", "92647", "92648", "92649", "90742"]) {
      expect(launchCityForZip(zip)).toBe("Huntington Beach");
    }
  });

  it("maps the Fountain Valley ZIP", () => {
    expect(launchCityForZip("92708")).toBe("Fountain Valley");
  });

  it("maps Seal Beach, Surfside included", () => {
    // 0124 mapped 90743 (Surfside) to Huntington Beach. Surfside is a Seal
    // Beach colony, so 0126 corrects it here and in launch_city_for_zip().
    expect(launchCityForZip("90740")).toBe("Seal Beach");
    expect(launchCityForZip("90743")).toBe("Seal Beach");
  });

  it("maps one representative ZIP for each of the other launch cities", () => {
    expect(launchCityForZip("92683")).toBe("Westminster");
    expect(launchCityForZip("92655")).toBe("Midway City");
    expect(launchCityForZip("92843")).toBe("Garden Grove");
    expect(launchCityForZip("92704")).toBe("Santa Ana");
    expect(launchCityForZip("92627")).toBe("Costa Mesa");
    expect(launchCityForZip("92660")).toBe("Newport Beach");
  });

  it("covers exactly the launch ZIPs and nothing else", () => {
    expect(Object.keys(LAUNCH_CITY_BY_ZIP).sort()).toEqual([
      "90740",
      "90742",
      "90743",
      "92625",
      "92626",
      "92627",
      "92646",
      "92647",
      "92648",
      "92649",
      "92655",
      "92657",
      "92660",
      "92661",
      "92662",
      "92663",
      "92683",
      "92701",
      "92703",
      "92704",
      "92705",
      "92706",
      "92707",
      "92708",
      "92840",
      "92841",
      "92843",
      "92844",
      "92845",
    ]);
  });

  it("maps every ZIP to a name on the canonical city list, and uses all nine", () => {
    const mapped = new Set(Object.values(LAUNCH_CITY_BY_ZIP));
    for (const city of mapped) {
      expect(LAUNCH_CITY_NAMES).toContain(city);
    }
    // Every launch city has at least one ZIP: a city on the checkbox list with
    // no ZIP behind it would let a pro claim a city no job can ever match.
    expect([...mapped].sort()).toEqual([...LAUNCH_CITY_NAMES].sort());
  });

  it("only maps ZIPs that are Orange County ZIPs", () => {
    for (const zip of Object.keys(LAUNCH_CITY_BY_ZIP)) {
      expect(isOrangeCountyZip(zip)).toBe(true);
    }
  });

  it("normalizes a ZIP+4 down to its first five digits", () => {
    expect(launchCityForZip("92646-1234")).toBe("Huntington Beach");
    expect(launchCityForZip("92708-0001")).toBe("Fountain Valley");
  });

  it("tolerates surrounding whitespace", () => {
    expect(launchCityForZip("  92647 ")).toBe("Huntington Beach");
    expect(launchCityForZip("\t92708\n")).toBe("Fountain Valley");
  });

  it("returns null for an Orange County ZIP outside the launch cities", () => {
    // Irvine: squarely in Orange County, so isOrangeCountyZip still says yes.
    // That is the whole point of the narrower gate.
    expect(isOrangeCountyZip("92620")).toBe(true);
    expect(launchCityForZip("92620")).toBeNull();
    expect(isOrangeCountyZip("92618")).toBe(true);
    expect(launchCityForZip("92618")).toBeNull();
    // Anaheim and Tustin border the launch area and still don't count.
    expect(launchCityForZip("92805")).toBeNull();
    expect(launchCityForZip("92780")).toBeNull();
  });

  it("returns null for garbage and for empty input", () => {
    for (const junk of ["", "   ", "abcde", "9264", "0", "not a zip"]) {
      expect(launchCityForZip(junk)).toBeNull();
    }
  });

  it("does not let a prototype key masquerade as a launch city", () => {
    // The lookup is a plain object, so a crafted "ZIP" must not resolve to an
    // inherited property.
    expect(launchCityForZip("constructor")).toBeNull();
    expect(launchCityForZip("__proto__")).toBeNull();
  });
});

describe("isLaunchZip", () => {
  it("is true for every launch ZIP", () => {
    for (const zip of Object.keys(LAUNCH_CITY_BY_ZIP)) {
      expect(isLaunchZip(zip)).toBe(true);
    }
  });

  it("normalizes the same way launchCityForZip does", () => {
    expect(isLaunchZip("92646-1234")).toBe(true);
    expect(isLaunchZip("  92708  ")).toBe(true);
  });

  it("is false for a non-launch Orange County ZIP", () => {
    expect(isLaunchZip("92620")).toBe(false);
  });

  it("is false for garbage and for empty input", () => {
    for (const junk of ["", "   ", "abcde", "90210", "12345"]) {
      expect(isLaunchZip(junk)).toBe(false);
    }
  });
});
