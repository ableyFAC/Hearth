import { describe, it, expect } from "vitest";
import {
  canSendInvoices,
  connectStatusFor,
  humanizeRequirement,
  humanizeRequirements,
  type ConnectRow,
} from "./connectStatus";

// The five-word answer the whole payouts surface is built on, plus the one
// function step 2 (the invoice flow) will gate real money on.
//
// The bug worth guarding against here is a FALSE "ready": every other wrong
// answer costs a pro one extra tap, and this one lets an invoice go out
// against an account Stripe will not pay into.

const READY: ConnectRow = {
  stripe_account_id: "acct_1",
  stripe_details_submitted: true,
  stripe_charges_enabled: true,
  stripe_payouts_enabled: true,
  stripe_requirements_currently_due: [],
  stripe_disabled_reason: null,
};

describe("connectStatusFor", () => {
  it("is not_started with no row at all", () => {
    expect(connectStatusFor(null)).toBe("not_started");
    expect(connectStatusFor(undefined)).toBe("not_started");
    expect(connectStatusFor({})).toBe("not_started");
  });

  it("is not_started when the account id is missing or empty", () => {
    expect(connectStatusFor({ stripe_account_id: null })).toBe("not_started");
    // An empty string is not an account. It has never been written, but a
    // coalesce somewhere upstream could produce one, and "" must not read as
    // "they have an account".
    expect(connectStatusFor({ stripe_account_id: "" })).toBe("not_started");
  });

  it("is in_progress once an account exists but onboarding is unfinished", () => {
    expect(connectStatusFor({ stripe_account_id: "acct_1" })).toBe("in_progress");
    expect(
      connectStatusFor({
        stripe_account_id: "acct_1",
        stripe_details_submitted: false,
      })
    ).toBe("in_progress");
  });

  it("is in_progress even when Stripe already enabled charges", () => {
    // Order matters: details_submitted is checked first, so a pro who has not
    // finished the form is told to finish it rather than being called
    // "restricted", which would read as a problem with their business.
    expect(
      connectStatusFor({
        stripe_account_id: "acct_1",
        stripe_details_submitted: false,
        stripe_charges_enabled: true,
        stripe_payouts_enabled: true,
      })
    ).toBe("in_progress");
  });

  it("is restricted when details are in but either capability is off", () => {
    expect(
      connectStatusFor({ ...READY, stripe_charges_enabled: false })
    ).toBe("restricted");
    expect(
      connectStatusFor({ ...READY, stripe_payouts_enabled: false })
    ).toBe("restricted");
    expect(
      connectStatusFor({
        stripe_account_id: "acct_1",
        stripe_details_submitted: true,
      })
    ).toBe("restricted");
  });

  it("is ready only when charges AND payouts are both enabled", () => {
    expect(connectStatusFor(READY)).toBe("ready");
  });

  it("never returns ready on a row whose booleans are null", () => {
    // This is the missing-schema shape: 0164 has not been pasted, the select
    // fell back, and every stripe_* value is null. It must not read as ready.
    expect(
      connectStatusFor({
        stripe_account_id: null,
        stripe_details_submitted: null,
        stripe_charges_enabled: null,
        stripe_payouts_enabled: null,
      })
    ).toBe("not_started");
  });

  it("never returns unavailable by itself", () => {
    // "unavailable" is a deployment fact (the column does not exist), not a
    // fact about the contractor, so only the caller may produce it.
    for (const row of [null, {}, READY, { stripe_account_id: "acct_1" }]) {
      expect(connectStatusFor(row as ConnectRow)).not.toBe("unavailable");
    }
  });
});

describe("canSendInvoices", () => {
  it("is true only for a ready account", () => {
    expect(canSendInvoices(READY)).toBe(true);
  });

  it("is false for every other state, including no row", () => {
    expect(canSendInvoices(null)).toBe(false);
    expect(canSendInvoices({})).toBe(false);
    expect(canSendInvoices({ stripe_account_id: "acct_1" })).toBe(false);
    expect(
      canSendInvoices({ ...READY, stripe_details_submitted: false })
    ).toBe(false);
    expect(canSendInvoices({ ...READY, stripe_charges_enabled: false })).toBe(
      false
    );
    expect(canSendInvoices({ ...READY, stripe_payouts_enabled: false })).toBe(
      false
    );
  });

  it("reads truthiness, which is why the ONLY writer coerces with !!", () => {
    // A note in test form, not a behaviour anyone should rely on. These checks
    // are truthiness checks, so a string "false" in either capability column
    // would read as enabled - the classic shape that turns a disabled account
    // into a green light. Nothing can put a string there today: the only
    // writer of these columns is syncConnectAccount() in
    // src/lib/stripeConnect.ts, which coerces every flag with !! before the
    // write, and the columns are `boolean not null` in 0164. If a SECOND
    // writer ever appears, it has to coerce too, or this is the hole.
    const stringy = {
      stripe_account_id: "acct_1",
      stripe_details_submitted: true,
      stripe_charges_enabled: true,
      stripe_payouts_enabled: "false",
    } as unknown as ConnectRow;
    expect(canSendInvoices(stringy)).toBe(true);
  });
});

describe("humanizeRequirement", () => {
  it("translates the keys a US Express account actually shows", () => {
    expect(humanizeRequirement("external_account")).toBe(
      "A bank account to pay out to"
    );
    expect(humanizeRequirement("individual.id_number")).toBe(
      "Your Social Security number"
    );
    expect(humanizeRequirement("individual.verification.document")).toBe(
      "A photo of your ID"
    );
    expect(humanizeRequirement("business_profile.url")).toBe(
      "A website or social page for your business"
    );
    expect(humanizeRequirement("tos_acceptance.date")).toBe(
      "Accepting Stripe's terms"
    );
  });

  it("hands back an unknown key unchanged rather than guessing", () => {
    expect(humanizeRequirement("some.future.requirement")).toBe(
      "some.future.requirement"
    );
    expect(humanizeRequirement("")).toBe("");
  });
});

describe("humanizeRequirements", () => {
  it("returns an empty list for anything that is not an array", () => {
    expect(humanizeRequirements(null)).toEqual([]);
    expect(humanizeRequirements(undefined)).toEqual([]);
    expect(humanizeRequirements([])).toEqual([]);
  });

  it("collapses keys that mean one question to a human", () => {
    expect(
      humanizeRequirements([
        "individual.dob.day",
        "individual.dob.month",
        "individual.dob.year",
      ])
    ).toEqual(["Your date of birth"]);
  });

  it("keeps order and drops non-strings", () => {
    expect(
      humanizeRequirements([
        "external_account",
        null as unknown as string,
        "individual.id_number",
      ])
    ).toEqual(["A bank account to pay out to", "Your Social Security number"]);
  });
});
