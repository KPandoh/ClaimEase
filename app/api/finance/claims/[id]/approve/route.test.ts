import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/finance/claims/[id]/approve/route";

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
  status: "approved",
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

describe("POST /api/finance/claims/[id]/approve", () => {
  it("returns the existing 401 response without reviewing a claim", async () => {
    const response = Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    mocks.requireFinanceUser.mockResolvedValue({ ok: false, response });

    const result = await POST(new Request("http://localhost"), context);

    expect(result).toBe(response);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an invalid status transition", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "Claim is not awaiting finance review" },
    });

    const result = await POST(new Request("http://localhost"), context);

    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({
      error: { code: "CLAIM_NOT_REVIEWABLE" },
    });
  });

  it("approves and sends the verified reviewer to the atomic audit RPC", async () => {
    const result = await POST(new Request("http://localhost"), context);

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ claim });
    expect(mocks.rpc).toHaveBeenCalledWith("review_claim", {
      p_claim_id: 21,
      p_reviewer_auth_user_id: "reviewer-auth-id",
      p_action: "approve",
      p_reason: null,
    });
  });
});
