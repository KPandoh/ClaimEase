import { describe, expect, it } from "vitest";

import { WITHIN_POLICY, type PolicyRule } from "@/types/api";
import {
  checkAmount,
  checkExpenseDate,
  checkPolicy,
  daysBetween,
  todayInIndia,
} from "@/lib/server/claim-rules";

const today = "2026-11-12";
const mealsRule: PolicyRule = {
  category: "meals",
  grade: "L2",
  max_amount: 800,
  receipt_required_above: 300,
  notes: "Per day while travelling",
};

describe("checkExpenseDate", () => {
  it("rejects future dates", () => {
    expect(checkExpenseDate("2026-11-13", today)).toMatchObject({
      ok: false,
      code: "FUTURE_DATE",
    });
  });

  it("allows today's date", () => {
    expect(checkExpenseDate(today, today)).toBeNull();
  });

  it("allows an expense exactly 60 days old", () => {
    expect(daysBetween("2026-09-13", today)).toBe(60);
    expect(checkExpenseDate("2026-09-13", today)).toBeNull();
  });

  it("rejects an expense 61 days old", () => {
    expect(checkExpenseDate("2026-09-12", today)).toMatchObject({
      ok: false,
      code: "EXPENSE_TOO_OLD",
    });
  });
});

describe("checkAmount", () => {
  it("allows an amount equal to the policy maximum", () => {
    expect(checkAmount(800, "L2", mealsRule)).toEqual({
      status: "submitted",
      policy_check: WITHIN_POLICY,
    });
  });

  it("flags an amount above the policy maximum with a clear reason", () => {
    expect(checkAmount(800.01, "L2", mealsRule)).toEqual({
      status: "flagged",
      policy_check: "Above L2 limit of 800 for meals",
    });
  });
});

describe("checkPolicy receipt requirements", () => {
  it("does not require a receipt when the amount equals the threshold", () => {
    expect(checkPolicy(300, false, "L2", mealsRule)).toEqual({
      status: "submitted",
      policy_check: WITHIN_POLICY,
    });
  });

  it("flags a missing receipt when the amount is above the threshold", () => {
    expect(checkPolicy(300.01, false, "L2", mealsRule)).toEqual({
      status: "flagged",
      policy_check: "Missing receipt: meals claims above ₹300 require a receipt",
    });
  });

  it("does not flag a missing receipt when a receipt is present", () => {
    expect(checkPolicy(300.01, true, "L2", mealsRule)).toEqual({
      status: "submitted",
      policy_check: WITHIN_POLICY,
    });
  });

  it("preserves amount and receipt reasons when both rules are violated", () => {
    expect(checkPolicy(801, false, "L2", mealsRule)).toEqual({
      status: "flagged",
      policy_check:
        "Above L2 limit of 800 for meals; Missing receipt: meals claims above ₹300 require a receipt",
    });
  });

  it("flags any positive amount without a receipt when the threshold is zero", () => {
    const noThresholdRule = { ...mealsRule, receipt_required_above: 0 };

    expect(checkPolicy(1, false, "L2", noThresholdRule)).toMatchObject({
      status: "flagged",
      policy_check: "Missing receipt: meals claims above ₹0 require a receipt",
    });
  });
});

describe("todayInIndia", () => {
  it("uses the supplied instant and India calendar date", () => {
    expect(todayInIndia(new Date("2026-11-11T18:29:59.000Z"))).toBe("2026-11-11");
    expect(todayInIndia(new Date("2026-11-11T18:30:00.000Z"))).toBe("2026-11-12");
  });
});
