import { connection } from "next/server";
import { z } from "zod";

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

const RejectClaimRequestSchema = z.strictObject({
  reason: z.string().trim().min(1),
});

function parseClaimId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

/** Rejects a claim that is awaiting finance review, with a required reason. */
export async function POST(request: Request, { params }: RouteContext) {
  await connection();

  try {
    const auth = await requireFinanceUser();
    if (!auth.ok) return auth.response;

    const claimId = parseClaimId((await params).id);
    if (claimId === null) {
      return apiError(400, "VALIDATION_ERROR", "Claim id must be a positive integer.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiError(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
    }

    const parsed = RejectClaimRequestSchema.safeParse(body);
    if (!parsed.success) {
      const { formErrors, fieldErrors } = z.flattenError(parsed.error);
      const fields: Record<string, string[]> = { ...fieldErrors };
      if (formErrors.length > 0) fields._root = formErrors;
      return apiError(400, "VALIDATION_ERROR", "A non-empty rejection reason is required.", fields);
    }

    const claim = await reviewClaimAtomically(claimId, auth.user.id, "reject", parsed.data.reason);
    return Response.json({ claim } satisfies FinanceClaimReviewResponse);
  } catch (cause) {
    if (cause instanceof ClaimNotFoundError) return apiError(404, "NOT_FOUND", cause.message);
    if (cause instanceof ClaimNotReviewableError) {
      return apiError(409, "CLAIM_NOT_REVIEWABLE", cause.message);
    }
    if (cause instanceof FinanceMembershipRequiredError) {
      return apiError(403, "FORBIDDEN", cause.message);
    }
    return serverError("POST /api/finance/claims/[id]/reject", cause);
  }
}
