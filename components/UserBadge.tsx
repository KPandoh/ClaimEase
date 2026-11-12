"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button, { buttonClasses } from "@/components/ui/Button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function UserBadge() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void Promise.resolve()
      .then(() => getSupabaseBrowserClient())
      .then((client) => {
        if (!active) {
          return;
        }

        const { data } = client.auth.onAuthStateChange((_event, session) => {
          setEmail(session?.user.email ?? null);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      })
      .catch((error: unknown) => {
        if (active) {
          setErrorMessage(
            error instanceof Error ? error.message : "Authentication is unavailable.",
          );
        }
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  async function signOut() {
    setIsSigningOut(true);
    setErrorMessage(null);

    try {
      const { error } = await getSupabaseBrowserClient().auth.signOut();
      if (error) {
        throw error;
      }
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign out.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {email ? (
        <div className="flex items-center gap-2">
          <span className="hidden max-w-40 truncate text-sm sm:block" title={email}>
            {email}
          </span>
          <Button
            loading={isSigningOut}
            onClick={signOut}
            size="sm"
            variant="secondary"
          >
            Sign out
          </Button>
        </div>
      ) : (
        <Link className={buttonClasses({ size: "sm", variant: "secondary" })} href="/login">
          Sign in
        </Link>
      )}
      {errorMessage && (
        <span className="max-w-56 text-right text-xs text-red-700" role="status">
          {errorMessage}
        </span>
      )}
    </div>
  );
}
