import {
  WITHIN_POLICY,
  type ApiErrorCode,
  type ClaimStatus,
  type Grade,
  type PolicyRule,
} from "@/types/api";

/**
 * PS5 policy rules, applied on the server only.
 *   1. Expense date cannot be in the future.
 *   2. Expenses older than 60 days cannot be claimed.
 *   3. Amount above the grade's max_amount for the category -> saved as 'flagged' with the reason.
 *   4. Missing receipt above the rule's receipt_required_above -> saved as 'flagged' with the reason.
 *
 * Pure functions with no I/O, so they can be tested directly and moved
 * into lib/policy/ if Member 4 takes them over.
 */

export const MAX_EXPENSE_AGE_DAYS = 60;
const POLICY_TIME_ZONE = "Asia/Kolkata";

/** Today's date as "YYYY-MM-DD" in India. */
export function todayInIndia(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: POLICY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUtcDay(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). Negative if `from` is later. */
export function daysBetween(from: string, to: string): number {
  return toUtcDay(to) - toUtcDay(from);
}

export type RuleRejection = { ok: false; code: ApiErrorCode; message: string };

/** Rules 1 and 2. Returns a rejection, or null if the date is allowed. */
export function checkExpenseDate(expenseDate: string, today: string): RuleRejection | null {
  const age = daysBetween(expenseDate, today);
  if (age < 0) {
    return { ok: false, code: "FUTURE_DATE", message: "Expense date cannot be in the future." };
  }
  if (age > MAX_EXPENSE_AGE_DAYS) {
    return {
      ok: false,
      code: "EXPENSE_TOO_OLD",
      message: `Expenses older than ${MAX_EXPENSE_AGE_DAYS} days cannot be claimed.`,
    };
  }
  return null;
}

export type AmountDecision = { status: ClaimStatus; policy_check: string };

/** Rule 3. Matches the wording used in the seed data. */
export function checkAmount(amount: number, grade: Grade, rule: PolicyRule): AmountDecision {
  if (amount > rule.max_amount) {
    return {
      status: "flagged",
      policy_check: `Above ${grade} limit of ${rule.max_amount} for ${rule.category}`,
    };
  }
  return { status: "submitted", policy_check: WITHIN_POLICY };
}

/** Applies amount and receipt rules together, retaining every flag reason. */
export function checkPolicy(
  amount: number,
  hasReceipt: boolean,
  grade: Grade,
  rule: PolicyRule,
): AmountDecision {
  const amountDecision = checkAmount(amount, grade, rule);
  const reasons: string[] = [];

  if (amountDecision.status === "flagged") {
    reasons.push(amountDecision.policy_check);
  }
  if (!hasReceipt && amount > rule.receipt_required_above) {
    reasons.push(
      `Missing receipt: ${rule.category} claims above ₹${rule.receipt_required_above} require a receipt`,
    );
  }

  return reasons.length > 0
    ? { status: "flagged", policy_check: reasons.join("; ") }
    : amountDecision;
}
