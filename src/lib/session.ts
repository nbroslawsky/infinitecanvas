import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isAllowedEmail, isAdminEmail } from "@/lib/access";
import { getAuth } from "@/lib/auth";

export async function requireViewer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  if (!viewer.allowed) redirect("/api/leave");
  return viewer;
}

export async function getViewer() {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const allowed = await isAllowedEmail(session.user.email);
  return {
    session,
    allowed,
    admin: isAdminEmail(session.user.email),
  };
}
