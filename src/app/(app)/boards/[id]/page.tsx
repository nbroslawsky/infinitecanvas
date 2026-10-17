import { notFound, redirect } from "next/navigation";
import { InfiniteCanvas } from "@/components/canvas/InfiniteCanvas";
import { Header } from "@/components/Header";
import { loadBoard } from "@/lib/items";
import { getViewer } from "@/lib/session";
import { blobUploadsEnabled } from "@/lib/storage";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.allowed) redirect("/sign-in");
  const { id } = await params;
  const payload = await loadBoard(viewer.session.user.id, id);
  if (!payload) notFound();
  return (
    <>
      <Header
        name={viewer.session.user.name}
        email={viewer.session.user.email}
        image={viewer.session.user.image}
        admin={viewer.admin}
      />
      <InfiniteCanvas initial={payload} uploadMode={blobUploadsEnabled() ? "direct" : "server"} />
    </>
  );
}
