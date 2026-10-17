import { BoardList } from "@/components/BoardList";
import { Header } from "@/components/Header";
import { listBoards } from "@/lib/items";
import { requireViewer } from "@/lib/session";

export default async function HomePage() {
  const viewer = await requireViewer();
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
