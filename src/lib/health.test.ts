import { describe, it, expect } from "vitest";
import { systemStatus, lifeLeftText } from "./health";
import type { HomeSystem } from "@/lib/database.types";

// These two helpers were pulled out of SystemRow so the printed home report
// (the paid artifact) and the interactive card on screen say the SAME thing
// about a system. That guarantee is only worth something if it is tested, so
// these lock the branching down.

const THIS_YEAR = new Date().getFullYear();

function system(over: Partial<HomeSystem> = {}): HomeSystem {
  return {
    id: "s1",
    property_id: "p1",
    system_type: "roof", // DEFAULT_LIFESPANS.roof = 22
    material_or_model: null,
    model_number: null,
    capacity: null,
    install_year: null,
    last_serviced: null,
    condition_rating: null,
    expected_lifespan_years: null,
    notes: null,
    created_at: new Date().toISOString(),
    confirmed_at: null,
    ...over,
  } as HomeSystem;
}

describe("systemStatus", () => {
  it("labels a system with no install year as Add details", () => {
    const s = systemStatus(system());
    expect(s.label).toBe("Add details");
    expect(s.stage).toBe("unknown");
    expect(s.mustDo).toBe(false);
  });

  it("labels a young system Healthy", () => {
    const s = systemStatus(system({ install_year: THIS_YEAR - 1 }));
    expect(s.label).toBe("Healthy");
    expect(s.mustDo).toBe(false);
  });

  it("treats a condition rating of 1 as Must do at any age", () => {
    const s = systemStatus(
      system({ install_year: THIS_YEAR - 1, condition_rating: 1 })
    );
    expect(s.mustDo).toBe(true);
    expect(s.label).toBe("Must do");
    expect(s.why).toContain("failing");
  });

  it("treats an urgent reported issue as Must do", () => {
    const s = systemStatus(system({ install_year: THIS_YEAR - 1 }), {
      category: "leak",
      description: "water in the attic",
      severity: "urgent",
    });
    expect(s.mustDo).toBe(true);
    expect(s.label).toBe("Must do");
    expect(s.why).toContain("water in the attic");
  });

  it("softens a purely age-estimated overdue system to an explicit estimate", () => {
    // Past its 22-year life, but never confirmed, no owner condition, no
    // issue: a guess, so it must not read as a confirmed problem.
    const s = systemStatus(system({ install_year: THIS_YEAR - 40 }));
    expect(s.stage).toBe("due");
    expect(s.estimatedDue).toBe(true);
    expect(s.mustDo).toBe(false);
    expect(s.label).toBe("Check soon (estimated)");
  });

  it("drops the estimate exemption once the owner confirms the system", () => {
    const s = systemStatus(
      system({
        install_year: THIS_YEAR - 40,
        confirmed_at: new Date().toISOString(),
      })
    );
    expect(s.estimatedDue).toBe(false);
    expect(s.label).toBe("Needs maintenance");
  });

  it("drops the estimate exemption when an issue was reported", () => {
    const s = systemStatus(system({ install_year: THIS_YEAR - 40 }), {
      category: "leak",
      severity: "low",
    });
    expect(s.estimatedDue).toBe(false);
    expect(s.label).toBe("Needs maintenance");
  });

  it("always explains the status", () => {
    expect(systemStatus(system()).why.length).toBeGreaterThan(0);
  });
});

describe("lifeLeftText", () => {
  it("asks for an install year when there is none", () => {
    expect(lifeLeftText(system())).toBe("Add an install year to estimate");
  });

  it("says replace now, and names failing separately", () => {
    expect(lifeLeftText(system({ install_year: THIS_YEAR - 40 }))).toBe(
      "Past due. Replace now."
    );
    expect(
      lifeLeftText(system({ install_year: THIS_YEAR - 40, condition_rating: 1 }))
    ).toBe("Failing. Replace now.");
  });

  it("pluralizes the remaining years", () => {
    expect(lifeLeftText(system({ install_year: THIS_YEAR - 2 }))).toMatch(
      /about \d+ more years$/
    );
  });
});
