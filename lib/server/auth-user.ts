import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseUserClient, getRequestAccessToken } from "@/lib/supabase/auth-server";
import { apiError } from "@/lib/server/http";

/** A user whose identity was confirmed by Supabase Auth for this request. */
export type VerifiedUser = {
  /** Supabase Auth user id (auth.users.id, a UUID). */
  id: string;
  email: string | null;
  /** Client that runs queries as this user, so row level security applies. */
  supabase: SupabaseClient;
};

/**
 * Verifies the signed-in user for the current request.
 *
 * Reads the access token from the `Authorization: Bearer` header or the
 * Supabase session cookie, then asks Supabase Auth to confirm it with
 * auth.getUser(). It never uses the service-role client and never trusts an
 * employee id or user id sent by the browser.
 *
 * Returns null when there is no token or the token is invalid or expired.
 */
export async function getVerifiedUser(): Promise<VerifiedUser | null> {
  const accessToken = await getRequestAccessToken();
  if (!accessToken) return null;

  const supabase = createSupabaseUserClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email ?? null, supabase };
}

/**
 * For API routes: returns the verified user, or a ready-made 401 response.
 *
 *   const auth = await requireVerifiedUser();
 *   if (!auth.ok) return auth.response;
 *   const userId = auth.user.id;
 */
export async function requireVerifiedUser(): Promise<
  { ok: true; user: VerifiedUser } | { ok: false; response: Response }
> {
  const user = await getVerifiedUser();
  if (!user) {
    return {
      ok: false,
      response: apiError(401, "UNAUTHORIZED", "Please sign in to continue."),
    };
  }
  return { ok: true, user };
}
