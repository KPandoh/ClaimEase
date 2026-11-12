import "server-only";

import {
  ClaimSchema,
  EmployeeSchema,
  FinanceReviewClaimSchema,
  FinanceReviewEmployeeSchema,
  PolicyRuleSchema,
  type Claim,
  type FinanceReviewClaim,
  type Grade,
  type PolicyRule,
} from "@/types/api";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const CLAIM_COLUMNS =
  "id, employee_id, category, amount, expense_date, description, has_receipt, status, policy_check, created_at";
const RULE_COLUMNS = "category, grade, max_amount, receipt_required_above, notes";

/** numeric(10,2) may arrive as a string depending on the driver; always return a number. */
function toClaim(row: Record<string, unknown>): Claim {
  return ClaimSchema.parse({ ...row, amount: Number(row.amount) });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function listPolicyRules(grade: Grade): Promise<PolicyRule[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("policy_rules")
    .select(RULE_COLUMNS)
    .eq("grade", grade)
    .order("category");

  if (error) throw new Error(`policy_rules query failed: ${error.message}`);
  return (data ?? []).map((row) => PolicyRuleSchema.parse(row));
}

export async function getPolicyRule(category: string, grade: Grade): Promise<PolicyRule | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("policy_rules")
    .select(RULE_COLUMNS)
    .eq("category", category)
    .eq("grade", grade)
    .maybeSingle();

  if (error) throw new Error(`policy_rules query failed: ${error.message}`);
  return data ? PolicyRuleSchema.parse(data) : null;
}

export async function listClaims(employeeId: string): Promise<Claim[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("claims")
    .select(CLAIM_COLUMNS)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new Error(`claims query failed: ${error.message}`);
  return (data ?? []).map(toClaim);
}

/** Claims awaiting finance review, with the employee context used by reviewers. */
export async function listFinanceReviewClaims(): Promise<FinanceReviewClaim[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("claims")
    .select(CLAIM_COLUMNS)
    .in("status", ["submitted", "flagged"])
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) throw new Error(`finance claims query failed: ${error.message}`);

  const claims = (data ?? []).map(toClaim);
  if (claims.length === 0) return [];

  const employeeIds = [...new Set(claims.map((claim) => claim.employee_id))];
  const { data: employeeRows, error: employeeError } = await supabase
    .from("employees")
    .select("id, name, email, grade, department, manager_name, base_city")
    .in("id", employeeIds);

  if (employeeError) throw new Error(`finance employees query failed: ${employeeError.message}`);

  const employees = new Map(
    (employeeRows ?? []).map((row) => {
      const employee = EmployeeSchema.parse(row);
      return [employee.id, FinanceReviewEmployeeSchema.parse(employee)] as const;
    }),
  );

  return claims.map((claim) => {
    const employee = employees.get(claim.employee_id);
    if (!employee) throw new Error(`Employee ${claim.employee_id} missing for finance claim.`);
    return FinanceReviewClaimSchema.parse({ ...claim, employee });
  });
}

export type NewClaimRow = Omit<Claim, "id" | "created_at">;

export type ClaimReviewAction = "approve" | "reject";

export class ClaimNotFoundError extends Error {
  constructor() {
    super("Claim not found.");
    this.name = "ClaimNotFoundError";
  }
}

export class ClaimNotReviewableError extends Error {
  constructor() {
    super("Claim is not awaiting finance review.");
    this.name = "ClaimNotReviewableError";
  }
}

export class FinanceMembershipRequiredError extends Error {
  constructor() {
    super("Active finance membership is required.");
    this.name = "FinanceMembershipRequiredError";
  }
}

/** Performs the status transition and audit insert in one database transaction. */
export async function reviewClaimAtomically(
  claimId: number,
  reviewerAuthUserId: string,
  action: ClaimReviewAction,
  reason: string | null,
): Promise<Claim> {
  const { data, error } = await getSupabaseAdmin().rpc("review_claim", {
    p_claim_id: claimId,
    p_reviewer_auth_user_id: reviewerAuthUserId,
    p_action: action,
    p_reason: reason,
  });

  if (error) {
    if (error.code === "P0002") throw new ClaimNotFoundError();
    if (error.code === "P0001") throw new ClaimNotReviewableError();
    if (error.code === "42501") throw new FinanceMembershipRequiredError();
    throw new Error(`claim review failed: ${error.message}`);
  }

  const result: unknown = data;
  if (!isRecord(result)) {
    throw new Error("claim review RPC returned an invalid claim.");
  }
  return toClaim(result);
}

export async function insertClaim(row: NewClaimRow): Promise<Claim> {
  const { data, error } = await getSupabaseAdmin()
    .from("claims")
    .insert(row)
    .select(CLAIM_COLUMNS)
    .single();

  if (error) throw new Error(`claims insert failed: ${error.message}`);
  return toClaim(data);
}
