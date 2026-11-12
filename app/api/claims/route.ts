import { connection } from "next/server";
import { z } from "zod";

import {
  CreateClaimRequestSchema,
  type ClaimsListResponse,
  type CreateClaimResponse,
} from "@/types/api";
import { getCurrentEmployee, getCurrentEmployeeId } from "@/lib/server/current-employee";
import { getPolicyRule, insertClaim, listClaims } from "@/lib/server/claims-repo";
import { checkExpenseDate, checkPolicy, todayInIndia } from "@/lib/server/claim-rules";
import { apiError, serverError } from "@/lib/server/http";

/** The signed-in employee's claims, newest first. */
export async function GET() {
  await connection();

  try {
    const claims = await listClaims(getCurrentEmployeeId());
    return Response.json({ claims } satisfies ClaimsListResponse);
  } catch (cause) {
    return serverError("GET /api/claims", cause);
  }
}

/** Validates a claim, applies the policy rules, and saves it. See docs/api-contract.md. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Request body must be valid JSON.");
  }

  const parsed = CreateClaimRequestSchema.safeParse(body);
  if (!parsed.success) {
    const { formErrors, fieldErrors } = z.flattenError(parsed.error);
    const fields: Record<string, string[]> = { ...fieldErrors };
    if (formErrors.length > 0) fields._root = formErrors;
    return apiError(400, "VALIDATION_ERROR", "Some claim details are missing or invalid.", fields);
  }
  const input = parsed.data;

  const dateRejection = checkExpenseDate(input.expense_date, todayInIndia());
  if (dateRejection) return apiError(422, dateRejection.code, dateRejection.message);

  try {
    const employee = await getCurrentEmployee();
    if (!employee) return apiError(404, "NOT_FOUND", "Employee not found.");

    const rule = await getPolicyRule(input.category, employee.grade);
    if (!rule) {
      return apiError(
        422,
        "UNKNOWN_CATEGORY",
        `No ${employee.grade} policy exists for category ${input.category}.`,
      );
    }

    const decision = checkPolicy(input.amount, input.has_receipt, employee.grade, rule);
    const claim = await insertClaim({
      employee_id: employee.id,
      category: input.category,
      amount: input.amount,
      expense_date: input.expense_date,
      description: input.description,
      has_receipt: input.has_receipt,
      status: decision.status,
      policy_check: decision.policy_check,
    });

    return Response.json({ claim } satisfies CreateClaimResponse, { status: 201 });
  } catch (cause) {
    return serverError("POST /api/claims", cause);
  }
}
