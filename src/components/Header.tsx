import { SignOutButton } from "@/components/SignOutButton";

export function Header({
  name,
  email,
  image,
  admin,
}: {
  name: string;
  email: string;
  image?: string | null;
  admin: boolean;
}) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-stone-200 bg-white px-4">
      <a href="/" className="text-sm font-semibold">
        Infinite canvas
      </a>
      <div className="flex items-center gap-2">
        {admin ? (
          <a href="/people" className="h-11 rounded-md px-3 text-sm leading-[2.75rem] hover:bg-stone-100">
            People
          </a>
        ) : null}
        {image ? <img src={image} alt="" className="h-8 w-8 rounded-full" /> : null}
        <span className="max-w-40 truncate text-sm text-stone-600">{name || email}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
