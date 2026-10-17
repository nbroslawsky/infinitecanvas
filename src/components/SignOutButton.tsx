"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { BusyOverlay } from "@/components/BusyOverlay";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  return (
    <>
      <button
        className="h-11 rounded-md px-3 text-sm hover:bg-stone-100 disabled:opacity-40"
        disabled={pending}
        onClick={async () => {
          if (pending) return;
          setPending(true);
          await authClient.signOut();
          window.location.href = "/sign-in";
        }}
      >
        Sign out
      </button>
      {pending ? <BusyOverlay title="Signing out" detail="Ending this session." /> : null}
    </>
  );
}
