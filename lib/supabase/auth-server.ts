import "server-only";

import { cookies, headers } from "next/headers";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Request-scoped Supabase client for the signed-in user.
 *
 * This is separate from getSupabaseAdmin() in ./server.ts. It uses the public
 * (anon / publishable) key plus the user's own access token, so queries made
 * with it run as that user and row level security applies.
 *
 * The access token comes from, in order:
 *   1. an `Authorization: Bearer <access_token>` header, or
 *   2. the Supabase session cookie `sb-<project-ref>-auth-token`, in the
 *      format written by the Supabase browser client (@supabase/ssr), which
 *      may be split into chunks `.0`, `.1`, ... and may carry a `base64-` prefix.
 *
 * Reading a token here does NOT prove who the user is. Always verify it with
 * getVerifiedUser() in lib/server/auth-user.ts before trusting it.
 */

function requireEnv(name: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY"): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

/** Name of the session cookie for this Supabase project. */
function sessionCookieName(): string {
  const projectRef = new URL(requireEnv("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

function decodeCookieValue(raw: string): string {
  if (raw.startsWith("base64-")) {
    return Buffer.from(raw.slice("base64-".length), "base64url").toString("utf8");
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Pulls the access token out of a stored session, or null if the shape is unknown. */
function accessTokenFromSession(json: string): string | null {
  try {
    const session: unknown = JSON.parse(json);
    if (Array.isArray(session) && typeof session[0] === "string") return session[0];
    if (session && typeof session === "object" && "access_token" in session) {
      const token = (session as { access_token: unknown }).access_token;
      return typeof token === "string" ? token : null;
    }
  } catch {
    // Not JSON: fall through.
  }
  return null;
}

async function accessTokenFromCookies(): Promise<string | null> {
  const store = await cookies();
  const name = sessionCookieName();

  let raw = store.get(name)?.value;
  if (!raw) {
    const chunks: string[] = [];
    for (let i = 0; ; i++) {
      const chunk = store.get(`${name}.${i}`)?.value;
      if (chunk === undefined) break;
      chunks.push(chunk);
    }
    raw = chunks.length ? chunks.join("") : undefined;
  }
  return raw ? accessTokenFromSession(decodeCookieValue(raw)) : null;
}

async function accessTokenFromHeader(): Promise<string | null> {
  const value = (await headers()).get("authorization");
  const match = value?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Returns the access token sent with the current request (bearer header first,
 * then session cookie), or null if there is none. The token is unverified.
 */
export async function getRequestAccessToken(): Promise<string | null> {
  return (await accessTokenFromHeader()) ?? (await accessTokenFromCookies());
}

/**
 * Creates a Supabase client that acts as the user who owns `accessToken`.
 * Create one per request; never cache it across requests.
 */
export function createSupabaseUserClient(accessToken: string): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
