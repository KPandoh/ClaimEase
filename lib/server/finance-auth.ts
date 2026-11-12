import "server-only";

import { requireVerifiedUser, type VerifiedUser } from "@/lib/server/auth-user";
import { apiError } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";

type FinanceAuthResult =
  | { ok: true; user: VerifiedUser }
  | { ok: false; response: Response };

/**
 * Requires an authenticated user with an active finance_users membership.
 * The service-role lookup happens only after Supabase Auth verifies identity.
 */
export async function requireFinanceUser(): Promise<FinanceAuthResult> {
  const auth = await requireVerifiedUser();
  if (!auth.ok) return auth;

  const { data, error } = await getSupabaseAdmin()
    .from("finance_users")
    .select("auth_user_id, is_active")
    .eq("auth_user_id", auth.user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`finance_users query failed: ${error.message}`);
  if (!data || data.auth_user_id !== auth.user.id || data.is_active !== true) {
    return {
      ok: false,
      response: apiError(403, "FORBIDDEN", "Active finance membership is required."),
    };
  }

  return auth;
}
