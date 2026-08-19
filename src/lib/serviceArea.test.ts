import { describe, expect, it } from "vitest";
import {
  isLaunchZip,
  isOrangeCountyZip,
  launchCityForZip,
  LAUNCH_CITY_BY_ZIP,
} from "./serviceArea";

// The homeowner-side launch gate. This is the narrower twin of
// isOrangeCountyZip: everything here must ALSO be an Orange County ZIP, but
// most Orange County ZIPs must NOT pass, because Hearth has no pros outside
// the two launch cities. The same mapping lives in SQL as
// public.launch_city_for_zip() (migration 0124) and the two are kept in sync
// by hand, so the ZIP list itself is asserted, not just the behavior.
describe("launchCityForZip", () => {
  it("maps every Huntington Beach ZIP", () => {
    for (const zip of ["92646", "92647", "92648", "92649"]) {
      expect(launchCityForZip(zip)).toBe("Huntington Beach");
    }
  });

  it("maps Sunset Beach and Surfside to Huntington Beach", () => {
    // Annexed parts of HB that route through 90xxx ZIPs - the OC/LA border
    // overlap, not a typo.
    expect(launchCityForZip("90742")).toBe("Huntington Beach");
    expect(launchCityForZip("90743")).toBe("Huntington Beach");
  });

  it("maps the Fountain Valley ZIP", () => {
    expect(launchCityForZip("92708")).toBe("Fountain Valley");
  });

  it("covers exactly the seven launch ZIPs and nothing else", () => {
    expect(Object.keys(LAUNCH_CITY_BY_ZIP).sort()).toEqual([
      "90742",
      "90743",
      "92646",
      "92647",
      "92648",
      "92649",
      "92708",
    ]);
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
    expect(isOrangeCountyZip("92618")).toBe(true);
    expect(launchCityForZip("92618")).toBeNull();
    // Westminster and Costa Mesa border the launch cities and still don't count.
    expect(launchCityForZip("92683")).toBeNull();
    expect(launchCityForZip("92627")).toBeNull();
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
    expect(isLaunchZip("92618")).toBe(false);
  });

  it("is false for garbage and for empty input", () => {
    for (const junk of ["", "   ", "abcde", "90210", "12345"]) {
      expect(isLaunchZip(junk)).toBe(false);
    }
  });
});
