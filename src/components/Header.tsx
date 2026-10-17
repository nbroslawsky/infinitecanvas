import Link from "next/link";
import { Mark } from "@/components/Mark";
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
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4">
      <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
        <Mark className="h-7 w-7" />
        Infinite canvas
      </Link>
      <div className="flex items-center gap-2">
        {admin ? (
          <Link href="/people" className="h-11 rounded-lg px-3 text-sm leading-[2.75rem] text-zinc-700 hover:bg-zinc-100">
            People
          </Link>
        ) : null}
        {image ? <img src={image} alt="" className="h-8 w-8 rounded-full" /> : null}
        <span className="max-w-40 truncate text-sm text-zinc-500">{name || email}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
