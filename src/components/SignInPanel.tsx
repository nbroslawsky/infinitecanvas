"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { BusyOverlay, type WaitCopy } from "@/components/BusyOverlay";

export function SignInPanel({ devLogin, google }: { devLogin: boolean; google: boolean }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState<WaitCopy | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {google ? (
        <button
          className="h-11 rounded-md bg-stone-900 px-4 text-sm text-white disabled:opacity-40"
          disabled={Boolean(pending)}
          onClick={async () => {
            setError("");
            setPending({ title: "Signing in", detail: "Taking you to Google. Stay on this page." });
            const result = await authClient.signIn.social({ provider: "google", callbackURL: "/" });
            if (result.error) {
              setPending(null);
              setError(result.error.message || "Could not start Google sign-in");
            }
          }}
        >
          Sign in with Google
        </button>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {devLogin ? (
        <button
          className="h-11 rounded-md border border-stone-300 px-4 text-sm disabled:opacity-40"
          data-testid="dev-login"
          disabled={Boolean(pending)}
          onClick={async () => {
            setError("");
            setPending({ title: "Signing in", detail: "Opening your boards." });
            const response = await fetch("/api/auth/dev-login", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: "{}",
            });
            if (response.ok) {
              window.location.href = "/";
              return;
            }
            setPending(null);
            setError("Could not sign in");
          }}
        >
          Continue
        </button>
      ) : null}
      {pending ? <BusyOverlay title={pending.title} detail={pending.detail} /> : null}
    </div>
  );
}
