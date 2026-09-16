import { describe, expect, it } from "vitest";
import {
  buildClickProps,
  buildPageTimeProps,
  buildPageViewProps,
  clickIdFrom,
  MAX_PAGE_TIME_MS,
  PAGE_TIME_EVENT,
  PAGE_VIEW_EVENT,
  routePattern,
  sideForPath,
  UI_CLICK_EVENT,
} from "./usageTracking";
import { MAX_STRING, sanitizeTrackProps } from "./trackProps";

// The alphabet src/lib/trackProps.ts will actually store. Re-declared here
// rather than exported from there: these tests exist to prove this module
// never emits a value the sanitizer would drop, and a shared constant would
// let both sides drift together without a failure.
const VALUE_RE = /^[A-Za-z0-9_\-:./]*$/;

describe("routePattern", () => {
  it("collapses a uuid segment", () => {
    expect(
      routePattern("/pro/leads/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d")
    ).toBe("/pro/leads/:id");
  });

  it("collapses a numeric id", () => {
    expect(routePattern("/issues/482")).toBe("/issues/:id");
  });

  it("collapses an over-long token segment", () => {
    // A join/invite token: lowercase and inside the alphabet, so only the
    // length rule catches it.
    expect(routePattern("/join/household/abcdefghijklmnopqrstuvwxyz")).toBe(
      "/join/household/:id"
    );
  });

  it("keeps a short slug, which behaves like an enum", () => {
    expect(routePattern("/p/some-slug-name")).toBe("/p/some-slug-name");
  });

  it("keeps a static segment that happens to contain digits", () => {
    // The webVitals normalizer would call this ":id"; here it is a real page
    // worth counting by name.
    expect(routePattern("/guides/roof-repair-2026")).toBe(
      "/guides/roof-repair-2026"
    );
  });

  it("strips a query string and a hash", () => {
    expect(routePattern("/search?q=roof")).toBe("/search");
    expect(routePattern("/terms#section-9")).toBe("/terms");
    expect(routePattern("/search?q=a#b")).toBe("/search");
  });

  it("returns / for the root and for an empty pathname", () => {
    expect(routePattern("/")).toBe("/");
    expect(routePattern("")).toBe("/");
  });

  it("lowercases", () => {
    expect(routePattern("/Pricing")).toBe("/pricing");
  });

  it("collapses a segment carrying characters the sanitizer forbids", () => {
    // A percent escape, a space, or an "@" means something typed reached the
    // URL. None of these may ever be stored, so the whole segment goes.
    expect(routePattern("/search/roof%20repair")).toBe("/search/:id");
    expect(routePattern("/u/someone@example.com")).toBe("/u/:id");
  });

  it("caps the result at the sanitizer's MAX_STRING", () => {
    const deep = "/" + Array.from({ length: 30 }, () => "abcdefgh").join("/");
    const pattern = routePattern(deep);
    expect(pattern.length).toBeLessThanOrEqual(MAX_STRING);
    // Capped, not slashed off into a trailing separator.
    expect(pattern.endsWith("/")).toBe(false);
  });

  it("only ever emits characters the sanitizer accepts", () => {
    const inputs = [
      "/",
      "/pro/crm/3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      "/search?q=leaky roof & mold",
      "/p/some-slug-name",
      "/documents/My File (1).pdf",
      "/héllo/wörld",
    ];
    for (const input of inputs) {
      expect(routePattern(input)).toMatch(VALUE_RE);
    }
  });
});

describe("sideForPath", () => {
  it("treats /pro and its children as the pro side", () => {
    expect(sideForPath("/pro")).toBe("pro");
    expect(sideForPath("/pro/leads")).toBe("pro");
    expect(sideForPath("/pro/crm/:id")).toBe("pro");
  });

  it("does not let /pro swallow the public pages that start with those letters", () => {
    // /pros is the marketing page for contractors; the other two are legal
    // documents. All three are reachable signed out.
    expect(sideForPath("/pros")).toBe("public");
    expect(sideForPath("/pro-terms")).toBe("public");
    expect(sideForPath("/pro-data-addendum")).toBe("public");
  });

  it("treats the landing, marketing and auth doors as public", () => {
    for (const path of [
      "/",
      "/pricing",
      "/signin",
      "/homeowner-signup",
      "/contractor-signup",
      "/verify",
      "/go/:id",
      "/p/some-slug-name",
      "/terms",
      "/huntington-beach",
    ]) {
      expect(sideForPath(path)).toBe("public");
    }
  });

  it("does not let a prefix match across a word boundary", () => {
    expect(sideForPath("/privacy")).toBe("public");
    expect(sideForPath("/privacy-choices")).toBe("public");
  });

  it("defaults everything else to the homeowner shell", () => {
    for (const path of [
      "/dashboard",
      "/contractors",
      "/forecast",
      "/learn",
      "/plus",
      "/some-page-added-tomorrow",
    ]) {
      expect(sideForPath(path)).toBe("homeowner");
    }
  });
});

describe("clickIdFrom", () => {
  // A stand-in for the two DOM calls clickIdFrom makes, so this stays a node
  // test alongside the rest of src/lib.
  function el(trackValue: string | null): Element {
    return {
      closest: (selector: string) =>
        selector === "[data-track]" && trackValue !== null
          ? { getAttribute: () => trackValue }
          : null,
    } as unknown as Element;
  }

  it("returns the data-track value of the nearest tagged ancestor", () => {
    expect(clickIdFrom(el("landing_get_started"))).toBe("landing_get_started");
    expect(clickIdFrom(el("nav:/dashboard"))).toBe("nav:/dashboard");
    expect(clickIdFrom(el("menu:upgrade"))).toBe("menu:upgrade");
  });

  it("returns null when nothing in the ancestry is tagged", () => {
    expect(clickIdFrom(el(null))).toBeNull();
  });

  it("returns null for a null or non-element target", () => {
    expect(clickIdFrom(null)).toBeNull();
    // A text node: no closest().
    expect(clickIdFrom({} as unknown as Element)).toBeNull();
  });

  it("rejects a value outside the id alphabet", () => {
    // The payload rule's real teeth: if a data-track value were ever built by
    // interpolating something a person typed, it fails here instead of being
    // stored.
    expect(clickIdFrom(el("Leaky Roof"))).toBeNull();
    expect(clickIdFrom(el("someone@example.com"))).toBeNull();
    expect(clickIdFrom(el("9_starts_with_a_digit"))).toBeNull();
    expect(clickIdFrom(el(""))).toBeNull();
    expect(clickIdFrom(el("x".repeat(41)))).toBeNull();
  });

  it("accepts a value exactly at the length limit", () => {
    const id = "a".repeat(40);
    expect(clickIdFrom(el(id))).toBe(id);
  });
});

describe("prop builders", () => {
  it("names the three events", () => {
    expect(PAGE_VIEW_EVENT).toBe("page_view");
    expect(PAGE_TIME_EVENT).toBe("page_time");
    expect(UI_CLICK_EVENT).toBe("ui_click");
  });

  it("builds page_view props", () => {
    expect(buildPageViewProps("/dashboard")).toEqual({
      path: "/dashboard",
      side: "homeowner",
    });
  });

  it("builds ui_click props", () => {
    expect(buildClickProps("landing_get_started", "/")).toEqual({
      id: "landing_get_started",
      path: "/",
      side: "public",
    });
  });

  it("builds page_time props with a rounded duration", () => {
    expect(buildPageTimeProps("/pro/leads", 1000, 9500.4)).toEqual({
      path: "/pro/leads",
      side: "pro",
      duration_ms: 8500,
    });
  });

  it("clamps a negative duration to zero", () => {
    // A clock that went backwards must never write a negative number: the
    // percentile queries in docs/ANALYTICS.md would happily average it in.
    expect(buildPageTimeProps("/dashboard", 5000, 1000).duration_ms).toBe(0);
  });

  it("clamps a tab left open overnight to the four-hour ceiling", () => {
    const overnight = buildPageTimeProps("/dashboard", 0, 14 * 60 * 60 * 1000);
    expect(overnight.duration_ms).toBe(MAX_PAGE_TIME_MS);
  });

  it("survives a non-finite duration", () => {
    expect(
      buildPageTimeProps("/dashboard", Number.NaN, 1000).duration_ms
    ).toBe(0);
  });

  it("emits props the storage sanitizer keeps intact", () => {
    // The end-to-end guarantee: every field these builders produce survives
    // src/lib/trackProps.ts untouched. A dropped field is a lost signal that
    // nothing else in the pipeline would report.
    const view = buildPageViewProps("/pro/crm/:id");
    const click = buildClickProps("nav:/dashboard", "/dashboard");
    const time = buildPageTimeProps("/p/some-slug-name", 0, 4321);
    expect(sanitizeTrackProps(view)).toEqual(view);
    expect(sanitizeTrackProps(click)).toEqual(click);
    expect(sanitizeTrackProps(time)).toEqual(time);
  });
});
