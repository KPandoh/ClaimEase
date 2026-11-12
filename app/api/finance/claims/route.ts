import { connection } from "next/server";

import { requireFinanceUser } from "@/lib/server/finance-auth";
import { listFinanceReviewClaims } from "@/lib/server/claims-repo";
import { serverError } from "@/lib/server/http";
import type { FinanceClaimsListResponse } from "@/types/api";

/** Claims awaiting review, available only to active finance users. */
export async function GET() {
  await connection();

  try {
    const auth = await requireFinanceUser();
    if (!auth.ok) return auth.response;

    const claims = await listFinanceReviewClaims();
    return Response.json({ claims } satisfies FinanceClaimsListResponse);
  } catch (cause) {
    return serverError("GET /api/finance/claims", cause);
  }
}
