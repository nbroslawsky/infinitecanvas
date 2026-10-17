import { redirect } from "next/navigation";
import { getViewer } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (!viewer.allowed) redirect("/api/leave");
  return children;
}
