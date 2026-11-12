import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession: mockGetSession },
  }),
}));

import { authenticatedFetch } from "@/lib/api-client";

describe("authenticatedFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGetSession.mockReset();
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the Supabase access token as a Bearer token", async () => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "test-access-token" } },
      error: null,
    });

    await authenticatedFetch("/api/finance/claims", {
      headers: { "X-Test": "present" },
    });

    const requestHeaders = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(requestHeaders.get("authorization")).toBe("Bearer test-access-token");
    expect(requestHeaders.get("x-test")).toBe("present");
  });

  it("does not make the API request when there is no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(authenticatedFetch("/api/finance/claims")).rejects.toThrow(
      "Sign in before making authenticated API requests.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces Supabase session lookup errors", async () => {
    const authError = new Error("Session lookup failed");
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: authError,
    });

    await expect(authenticatedFetch("/api/finance/claims")).rejects.toBe(authError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
