import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireFinanceUser } from "@/lib/server/finance-auth";

const mocks = vi.hoisted(() => ({
  requireVerifiedUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/auth-user", () => ({
  requireVerifiedUser: mocks.requireVerifiedUser,
}));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseAdmin: mocks.getSupabaseAdmin,
}));

const verifiedUser = {
  id: "c2d4d198-3a8b-42ca-bf3d-b5464a72d149",
  email: "reviewer@example.test",
  supabase: {},
};

const financeQuery = {
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
};

const adminClient = {
  from: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  financeQuery.select.mockReturnValue(financeQuery);
  financeQuery.eq.mockReturnValue(financeQuery);
  financeQuery.maybeSingle.mockResolvedValue({
    data: { auth_user_id: verifiedUser.id, is_active: true },
    error: null,
  });
  adminClient.from.mockReturnValue(financeQuery);
  mocks.requireVerifiedUser.mockResolvedValue({ ok: true, user: verifiedUser });
  mocks.getSupabaseAdmin.mockReturnValue(adminClient);
});

describe("requireFinanceUser", () => {
  it("returns the existing 401 response without querying membership when unauthenticated", async () => {
    const response = Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
    mocks.requireVerifiedUser.mockResolvedValue({ ok: false, response });

    const result = await requireFinanceUser();

    expect(result).toEqual({ ok: false, response });
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("denies users without a finance membership", async () => {
    financeQuery.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await requireFinanceUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect(await result.response.json()).toEqual({
        error: { code: "FORBIDDEN", message: "Active finance membership is required." },
      });
    }
  });

  it("denies inactive finance users", async () => {
    financeQuery.maybeSingle.mockResolvedValue({
      data: { auth_user_id: verifiedUser.id, is_active: false },
      error: null,
    });

    const result = await requireFinanceUser();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("allows an active finance user using the verified Auth UUID", async () => {
    const result = await requireFinanceUser();

    expect(result).toEqual({ ok: true, user: verifiedUser });
    expect(adminClient.from).toHaveBeenCalledWith("finance_users");
    expect(financeQuery.select).toHaveBeenCalledWith("auth_user_id, is_active");
    expect(financeQuery.eq).toHaveBeenNthCalledWith(1, "auth_user_id", verifiedUser.id);
    expect(financeQuery.eq).toHaveBeenNthCalledWith(2, "is_active", true);
  });
});
