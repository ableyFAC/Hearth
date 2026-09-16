// Pure helpers behind the usage tracker (src/components/UsageTracker.tsx):
// how many times a control is tapped, and how long a screen is actually
// looked at. Split out of the component so every rule here is unit-testable
// without a DOM, the same split src/lib/webVitals.ts uses.
//
// Payload rule (docs/ANALYTICS.md): ids and enums only, never free text. That
// is the single constraint every function in this file exists to satisfy:
//
//   - a path is a normalized route PATTERN ("/pro/leads/:id"), never
//     location.pathname verbatim and never a query string, because a raw path
//     can carry a job id, an invite token, or a typed search term;
//   - a click id comes ONLY from an explicit data-track attribute a developer
//     wrote, never from a button's label. Deriving an id from link text would
//     turn any user-supplied string that ends up in a control (a pro's
//     business name, a job title) into an analytics value.
//
// Everything emitted here is additionally checked against the storage-layer
// sanitizer in src/lib/trackProps.ts, which will silently drop a value that
// breaks its alphabet. These helpers are written so that never happens: a
// dropped field is a lost signal, not a caught bug.

export const PAGE_VIEW_EVENT = "page_view" as const;
export const PAGE_TIME_EVENT = "page_time" as const;
export const UI_CLICK_EVENT = "ui_click" as const;

// Mirrors MAX_STRING in src/lib/trackProps.ts. A path longer than this would
// be dropped by the sanitizer, so it is capped here instead - a truncated
// pattern still groups usefully; a missing one does not.
const MAX_PATH = 64;

// A path segment that is safe to keep verbatim: lowercase letters, digits, and
// only the punctuation the sanitizer's VALUE_RE allows inside a segment
// (no "/" - that is the separator we split on). Anything else (a percent
// escape, a space, an "@", a comma) means the segment carries something that
// was typed rather than routed, so it collapses to ":id".
const SAFE_SEGMENT = /^[a-z0-9_\-.:]+$/;
// All digits: /issues/482, /jobs/17.
const NUMERIC_SEGMENT = /^\d+$/;
// A UUID is already caught by the length rule below (36 > 24), but it is the
// single most common dynamic segment in this app, so it is named explicitly -
// the rule should be readable, not incidentally correct.
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The longest STATIC segment in the app ("home-maintenance-schedule", 25) sets
// the floor here; anything longer than this is a token, a slug built from
// user text, or an encoded id. 24 keeps short marketing slugs (/p/[id] bio
// links, city landing pages) as themselves, which is the point - those behave
// like enums, and collapsing them would erase the only thing worth counting.
const MAX_SEGMENT = 24;

function collapseSegment(segment: string): string {
  // Empty string: the leading "" from "/a/b".split("/"), and any "//". Kept as
  // is so the rejoin below reproduces the path shape.
  if (segment.length === 0) return segment;
  if (!SAFE_SEGMENT.test(segment)) return ":id";
  if (segment.length > MAX_SEGMENT) return ":id";
  if (NUMERIC_SEGMENT.test(segment)) return ":id";
  if (UUID_SEGMENT.test(segment)) return ":id";
  return segment;
}

// pathname -> the route pattern it belongs to.
//
// Deliberately NOT normalizeRoutePattern() from src/lib/webVitals.ts. That one
// collapses any segment containing a digit or an uppercase letter, which is
// right for its job (a p75 latency number per route) but wrong here: it would
// turn /fountain-valley into itself but /guides/roof-repair-2026 into
// /guides/:id, losing exactly the marketing pages this data is meant to
// compare. This rule keys on what a segment IS (a uuid, a number, an
// over-long token) rather than on which characters it happens to contain.
export function routePattern(pathname: string): string {
  // Query and hash are cut before anything else: "?q=roof" is a typed search
  // term, which the payload rule forbids outright, and the sanitizer's
  // VALUE_RE has no "?" or "#" in it either.
  const [path = ""] = pathname.split(/[?#]/);
  if (path.length === 0) return "/";
  const pattern = path.toLowerCase().split("/").map(collapseSegment).join("/");
  if (pattern.length === 0) return "/";
  // Cap, don't drop. Every character in `pattern` is already in the
  // sanitizer's alphabet, so a slice is still a valid value - it just names a
  // deeper route by its prefix. A trailing "/" from the cut is trimmed so two
  // capped variants of the same route don't split into two rows.
  if (pattern.length <= MAX_PATH) return pattern;
  const capped = pattern.slice(0, MAX_PATH).replace(/\/+$/, "");
  return capped.length === 0 ? "/" : capped;
}

export type UsageSide = "pro" | "homeowner" | "public";

// Every top-level route group that is reachable signed out: the marketing and
// city landing pages, the legal documents, the auth doors, and the two
// first-party redirects (/go campaign links, /p share links). Listed
// explicitly rather than inferred, because the inference would have to be
// "not under (app) and not under pro", and Next's route GROUPS are invisible
// in a pathname - (app) contributes nothing to the URL, so /dashboard and
// /terms look identical to a prefix test.
//
// ORDER OF CHECKS MATTERS: "/pro" is tested first and by exact-or-slash only,
// so /pros, /pro-terms and /pro-data-addendum (all public) are never swallowed
// by the pro side.
const PUBLIC_PREFIXES = [
  "/accessibility",
  "/ai-disclosure",
  "/auth",
  "/billing",
  "/contact",
  "/contractor-signup",
  "/cookies",
  "/dmca",
  "/emergency-help",
  "/fountain-valley",
  "/go",
  "/guidelines",
  "/guides",
  "/homeowner-signup",
  "/huntington-beach",
  "/join",
  "/law-enforcement",
  "/open",
  "/p",
  "/pricing",
  "/privacy",
  "/privacy-choices",
  "/pro-data-addendum",
  "/pro-terms",
  "/pros",
  "/reset-password",
  "/security",
  "/signin",
  "/sms-terms",
  "/subprocessors",
  "/terms",
  "/unsubscribe",
  "/verify",
  "/welcome",
] as const;

function underPrefix(pattern: string, prefix: string): boolean {
  // Exact match or a real path boundary. A bare startsWith() would make
  // /privacy-choices a child of /privacy and /prosper a child of /pros.
  return pattern === prefix || pattern.startsWith(`${prefix}/`);
}

// Which side of the product a pattern belongs to. Carried on every usage event
// so one query can compare "how long does a pro spend on the leads board" with
// "how long does a homeowner spend on the dashboard" without maintaining a
// second list of paths in SQL.
export function sideForPath(pattern: string): UsageSide {
  if (underPrefix(pattern, "/pro")) return "pro";
  if (pattern === "/") return "public";
  if (PUBLIC_PREFIXES.some((prefix) => underPrefix(pattern, prefix))) {
    return "public";
  }
  // Default is homeowner, not "unknown": everything left is under the (app)
  // route group, which is the signed-in homeowner shell. A newly added
  // homeowner page is therefore attributed correctly the day it ships, and a
  // newly added PUBLIC page is only ever mis-filed as homeowner - a wrong
  // bucket, never a leaked id.
  return "homeowner";
}

// The alphabet a data-track value may use: snake_case, or a prefixed route
// pattern ("nav:/dashboard", "menu:/documents"). Tighter than the sanitizer's
// VALUE_RE on purpose - it must start with a lowercase letter, so a value that
// was accidentally interpolated from something user-supplied (a name, a title,
// an id) fails here rather than being stored.
const CLICK_ID = /^[a-z][a-z0-9_:/\-]{0,39}$/;

// The id of the tracked control a click landed in, or null.
//
// ONLY an explicit data-track attribute counts. There is deliberately no
// fallback to the element's text, aria-label, href, or class: every one of
// those can contain a string a person typed (a pro's business name in a CRM
// row, a homeowner's job title in a list), and docs/ANALYTICS.md's payload
// rule forbids free text in props. An untagged control is simply not counted.
export function clickIdFrom(el: Element | null): string | null {
  // event.target is an EventTarget: a text node, the document, or (in a
  // shadow/SVG context) something without closest(). Guarded rather than
  // typed away, because this runs on every click in the app and must never
  // throw.
  if (!el || typeof el.closest !== "function") return null;
  const tagged = el.closest("[data-track]");
  const id = tagged?.getAttribute("data-track");
  if (!id || !CLICK_ID.test(id)) return null;
  return id;
}

// A page nobody could plausibly still be reading. Four hours is well past any
// real session on a maintenance-checklist screen, and the clamp is what keeps
// a laptop closed overnight on /dashboard from landing a 14-hour row that
// drags every average and percentile with it. Clamped rather than dropped:
// "this tab was left open" is still a real page_time, just a capped one.
export const MAX_PAGE_TIME_MS = 4 * 60 * 60 * 1000;

export type PageViewProps = { path: string; side: UsageSide };
export type PageTimeProps = PageViewProps & { duration_ms: number };
export type ClickProps = PageViewProps & { id: string };

// Keys are snake_case to satisfy the sanitizer's KEY_RE, and match the
// `path` key web_vitals already uses so both event families can be joined on
// one column.
export function buildPageViewProps(pattern: string): PageViewProps {
  return { path: pattern, side: sideForPath(pattern) };
}

export function buildClickProps(id: string, pattern: string): ClickProps {
  return { id, path: pattern, side: sideForPath(pattern) };
}

export function buildPageTimeProps(
  pattern: string,
  startedAtMs: number,
  nowMs: number
): PageTimeProps {
  const elapsed = nowMs - startedAtMs;
  // Clamped at both ends. The low end is not paranoia: the caller reads
  // performance.now(), and a clock that went backwards (or a start stamp
  // restored from a bfcache restore) would otherwise write a negative
  // duration that breaks percentile_cont in the queries in docs/ANALYTICS.md.
  const clamped = Number.isFinite(elapsed)
    ? Math.min(Math.max(elapsed, 0), MAX_PAGE_TIME_MS)
    : 0;
  return {
    ...buildPageViewProps(pattern),
    // Whole milliseconds: performance.now() returns fractions, and the
    // sanitizer would round them off anyway.
    duration_ms: Math.round(clamped),
  };
}
