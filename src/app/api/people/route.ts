import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { allowedEmails } from "@/db/schema";
import { adminEmails, isAdminEmail, peopleToolsConfigured } from "@/lib/access";
import { jsonError, requireUser } from "@/lib/http";

function normalize(email: string) {
  return email.trim().toLowerCase();
}

export async function GET() {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  if (!viewer.admin) return jsonError("Not found", 404);
  if (!peopleToolsConfigured()) return jsonError("Set ADMIN_EMAILS before managing people", 500);
  const db = await getDb();
  const rows = await db.select().from(allowedEmails);
  return NextResponse.json({
    admins: adminEmails(),
    emails: rows.map((row) => row.email).sort(),
  });
}

export async function POST(request: Request) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  if (!viewer.admin) return jsonError("Not found", 404);
  if (!peopleToolsConfigured()) return jsonError("Set ADMIN_EMAILS before managing people", 500);
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email ? normalize(body.email) : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError("Enter a valid email", 400);
  if (isAdminEmail(email)) return NextResponse.json({ ok: true, email });
  const db = await getDb();
  await db
    .insert(allowedEmails)
    .values({ email, addedBy: viewer.session.user.email, createdAt: new Date() })
    .onConflictDoNothing();
  return NextResponse.json({ ok: true, email });
}

export async function DELETE(request: Request) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  if (!viewer.admin) return jsonError("Not found", 404);
  if (!peopleToolsConfigured()) return jsonError("Set ADMIN_EMAILS before managing people", 500);
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email ? normalize(body.email) : "";
  if (!email) return jsonError("Missing email", 400);
  if (isAdminEmail(email)) return jsonError("Admins are managed with ADMIN_EMAILS", 400);
  const db = await getDb();
  await db.delete(allowedEmails).where(eq(allowedEmails.email, email));
  return NextResponse.json({ ok: true });
}
