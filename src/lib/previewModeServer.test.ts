import { describe, it, expect, vi, afterEach } from "vitest";

// previewAwareLanding(): the landing decision, with the one preview rule laid
// over it - a viewer the contractor side is CLOSED to may never be answered
// "/pro", because "/pro" renders the coming-soon page and every landing that
// points there is a loop back onto it.
//
// The real module is under test (only its dependencies are stubbed), so this
// also pins the two things that keep the preview cheap and safe: the flag is
// consulted before any session read, and the gate fails CLOSED.

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock("@/lib/flash", () => ({ setFlash: async () => {} }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

// The real landingFor is used throughout: the point of most of these cases is
// that previewAwareLanding returns what landingFor would have, unchanged.
async function load(opts: { user?: { id: string } | null; internal?: boolean }) {
  vi.resetModules();
  vi.doMock("@/lib/auth", () => ({
    getVerifiedUser: async () => opts.user ?? null,
  }));
  vi.doMock("@/lib/internalAccounts", () => ({
    isInternalUser: async () => opts.internal ?? false,
  }));
  return import("@/lib/previewModeServer");
}

const PRO_AND_HOME = {
  hasPro: true,
  hasHome: true,
  preferred: "contractor" as const,
  checked: true,
};
const PRO_ONLY = {
  hasPro: true,
  hasHome: false,
  preferred: "contractor" as const,
  checked: true,
};

describe("previewAwareLanding", () => {
  it("is landingFor, unchanged, when preview is off", async () => {
    // No NEXT_PUBLIC_PREVIEW_MODE stubbed: the flag is off, which is the
    // normal deploy, and nothing about the landing may differ there.
    const { previewAwareLanding } = await load({ user: null });

    expect(await previewAwareLanding(PRO_AND_HOME)).toBe("/pro");
    expect(await previewAwareLanding(PRO_ONLY)).toBe("/pro");
    expect(
      await previewAwareLanding({
        hasPro: false,
        hasHome: true,
        preferred: "homeowner",
        checked: true,
      })
    ).toBe("/dashboard");
  });

  it("sends a blocked dual-sided account to the home it actually owns", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { previewAwareLanding } = await load({
      user: { id: "u1" },
      internal: false,
    });

    // landingFor would answer "/pro" here - the account prefers the contractor
    // side and has it. That is exactly the answer that trapped them.
    expect(await previewAwareLanding(PRO_AND_HOME)).toBe("/dashboard");
  });

  it("sends a blocked pro with no home to the first-home setup", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { previewAwareLanding } = await load({
      user: { id: "u1" },
      internal: false,
    });

    expect(await previewAwareLanding(PRO_ONLY)).toBe("/onboarding");
  });

  it("leaves an internal account on landingFor", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { previewAwareLanding } = await load({
      user: { id: "u1" },
      internal: true,
    });

    // The team walks the whole contractor flow while the public side is shut,
    // so their landing is the ordinary one.
    expect(await previewAwareLanding(PRO_AND_HOME)).toBe("/pro");
    expect(await previewAwareLanding(PRO_ONLY)).toBe("/pro");
  });

  it("fails closed: a signed-out read in preview still gets the homeowner side", async () => {
    vi.stubEnv("NEXT_PUBLIC_PREVIEW_MODE", "homeowner");
    const { previewAwareLanding } = await load({ user: null });

    // Same posture as isProSideOpenForViewer: no verified user means "not
    // internal" means "blocked", never "let them onto the pro side".
    expect(await previewAwareLanding(PRO_AND_HOME)).toBe("/dashboard");
  });
});

describe("homeownerLanding", () => {
  it("is the one definition of the pair of destinations", async () => {
    const { homeownerLanding } = await load({ user: null });

    expect(homeownerLanding({ hasHome: true })).toBe("/dashboard");
    expect(homeownerLanding({ hasHome: false })).toBe("/onboarding");
  });
});
