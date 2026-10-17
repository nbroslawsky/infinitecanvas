"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  return (
    <button
      className="h-11 rounded-md px-3 text-sm hover:bg-stone-100"
      onClick={async () => {
        await authClient.signOut();
        window.location.href = "/sign-in";
      }}
    >
      Sign out
    </button>
  );
}
