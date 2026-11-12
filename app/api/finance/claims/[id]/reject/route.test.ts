import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/finance/claims/[id]/reject/route";

const mocks = vi.hoisted(() => ({
  requireFinanceUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/server", () => ({ connection: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/finance-auth", () => ({
  requireFinanceUser: mocks.requireFinanceUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}));

const claim = {
  id: 21,
  employee_id: "E006",
  category: "meals",
  amount: 720,
  expense_date: "2026-11-10",
  description: "Client visit meal",
  has_receipt: true,
  status: "rejected",
  policy_check: "Within policy",
  created_at: "2026-11-10T10:00:00.000Z",
};

const context = { params: Promise.resolve({ id: "21" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireFinanceUser.mockResolvedValue({
    ok: true,
    user: { id: "reviewer-auth-id" },
  });
  mocks.rpc.mockResolvedValue({ data: claim, error: null });
});

describe("POST /api/finance/claims/[id]/reject", () => {
  it("returns 401 without reviewing a claim when unauthenticated", async () => {
    const response = Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    mocks.requireFinanceUser.mockResolvedValue({ ok: false, response });

    const result = await POST(
      new Request("http://localhost", { method: "POST", body: JSON.stringify({ reason: "Duplicate" }) }),
      context,
    );

    expect(result).toBe(response);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   "])("requires a non-empty rejection reason (%s)", async (reason) => {
    const result = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify(reason === undefined ? {} : { reason }),
      }),
      context,
    );

    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects and sends the trimmed reason and verified reviewer to the audit RPC", async () => {
    const result = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ reason: "  Missing business purpose  " }),
      }),
      context,
    );

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ claim });
    expect(mocks.rpc).toHaveBeenCalledWith("review_claim", {
      p_claim_id: 21,
      p_reviewer_auth_user_id: "reviewer-auth-id",
      p_action: "reject",
      p_reason: "Missing business purpose",
    });
  });
});
