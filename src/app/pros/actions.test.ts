import { describe, it, expect, vi, beforeEach } from "vitest";

// joinProWaitlistAction: the only thing a contractor can do while the pro side
// is closed (guardrail A1). Driven for real against a fake admin client.
//
// THE PROPERTY THIS FILE EXISTS TO PIN: the action must never reveal whether
// an email was already on the list. A "you're already signed up" message turns
// a public, unauthenticated form into an oracle answering "is this contractor
// with OakTend?" for any address somebody cares to type. Every non-validation
// outcome - new row, duplicate, honeypot, even a DB error - returns the same
// { ok: true }.

vi.mock("server-only", () => ({}));

let headerBag = new Map<string, string>();
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerBag.get(k) ?? null }),
}));

// What the fake database does on the next insert.
let rateLimitAllowed: boolean | null = true;
let insertError: { code?: string; message?: string } | null = null;
const inserted: Record<string, unknown>[] = [];
const rateLimitCalls: { bucket: string; limit: number }[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "rate_limit_hit") {
        rateLimitCalls.push({
          bucket: String(args.p_bucket),
          limit: Number(args.p_limit),
        });
        return { data: rateLimitAllowed, error: null };
      }
      return { data: null, error: null };
    },
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        if (insertError) return { error: insertError };
        inserted.push(row);
        return { error: null };
      },
    }),
  }),
}));

import { joinProWaitlistAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  headerBag = new Map([["x-vercel-forwarded-for", "203.0.113.9"]]);
  rateLimitAllowed = true;
  insertError = null;
  inserted.length = 0;
  rateLimitCalls.length = 0;
});

describe("joinProWaitlistAction: validation", () => {
  it.each(["", "nope", "@example.com", "sam@", "sam @example.com", "sam@example"])(
    "refuses %o without touching the database",
    async (email) => {
      const res = await joinProWaitlistAction(form({ email }));
      expect(res.ok).toBe(false);
      expect(inserted).toHaveLength(0);
    }
  );

  it("accepts a normal address", async () => {
    const res = await joinProWaitlistAction(
      form({ email: "sam@example.com", trade: "roof", city: "Irvine" })
    );
    expect(res.ok).toBe(true);
    expect(inserted[0]).toMatchObject({
      email: "sam@example.com",
      trade: "roof",
      city: "Irvine",
    });
  });

  // The select only offers JOB_CATEGORIES, so anything else is a forged or
  // stale submit - dropped rather than refused, because the email is the part
  // worth keeping.
  it("drops an unrecognised trade but keeps the signup", async () => {
    const res = await joinProWaitlistAction(
      form({ email: "sam@example.com", trade: "smuggling" })
    );
    expect(res.ok).toBe(true);
    expect(inserted[0]).toMatchObject({ email: "sam@example.com", trade: null });
  });

  it("caps the city rather than refusing a long one", async () => {
    await joinProWaitlistAction(
      form({ email: "sam@example.com", city: "x".repeat(500) })
    );
    expect(String(inserted[0].city)).toHaveLength(80);
  });

  it("records which closed door the signup came through", async () => {
    await joinProWaitlistAction(
      form({ email: "sam@example.com", source: "pro-shell" })
    );
    expect(inserted[0]).toMatchObject({ source: "pro-shell" });
  });

  it("refuses a request with no FormData at all", async () => {
    const res = await joinProWaitlistAction(
      undefined as unknown as FormData
    );
    expect(res.ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

describe("joinProWaitlistAction: abuse defenses", () => {
  it("rate-limits per IP, on its own bucket, before writing", async () => {
    rateLimitAllowed = false;
    const res = await joinProWaitlistAction(form({ email: "sam@example.com" }));

    expect(res.ok).toBe(false);
    expect(inserted).toHaveLength(0);
    expect(rateLimitCalls[0].bucket).toBe("pro_waitlist:203.0.113.9");
  });

  // A missing IP must not invent a shared bucket silently; it gets its own
  // named one, exactly as the contact form does.
  it("still keys a bucket when no IP header is present", async () => {
    headerBag = new Map();
    await joinProWaitlistAction(form({ email: "sam@example.com" }));
    expect(rateLimitCalls[0].bucket).toBe("pro_waitlist:unknown");
  });

  // Fails OPEN on an RPC hiccup: an outage must not eat a real signup.
  it("lets the signup through when the limiter itself is unreadable", async () => {
    rateLimitAllowed = null;
    const res = await joinProWaitlistAction(form({ email: "sam@example.com" }));
    expect(res.ok).toBe(true);
    expect(inserted).toHaveLength(1);
  });

  it("pretends the honeypot submit worked and stores nothing", async () => {
    const res = await joinProWaitlistAction(
      form({ email: "bot@example.com", company_website: "http://spam" })
    );
    expect(res.ok).toBe(true);
    expect(inserted).toHaveLength(0);
    // Not even a rate-limit slot is burned on a bot.
    expect(rateLimitCalls).toHaveLength(0);
  });
});

describe("joinProWaitlistAction never reveals a duplicate", () => {
  it("answers a unique-violation exactly like a fresh signup", async () => {
    const fresh = await joinProWaitlistAction(form({ email: "sam@example.com" }));

    insertError = { code: "23505", message: "duplicate key value" };
    const repeat = await joinProWaitlistAction(form({ email: "sam@example.com" }));

    expect(repeat).toEqual(fresh);
    expect(repeat.ok).toBe(true);
  });

  // A genuine DB failure is ours to notice in the logs, not theirs to retry
  // into - and surfacing it would be the same oracle by another route.
  it("answers a real insert failure the same way too", async () => {
    insertError = { code: "08006", message: "connection failure" };
    const res = await joinProWaitlistAction(form({ email: "sam@example.com" }));
    expect(res.ok).toBe(true);
  });
});
