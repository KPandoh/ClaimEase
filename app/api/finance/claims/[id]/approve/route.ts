import { connection } from "next/server";

import { requireFinanceUser } from "@/lib/server/finance-auth";
import {
  ClaimNotFoundError,
  ClaimNotReviewableError,
  FinanceMembershipRequiredError,
  reviewClaimAtomically,
} from "@/lib/server/claims-repo";
import { apiError, serverError } from "@/lib/server/http";
import type { FinanceClaimReviewResponse } from "@/types/api";

type RouteContext = { params: Promise<{ id: string }> };

function parseClaimId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/** Approves a claim that is awaiting finance review. */
export async function POST(_request: Request, { params }: RouteContext) {
  await connection();

  try {
    const auth = await requireFinanceUser();
    if (!auth.ok) return auth.response;

    const claimId = parseClaimId((await params).id);
    if (claimId === null) {
      return apiError(400, "VALIDATION_ERROR", "Claim id must be a positive integer.");
    }

    const claim = await reviewClaimAtomically(claimId, auth.user.id, "approve", null);
    return Response.json({ claim } satisfies FinanceClaimReviewResponse);
  } catch (cause) {
    if (cause instanceof ClaimNotFoundError) return apiError(404, "NOT_FOUND", cause.message);
    if (cause instanceof ClaimNotReviewableError) {
      return apiError(409, "CLAIM_NOT_REVIEWABLE", cause.message);
    }
    if (cause instanceof FinanceMembershipRequiredError) {
      return apiError(403, "FORBIDDEN", cause.message);
    }
    return serverError("POST /api/finance/claims/[id]/approve", cause);
  }
}
