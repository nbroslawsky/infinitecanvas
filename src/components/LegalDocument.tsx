export function LegalDocument({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh max-w-2xl px-6 py-16">
      <a href="/sign-in" className="text-sm font-semibold">
        Infinite canvas
      </a>
      <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-stone-500">Last updated October 17, 2026</p>
      <div className="mt-8 flex flex-col gap-8 text-stone-800">{children}</div>
      <p className="mt-12 text-sm text-stone-500">
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

export function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
      {children}
    </section>
  );
}
