import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactElement } from "react";

// The half of preview mode that lives inside async server components and
// server actions (A1, A2, A4, B2). These are EXECUTED, not grepped: each page
// is called as the plain async function it is, and the React element tree it
// returns is walked for what should (or should not) be in it. No DOM, no
// react-dom - a server component is a function that returns a description of a
// tree, and that description is exactly what is being asserted.

vi.mock("server-only", () => ({}));

// next/headers and next/navigation have no meaning outside a request. Every
// page under test returns BEFORE touching either when preview is on, so these
// stubs also double as tripwires: if a preview branch ever starts reading a
// session or redirecting, these throw and the test says so.
vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [] }),
  headers: async () => ({ get: () => null }),
}));

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// Tree walking helpers
// ---------------------------------------------------------------------------
type Node = unknown;

function children(node: Node): Node[] {
  const el = node as Partial<ReactElement> & { props?: Record<string, unknown> };
  const kids = el?.props?.children;
  if (kids === undefined || kids === null) return [];
  return Array.isArray(kids) ? kids : [kids];
}

// Every component function/string in the returned tree.
function typesIn(node: Node, acc: unknown[] = []): unknown[] {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const n of node) typesIn(n, acc);
    return acc;
  }
  const el = node as Partial<ReactElement>;
  if (el.type !== undefined) acc.push(el.type);
  for (const kid of children(node)) typesIn(kid, acc);
  return acc;
}

// Every string rendered anywhere in the tree, flattened, so a sentence can be
// asserted without caring which element carries it.
function textIn(node: Node, acc: string[] = []): string[] {
  if (node === null || node === undefined || node === false) return acc;
  if (typeof node === "string") {
    acc.push(node);
    return acc;
  }
  if (typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const n of node) textIn(n, acc);
    return acc;
  }
  for (const kid of children(node)) textIn(kid, acc);
  return acc;
}

function joinedText(node: Node): string {
  return textIn(node).join(" ").replace(/\s+/g, " ");
}

// Every element in the tree that carries an href, as [href, its own text].
// Enough to assert where each link on the coming-soon page points without a
// DOM: a Link is just an element whose props hold the destination.
function linksIn(node: Node): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = [];
  const walk = (n: Node) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) {
      for (const kid of n) walk(kid);
      return;
    }
    const el = n as Partial<ReactElement> & { props?: Record<string, unknown> };
    if (typeof el.props?.href === "string") {
      out.push({ href: el.props.href, text: joinedText(n) });
    }
    for (const kid of children(n)) walk(kid);
  };
  walk(node);
  return out;
}

// ---------------------------------------------------------------------------
// A1 + A2: every contractor door renders ProsComingSoon
// ---------------------------------------------------------------------------
describe("the closed contractor doors (A1, A2)", () => {
  async function proComponents(opts: { internal?: boolean } = {}) {
    vi.resetModules();
    vi.doMock("@/lib/previewModeServer", () => ({
      isProSideOpenForViewer: async () => opts.internal ?? false,
      assertProSideOpen: async () => {},
      previewBlocksMoney: async () => false,
      // The pure half: the shell and /pro/onboarding call it to tell the
      // coming-soon page where this account's homeowner side is. Its own
      // behaviour is pinned in previewModeServer.test.ts.
      homeownerLanding: (s: { hasHome: boolean }) =>
        s.hasHome ? "/dashboard" : "/onboarding",
      previewAwareLanding: async () => "/dashboard",
    }));
    vi.doMock("@/lib/contractor", () => ({
      getCurrentContractor: async () => ({
        id: "c1",
        name: "Test Co",
        user_id: "u1",
      }),
      getSides: async () => ({ hasPro: true, hasHome: false, checked: true }),
      isEstablishedPro: async () => true,
      isContractor: async () => false,
      landingFor: () => "/pro",
      preferredRole: () => "contractor",
    }));
    vi.doMock("@/lib/subscription", () => ({
      hasProPlan: async () => false,
      getProSubscription: async () => null,
    }));
    vi.doMock("@/lib/freeAiTasteServer", () => ({ proDraftsLeft: async () => 0 }));
    vi.doMock("@/lib/user", () => ({ getUserProfile: async () => null }));
    vi.doMock("@/lib/auth", () => ({
      getVerifiedUser: async () => null,
      getUser: async () => null,
    }));

    const ProsComingSoon = (await import("@/components/pro/ProsComingSoon"))
      .default;
    return { ProsComingSoon };
  }

  it("/pros renders the coming-soon page in preview", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { ProsComingSoon } = await proComponents();
    const ProsLanding = (await import("@/app/pros/page")).default;

    const tree = await ProsLanding({});
    expect(typesIn(tree)).toContain(ProsComingSoon);
  });

  it("/contractor-signup swaps the signup form for it in preview", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { ProsComingSoon } = await proComponents();
    const Layout = (await import("@/app/contractor-signup/layout")).default;

    const tree = Layout({ children: "THE REAL SIGNUP FORM" });
    expect(typesIn(tree)).toContain(ProsComingSoon);
    // The signup page's own subtree must not be rendered at all, not merely
    // hidden: that module builds a Supabase client and the OAuth buttons.
    expect(joinedText(tree)).not.toContain("THE REAL SIGNUP FORM");
  });

  it("the pro shell renders it instead of the app for a non-internal pro", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { ProsComingSoon } = await proComponents({ internal: false });
    const ProLayout = (await import("@/app/pro/layout")).default;

    const tree = await ProLayout({ children: "THE PRO APP" });
    expect(typesIn(tree)).toContain(ProsComingSoon);
    expect(joinedText(tree)).not.toContain("THE PRO APP");
  });

  // The team has to be able to walk the whole contractor flow while the public
  // side is shut, so an internal account gets the real shell.
  it("the pro shell renders the real app for an internal account", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { ProsComingSoon } = await proComponents({ internal: true });
    const ProLayout = (await import("@/app/pro/layout")).default;

    const tree = await ProLayout({ children: "THE PRO APP" });
    expect(typesIn(tree)).not.toContain(ProsComingSoon);
    expect(joinedText(tree)).toContain("THE PRO APP");
  });

  it("the coming-soon page says the approved words and carries the form", async () => {
    vi.resetModules();
    const ProsComingSoon = (await import("@/components/pro/ProsComingSoon"))
      .default;
    const ProWaitlistForm = (await import("@/components/pro/ProWaitlistForm"))
      .default;

    const tree = ProsComingSoon({});
    const text = joinedText(tree);
    expect(text).toContain("Pros are coming soon");
    expect(text).toContain("OakTend for Pros opens after our homeowner preview.");
    expect(typesIn(tree)).toContain(ProWaitlistForm);
  });
});

// ---------------------------------------------------------------------------
// The way off the closed pro side, for an account that has another one
//
// The trap: every link on this page pointed at "/", the root page sends a
// signed-in user to landingFor(sides), and that answers "/pro" for an account
// that prefers the contractor side - so "Back to OakTend" looked like a
// refresh and a pro who ALSO owns a home could not reach it.
// ---------------------------------------------------------------------------
describe("the coming-soon page's homeowner door", () => {
  async function load() {
    vi.resetModules();
    return (await import("@/components/pro/ProsComingSoon")).default;
  }

  it("offers a signed-in account with a home the way back to it", async () => {
    const ProsComingSoon = await load();
    const tree = ProsComingSoon({
      showSignOut: true,
      source: "pro-shell",
      homeownerHref: "/dashboard",
      hasHome: true,
    });

    const links = linksIn(tree);
    const button = links.find((l) =>
      l.text.includes("Go to your homeowner account")
    );
    expect(button?.href).toBe("/dashboard");

    // The two links that used to be the trap now point at the same place.
    expect(links.find((l) => l.text.includes("Back to OakTend"))?.href).toBe(
      "/dashboard"
    );
    expect(links.every((l) => l.href !== "/")).toBe(true);

    // An account that already has a home is going BACK to something, so the
    // reassurance line for the other case must not appear.
    expect(joinedText(tree)).not.toContain("Your pro profile stays saved");
  });

  it("offers a signed-in account with no home the first-home setup", async () => {
    const ProsComingSoon = await load();
    const tree = ProsComingSoon({
      showSignOut: true,
      source: "pro-onboarding",
      homeownerHref: "/onboarding",
      hasHome: false,
    });

    const links = linksIn(tree);
    expect(
      links.find((l) => l.text.includes("Use OakTend as a homeowner"))?.href
    ).toBe("/onboarding");
    expect(links.find((l) => l.text.includes("Back to OakTend"))?.href).toBe(
      "/onboarding"
    );
    expect(joinedText(tree)).toContain(
      "Your pro profile stays saved for when Pros open."
    );
  });

  it("shows neither button to a signed-out visitor, and keeps the public doors on /", async () => {
    const ProsComingSoon = await load();
    const tree = ProsComingSoon({ source: "pros" });

    const text = joinedText(tree);
    expect(text).not.toContain("Go to your homeowner account");
    expect(text).not.toContain("Use OakTend as a homeowner");

    // /pros and /contractor-signup are reached signed-out, and for that
    // visitor "OakTend" and "Back to OakTend" are still the marketing root.
    const links = linksIn(tree);
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((l) => l.href === "/")).toBe(true);
  });

  // The shell is the caller that holds the sides, and the props it passes are
  // the whole fix: a blocked pro who owns a home gets /dashboard, one who does
  // not gets /onboarding.
  it("the pro shell hands the page that door", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");

    for (const hasHome of [true, false]) {
      vi.resetModules();
      vi.doMock("@/lib/previewModeServer", () => ({
        isProSideOpenForViewer: async () => false,
        homeownerLanding: (s: { hasHome: boolean }) =>
          s.hasHome ? "/dashboard" : "/onboarding",
      }));
      vi.doMock("@/lib/contractor", () => ({
        getCurrentContractor: async () => ({ id: "c1", user_id: "u1" }),
        getSides: async () => ({
          hasPro: true,
          hasHome,
          preferred: "contractor",
          checked: true,
        }),
        isEstablishedPro: async () => true,
      }));
      vi.doMock("@/lib/subscription", () => ({
        hasProPlan: async () => false,
        getProSubscription: async () => null,
      }));
      vi.doMock("@/lib/freeAiTasteServer", () => ({
        proDraftsLeft: async () => 0,
      }));
      vi.doMock("@/lib/user", () => ({ getUserProfile: async () => null }));

      const ProLayout = (await import("@/app/pro/layout")).default;
      const tree = (await ProLayout({ children: "THE PRO APP" })) as {
        props?: { homeownerHref?: string | null; hasHome?: boolean };
      };

      expect(tree.props?.hasHome, String(hasHome)).toBe(hasHome);
      expect(tree.props?.homeownerHref, String(hasHome)).toBe(
        hasHome ? "/dashboard" : "/onboarding"
      );
    }
  });
});

// ---------------------------------------------------------------------------
// B2: the membership pages
// ---------------------------------------------------------------------------
describe("the membership pages in preview (B2)", () => {
  it("/plus shows the coming-soon line and never asks Stripe anything", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    vi.resetModules();

    const stripeTouched: string[] = [];
    vi.doMock("@/lib/stripe", () => ({
      stripe: new Proxy(
        {},
        {
          get(_t, prop) {
            stripeTouched.push(String(prop));
            return () => undefined;
          },
        }
      ),
    }));
    vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
    vi.doMock("@/lib/auth", () => ({ getUser: async () => ({ id: "u1" }) }));
    vi.doMock("@/lib/trackServer", () => ({ trackServerEvent: async () => {} }));

    const { PREVIEW_MEMBERSHIP_COPY } = await import("@/lib/previewMode");
    const PlusPage = (await import("@/app/(app)/plus/page")).default;

    const tree = await PlusPage({ searchParams: Promise.resolve({}) });
    expect(joinedText(tree)).toContain(PREVIEW_MEMBERSHIP_COPY);
    expect(stripeTouched).toEqual([]);
  });

  it("/pro/plus shows it too, without reaching the member branch", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    vi.resetModules();

    const stripeTouched: string[] = [];
    vi.doMock("@/lib/stripe", () => ({
      stripe: new Proxy(
        {},
        {
          get(_t, prop) {
            stripeTouched.push(String(prop));
            return () => undefined;
          },
        }
      ),
    }));
    vi.doMock("@/lib/contractor", () => ({
      getCurrentContractor: async () => {
        throw new Error("the preview branch must return before this");
      },
    }));
    vi.doMock("@/lib/auth", () => ({ getUser: async () => ({ id: "u1" }) }));
    vi.doMock("@/lib/trackServer", () => ({ trackServerEvent: async () => {} }));

    const { PREVIEW_MEMBERSHIP_COPY } = await import("@/lib/previewMode");
    const { PlusPreview } = await import("@/app/pro/plus/PlusScreens");
    const ProPlusPage = (await import("@/app/pro/plus/page")).default;

    const tree = await ProPlusPage({ searchParams: Promise.resolve({}) });

    // Asserted on the element and its prop, not on rendered text: every branch
    // of this page returns ONE client component and carries no markup of its
    // own (proPlusPhone.test.ts pins that, for the Flight-row streaming reason
    // in PlusScreens.tsx), so the copy travels as a prop rather than as a
    // child.
    expect((tree as { type?: unknown }).type).toBe(PlusPreview);
    expect((tree as { props?: { copy?: string } }).props?.copy).toBe(
      PREVIEW_MEMBERSHIP_COPY
    );
    expect(stripeTouched).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A4 + C1: no money action reaches Stripe
// ---------------------------------------------------------------------------
describe("every homeowner money action is closed in preview (A4)", () => {
  async function loadPlusActions() {
    vi.resetModules();
    // vi.doMock registrations SURVIVE resetModules, so the stubbed
    // previewModeServer the describe above installs would still be in force
    // here - and its previewBlocksMoney() answers false, which silently turned
    // this whole test into a test of the actions' ORDINARY failure paths (it
    // collected "No active subscription to change." and passed the redirect
    // assertions). The real module is what is under test; put it back.
    vi.doUnmock("@/lib/previewModeServer");
    vi.doUnmock("@/lib/contractor");

    const stripeTouched: string[] = [];
    vi.doMock("@/lib/stripe", () => ({
      stripe: new Proxy(
        {},
        {
          get(_t, prop) {
            stripeTouched.push(String(prop));
            return () => undefined;
          },
        }
      ),
    }));
    const flashes: string[] = [];
    vi.doMock("@/lib/flash", () => ({
      setFlash: async (message: string) => {
        flashes.push(message);
      },
    }));
    vi.doMock("next/cache", () => ({ revalidatePath: () => {} }));
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({}),
    }));
    vi.doMock("@/lib/auth", () => ({
      getUser: async () => ({ id: "u1" }),
      // What the REAL previewModeServer reads. An internal account on purpose:
      // A4 blocks money for everybody, the team included, so this is the
      // strictest case to assert against.
      getVerifiedUser: async () => ({ id: "u1" }),
    }));
    vi.doMock("@/lib/internalAccounts", () => ({
      isInternalUser: async () => true,
    }));
    vi.doMock("@/lib/subscription", () => ({
      getSubscription: async () => null,
      getProSubscription: async () => null,
      isPlusTrialEligible: async () => true,
    }));
    vi.doMock("@/lib/trackServer", () => ({ trackServerEvent: async () => {} }));

    const actions = await import("@/app/(app)/plus/actions");
    return { actions, stripeTouched, flashes };
  }

  it("flashes coming-soon, redirects to /plus, and touches no Stripe namespace", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { actions, stripeTouched, flashes } = await loadPlusActions();
    const { PREVIEW_MEMBERSHIP_COPY } = await import("@/lib/previewMode");

    const calls: Array<[string, () => Promise<unknown>]> = [
      ["startPlusCheckoutAction", () => actions.startPlusCheckoutAction(new FormData())],
      ["setExtraHomesAction", () => actions.setExtraHomesAction(new FormData())],
      ["upgradeToYearlyAction", () => actions.upgradeToYearlyAction()],
      ["downgradeToMonthlyAction", () => actions.downgradeToMonthlyAction()],
      ["keepYearlyAction", () => actions.keepYearlyAction()],
      ["cancelMembershipAction", () => actions.cancelMembershipAction()],
      ["resumeMembershipAction", () => actions.resumeMembershipAction()],
      ["manageBillingAction", () => actions.manageBillingAction()],
    ];

    for (const [name, run] of calls) {
      await expect(run(), name).rejects.toThrow("NEXT_REDIRECT:/plus");
    }

    // One coming-soon flash per action, and not one word of Stripe.
    expect(flashes).toHaveLength(calls.length);
    expect(new Set(flashes)).toEqual(new Set([PREVIEW_MEMBERSHIP_COPY]));
    expect(stripeTouched).toEqual([]);
  });
});
