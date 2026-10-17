import { redirect } from "next/navigation";
import { BoardList } from "@/components/BoardList";
import { Header } from "@/components/Header";
import { listBoards } from "@/lib/items";
import { getViewer } from "@/lib/session";

export default async function HomePage() {
  const viewer = await getViewer();
  if (!viewer?.allowed) redirect("/sign-in");
  const boards = await listBoards(viewer.session.user.id);
  return (
    <>
      <Header
        name={viewer.session.user.name}
        email={viewer.session.user.email}
        image={viewer.session.user.image}
        admin={viewer.admin}
      />
      <BoardList initial={boards} />
    </>
  );
}
