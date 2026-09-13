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
