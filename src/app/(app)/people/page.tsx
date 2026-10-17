import { notFound, redirect } from "next/navigation";
import { PeopleManager } from "@/components/PeopleManager";
import { Header } from "@/components/Header";
import { getDb } from "@/db";
import { allowedEmails } from "@/db/schema";
import { adminEmails, peopleToolsConfigured } from "@/lib/access";
import { getViewer } from "@/lib/session";

export default async function PeoplePage() {
  const viewer = await getViewer();
  if (!viewer?.allowed) redirect("/sign-in");
  if (!viewer.admin) notFound();
  if (!peopleToolsConfigured()) {
    return <main className="mx-auto max-w-xl px-4 py-8 text-red-700">Set ADMIN_EMAILS before managing people.</main>;
  }
  const db = await getDb();
  const rows = await db.select().from(allowedEmails);
  return (
    <>
      <Header
        name={viewer.session.user.name}
        email={viewer.session.user.email}
        image={viewer.session.user.image}
        admin={viewer.admin}
      />
      <PeopleManager admins={adminEmails()} initial={rows.map((row) => row.email).sort()} />
    </>
  );
}
