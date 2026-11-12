import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FinanceReviewClaim } from "@/types/api";
import { GET } from "@/app/api/finance/claims/route";

const mocks = vi.hoisted(() => ({
  requireFinanceUser: vi.fn(),
  listFinanceReviewClaims: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/finance-auth", () => ({
  requireFinanceUser: mocks.requireFinanceUser,
}));
vi.mock("@/lib/server/claims-repo", () => ({
  listFinanceReviewClaims: mocks.listFinanceReviewClaims,
}));

const claim: FinanceReviewClaim = {
  id: 21,
  employee_id: "E006",
  category: "meals",
  amount: 720,
  expense_date: "2026-11-10",
  description: "Client visit meal",
  has_receipt: true,
  status: "submitted",
  policy_check: "Within policy",
  created_at: "2026-11-10T10:00:00.000Z",
  employee: {
    id: "E006",
    name: "Fatima Sheikh",
    grade: "L2",
    department: "Finance",
    manager_name: "Gopal Iyer",
    base_city: "Mumbai",
  },
};

describe("GET /api/finance/claims", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireFinanceUser.mockResolvedValue({
      ok: true,
      user: { id: "reviewer-auth-id" },
    });
    mocks.listFinanceReviewClaims.mockResolvedValue([claim]);
  });

  it("returns 401 for unauthenticated users without listing claims", async () => {
    const response = Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    mocks.requireFinanceUser.mockResolvedValue({ ok: false, response });

    const result = await GET();

    expect(result).toBe(response);
    expect(mocks.listFinanceReviewClaims).not.toHaveBeenCalled();
  });

  it("returns 403 for non-finance users without listing claims", async () => {
    const response = Response.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
    mocks.requireFinanceUser.mockResolvedValue({ ok: false, response });

    const result = await GET();

    expect(result).toBe(response);
    expect(mocks.listFinanceReviewClaims).not.toHaveBeenCalled();
  });

  it("returns awaiting claims with employee details for finance users", async () => {
    const result = await GET();

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ claims: [claim] });
    expect(mocks.listFinanceReviewClaims).toHaveBeenCalledOnce();
  });
});
