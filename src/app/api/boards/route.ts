import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { boards } from "@/db/schema";
import { jsonError, requireUser } from "@/lib/http";
import { listBoards } from "@/lib/items";

export async function GET() {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const rows = await listBoards(viewer.session.user.id);
  return NextResponse.json({ boards: rows });
}

export async function POST(request: Request) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim() || "Untitled";
  const now = new Date();
  const id = crypto.randomUUID();
  const db = await getDb();
  await db.insert(boards).values({
    id,
    userId: viewer.session.user.id,
    name: name.slice(0, 120),
    cameraX: 0,
    cameraY: 0,
    zoom: 1,
    createdAt: now,
    updatedAt: now,
  });
  return NextResponse.json({
    board: { id, name: name.slice(0, 120), cameraX: 0, cameraY: 0, zoom: 1, updatedAt: now.toISOString() },
  });
}
