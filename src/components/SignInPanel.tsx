"use client";

import { authClient } from "@/lib/auth-client";

export function SignInPanel({ devLogin, google }: { devLogin: boolean; google: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {google ? (
        <button
          className="h-11 rounded-md bg-stone-900 px-4 text-sm text-white"
          onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: "/" })}
        >
          Sign in with Google
        </button>
      ) : null}
      {devLogin ? (
        <button
          className="h-11 rounded-md border border-stone-300 px-4 text-sm"
          data-testid="dev-login"
          onClick={async () => {
            const response = await fetch("/api/auth/dev-login", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}",
            });
            if (response.ok) window.location.href = "/";
          }}
        >
          Continue
        </button>
      ) : null}
    </div>
  );
}
