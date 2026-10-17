import { Mark } from "@/components/Mark";

export default function NotAllowedPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <Mark className="mb-4 h-12 w-12" />
      <h1 className="mb-2 text-3xl font-semibold">Not on the list</h1>
      <p className="text-stone-600" data-testid="not-allowed">
        Your Google account signed in, but an admin has not added this email yet. Ask them to add you, then try again.
      </p>
      <a href="/sign-in" className="mt-6 text-sm underline">
        Back to sign in
      </a>
      <p className="mt-8 text-sm text-stone-500">
        <a className="underline" href="/privacy">
          Privacy policy
        </a>
        <span> · </span>
        <a className="underline" href="/terms">
          Terms of service
        </a>
      </p>
    </main>
  );
}
