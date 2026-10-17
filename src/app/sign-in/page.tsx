import { SignInPanel } from "@/components/SignInPanel";
import { devLoginEnabled, peopleToolsConfigured } from "@/lib/access";

export default function SignInPage() {
  const configured = peopleToolsConfigured();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-3xl font-semibold">Infinite canvas</h1>
      <p className="mb-8 text-stone-600">A private place to arrange images, labels, and frames.</p>
      {configured ? (
        <SignInPanel devLogin={devLoginEnabled()} google={Boolean(process.env.GOOGLE_CLIENT_ID)} />
      ) : (
        <p className="text-sm text-red-700">Set ADMIN_EMAILS before anyone can sign in.</p>
      )}
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
