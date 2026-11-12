"use client";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();

  if (error) {
    throw error;
  }

  if (!data.session) {
    throw new Error("Sign in before making authenticated API requests.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${data.session.access_token}`);

  return fetch(input, { ...init, headers });
}
