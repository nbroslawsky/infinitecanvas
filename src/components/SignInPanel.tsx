"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInPanel({ devLogin, google }: { devLogin: boolean; google: boolean }) {
  const [error, setError] = useState("");

  return (
    <div className="flex flex-col gap-3">
      {google ? (
        <button
          className="h-11 rounded-md bg-stone-900 px-4 text-sm text-white"
          onClick={async () => {
            setError("");
            const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
            if (result.error) setError(result.error.message || "Could not start Google sign-in");
          }}
        >
          Sign in with Google
        </button>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
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
