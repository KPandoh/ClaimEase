import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/claims/route";
import type { PolicyRule } from "@/types/api";

const mocks = vi.hoisted(() => ({
  getCurrentEmployee: vi.fn(),
  getPolicyRule: vi.fn(),
  insertClaim: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("@/lib/server/current-employee", () => ({
  getCurrentEmployee: mocks.getCurrentEmployee,
  getCurrentEmployeeId: vi.fn(),
}));
vi.mock("@/lib/server/claims-repo", () => ({
  getPolicyRule: mocks.getPolicyRule,
  insertClaim: mocks.insertClaim,
  listClaims: vi.fn(),
}));

const employee = {
  id: "E001",
  name: "Meera Nair",
  email: "meera.nair@example.test",
  grade: "L2" as const,
  department: "Consulting",
  manager_name: "Ravi Shankar",
  base_city: "Chennai",
};

const mealsRule: PolicyRule = {
  category: "meals",
  grade: "L2",
  max_amount: 800,
  receipt_required_above: 300,
  notes: "Per day while travelling",
};

function request(body: string): Request {
  return new Request("http://localhost/api/claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/claims validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentEmployee.mockResolvedValue(employee);
    mocks.getPolicyRule.mockResolvedValue(mealsRule);
    mocks.insertClaim.mockResolvedValue({ id: 1 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-12T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects malformed JSON without loading employee or writing a claim", async () => {
    const response = await POST(request("{"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(mocks.getCurrentEmployee).not.toHaveBeenCalled();
    expect(mocks.insertClaim).not.toHaveBeenCalled();
  });

  it.each([
    ["zero amount", { category: "meals", amount: 0 }],
    ["unsupported category", { category: "unknown", amount: 100 }],
    ["invalid calendar date", { category: "meals", amount: 100, expense_date: "2026-02-30" }],
  ])("rejects invalid input (%s)", async (_case, override) => {
    const body = Object.assign(
      {
        category: "meals",
        amount: 100,
        expense_date: "2026-11-12",
        description: "Lunch while travelling",
        has_receipt: true,
      },
      override,
    );

    const response = await POST(request(JSON.stringify(body)));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(mocks.getCurrentEmployee).not.toHaveBeenCalled();
    expect(mocks.insertClaim).not.toHaveBeenCalled();
  });

  it.each([
    ["future date", "2026-11-13", "FUTURE_DATE"],
    ["date 61 days old", "2026-09-12", "EXPENSE_TOO_OLD"],
  ])("rejects %s without writing a claim", async (_case, expenseDate, code) => {
    const response = await POST(
      request(
        JSON.stringify({
          category: "meals",
          amount: 100,
          expense_date: expenseDate,
          description: "Lunch while travelling",
        }),
      ),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code } });
    expect(mocks.getCurrentEmployee).not.toHaveBeenCalled();
    expect(mocks.insertClaim).not.toHaveBeenCalled();
  });

  it("allows a date exactly 60 days old", async () => {
    const response = await POST(
      request(
        JSON.stringify({
          category: "meals",
          amount: 800,
          expense_date: "2026-09-13",
          description: "Lunch while travelling",
          has_receipt: true,
        }),
      ),
    );

    expect(response.status).toBe(201);
    expect(mocks.insertClaim).toHaveBeenCalledWith(
      expect.objectContaining({ expense_date: "2026-09-13", status: "submitted" }),
    );
  });

  it("saves a flagged claim with every applicable reason", async () => {
    const response = await POST(
      request(
        JSON.stringify({
          category: "meals",
          amount: 801,
          expense_date: "2026-11-12",
          description: "Lunch while travelling",
          has_receipt: false,
        }),
      ),
    );

    expect(response.status).toBe(201);
    expect(mocks.insertClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "flagged",
        policy_check:
          "Above L2 limit of 800 for meals; Missing receipt: meals claims above ₹300 require a receipt",
      }),
    );
  });

  it("rejects a missing category/grade policy rule", async () => {
    mocks.getPolicyRule.mockResolvedValue(null);

    const response = await POST(
      request(
        JSON.stringify({
          category: "meals",
          amount: 100,
          expense_date: "2026-11-12",
          description: "Lunch while travelling",
        }),
      ),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "UNKNOWN_CATEGORY" } });
    expect(mocks.insertClaim).not.toHaveBeenCalled();
  });
});
