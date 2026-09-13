import { describe, it, expect, vi, afterEach } from "vitest";

// HOMEOWNER PREVIEW MODE, the parts that can be driven for real: the switch
// itself, the plan helpers it flips (B1), and the structural Stripe backstop
// (C1). The wiring that only exists inside async server components is pinned
// separately in previewModeWiring.test.ts.
//
// THE RULE EVERY TEST HERE EXISTS FOR (C4): with the flag off, nothing
// changes. Every describe below therefore has a matching "unchanged when the
// flag is off" case, because a preview switch that quietly alters normal
// behaviour is worse than no switch at all.

vi.mock("server-only", () => ({}));

import {
  isHomeownerPreview,
  PREVIEW_MEMBERSHIP_COPY,
  PREVIEW_PROS_COPY,
} from "./previewMode";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("isHomeownerPreview", () => {
  it("is on for exactly the documented value", () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    expect(isHomeownerPreview()).toBe(true);
  });

  it("is off when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "");
    expect(isHomeownerPreview()).toBe(false);
  });

  // The trap this guards: a truthiness check would read "false" and "off" as
  // ON and close the contractor side of a live site.
  it.each(["false", "off", "0", "no", "Homeowner", "homeowner "])(
    "is off for %o, not truthy-on",
    (value) => {
      vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", value);
      expect(isHomeownerPreview()).toBe(false);
    }
  );

  // Read at CALL time, not at module load - which is what makes vi.stubEnv
  // work at all, and what lets a dev server pick up a changed .env.local.
  it("re-reads the variable on every call", () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    expect(isHomeownerPreview()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "");
    expect(isHomeownerPreview()).toBe(false);
  });
});

describe("the two copy constants", () => {
  it("say what the spec says, word for word", () => {
    expect(PREVIEW_MEMBERSHIP_COPY).toBe(
      "Memberships are coming soon. Everything is free during our preview."
    );
    expect(PREVIEW_PROS_COPY).toBe("Pros are coming soon.");
  });
});

// ---------------------------------------------------------------------------
// C1: the structural Stripe backstop
// ---------------------------------------------------------------------------
describe("src/lib/stripe.ts in preview (C1)", () => {
  // A key has to be present, or the "not set" throw would mask the preview
  // throw and the webhooks case could not be tested at all.
  function withKey() {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_previewbackstop");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "development");
  }

  it("throws for every money namespace when preview is on", async () => {
    vi.resetModules();
    withKey();
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { stripe } = await import("./stripe");

    for (const prop of [
      "checkout",
      "subscriptions",
      "billingPortal",
      "subscriptionSchedules",
      "accounts",
      "invoices",
    ] as const) {
      expect(
        () => (stripe as unknown as Record<string, unknown>)[prop],
        prop
      ).toThrow(/disabled in preview mode/);
    }
  });

  // Signature verification is a LOCAL HMAC check and moves no money, and the
  // webhook routes have to keep answering 200/400 rather than 500.
  it("does NOT throw for stripe.webhooks in preview", async () => {
    vi.resetModules();
    withKey();
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { stripe } = await import("./stripe");

    expect(() => stripe.webhooks).not.toThrow();
    expect(typeof stripe.webhooks.constructEvent).toBe("function");
  });

  it("throws nothing at all with the flag off", async () => {
    vi.resetModules();
    withKey();
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "");
    const { stripe } = await import("./stripe");

    expect(() => stripe.checkout).not.toThrow();
    expect(() => stripe.webhooks).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// B1: the plan helpers
// ---------------------------------------------------------------------------
describe("src/lib/subscription.ts in preview (B1)", () => {
  // Every dependency answers "this account has nothing" - no session, no rows,
  // no active property - so a true/paid answer can only have come from the
  // preview branch and never from data.
  async function loadSubscription() {
    vi.resetModules();
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: async () => ({
        from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
      }),
    }));
    vi.doMock("@/lib/supabase/admin", () => ({
      createAdminClient: () => ({
        from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
      }),
    }));
    vi.doMock("@/lib/auth", () => ({ getUser: async () => null }));
    vi.doMock("@/lib/property", () => ({ getActiveProperty: async () => null }));
    // Importing the real module would be fine (nothing here touches it), but
    // stubbing keeps this test honest about calling ZERO Stripe methods.
    vi.doMock("@/lib/stripe", () => ({ stripe: {} }));
    return import("./subscription");
  }

  it("hands every homeowner Plus", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const sub = await loadSubscription();

    await expect(sub.hasPlus()).resolves.toBe(true);
    await expect(sub.ownsPlus()).resolves.toBe(true);
    await expect(sub.getPlusTier()).resolves.toBe("paid");
  });

  // "paid", not "trialing": the tier is what the COPY reads, and a countdown
  // in front of a preview that is not a trial and does not end in a charge is
  // the wrong thing to say.
  it("reports the paid tier, not trialing", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const sub = await loadSubscription();
    await expect(sub.getPlusTier()).resolves.not.toBe("trialing");
  });

  // The pro side is CLOSED, not upgraded: an internal pro tests the real
  // membership rules, so these two must answer off the rows as always.
  it("leaves the pro-side helpers alone", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const sub = await loadSubscription();

    await expect(sub.hasProPlan()).resolves.toBe(false);
    await expect(sub.hasActivePaidProPlan()).resolves.toBe(false);
  });

  it("changes nothing with the flag off", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "");
    const sub = await loadSubscription();

    await expect(sub.hasPlus()).resolves.toBe(false);
    await expect(sub.ownsPlus()).resolves.toBe(false);
    await expect(sub.getPlusTier()).resolves.toBe("free");
  });
});

// ---------------------------------------------------------------------------
// A2: who the pro side is open to
// ---------------------------------------------------------------------------
describe("isProSideOpenForViewer (A2)", () => {
  async function loadGuard(opts: {
    user?: { id: string } | null;
    internal?: boolean;
  }) {
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({
      getVerifiedUser: async () => opts.user ?? null,
    }));
    vi.doMock("@/lib/internalAccounts", () => ({
      isInternalUser: async () => opts.internal ?? false,
    }));
    vi.doMock("@/lib/flash", () => ({ setFlash: async () => {} }));
    vi.doMock("next/navigation", () => ({
      redirect: (url: string) => {
        throw new Error(`NEXT_REDIRECT:${url}`);
      },
    }));
    return import("./previewModeServer");
  }

  // The whole point of C4 for this file: with the flag off it is a constant
  // `true` and never reads a session or the database at all.
  it("is open with the flag off, without reading anything", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "");
    const getVerifiedUser = vi.fn(async () => null);
    vi.resetModules();
    vi.doMock("@/lib/auth", () => ({ getVerifiedUser }));
    vi.doMock("@/lib/internalAccounts", () => ({
      isInternalUser: async () => false,
    }));
    vi.doMock("@/lib/flash", () => ({ setFlash: async () => {} }));
    vi.doMock("next/navigation", () => ({ redirect: () => {} }));
    const mod = await import("./previewModeServer");

    await expect(mod.isProSideOpenForViewer()).resolves.toBe(true);
    expect(getVerifiedUser).not.toHaveBeenCalled();
  });

  it("blocks a signed-out visitor in preview", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const mod = await loadGuard({ user: null });
    await expect(mod.isProSideOpenForViewer()).resolves.toBe(false);
  });

  it("blocks a real (non-internal) pro in preview", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const mod = await loadGuard({ user: { id: "real-pro" }, internal: false });
    await expect(mod.isProSideOpenForViewer()).resolves.toBe(false);
  });

  it("lets an internal account through in preview", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const mod = await loadGuard({ user: { id: "team" }, internal: true });
    await expect(mod.isProSideOpenForViewer()).resolves.toBe(true);
  });

  it("assertProSideOpen redirects a blocked pro and returns for an internal one", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");

    const blocked = await loadGuard({ user: { id: "real" }, internal: false });
    await expect(blocked.assertProSideOpen()).rejects.toThrow("NEXT_REDIRECT:/pro");

    const allowed = await loadGuard({ user: { id: "team" }, internal: true });
    await expect(allowed.assertProSideOpen()).resolves.toBeUndefined();
  });

  // A4 applies to EVERYONE, internal included: an OakTend card is still a real
  // charge. This is the one guard in the file that does not carve the team out.
  it("previewBlocksMoney blocks in preview and never outside it", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const on = await loadGuard({ user: { id: "team" }, internal: true });
    await expect(on.previewBlocksMoney()).resolves.toBe(true);

    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "");
    const off = await loadGuard({ user: { id: "team" }, internal: true });
    await expect(off.previewBlocksMoney()).resolves.toBe(false);
  });
});
