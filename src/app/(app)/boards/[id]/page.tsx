import { notFound } from "next/navigation";
import { InfiniteCanvas } from "@/components/canvas/InfiniteCanvas";
import { Header } from "@/components/Header";
import { loadBoard } from "@/lib/items";
import { requireViewer } from "@/lib/session";
import { blobUploadsEnabled } from "@/lib/storage";

export default async function BoardPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, viewer] = await Promise.all([params, requireViewer()]);
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
