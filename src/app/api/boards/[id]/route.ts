import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { boards } from "@/db/schema";
import { jsonError, requireUser } from "@/lib/http";
import { getOwnedBoard, loadBoard } from "@/lib/items";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const { id } = await params;
  const payload = await loadBoard(viewer.session.user.id, id);
  if (!payload) return jsonError("Not found", 404);
  return NextResponse.json(payload);
}

export async function PATCH(request: Request, { params }: Params) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const { id } = await params;
  const board = await getOwnedBoard(viewer.session.user.id, id);
  if (!board) return jsonError("Not found", 404);
  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    cameraX?: number;
    cameraY?: number;
    zoom?: number;
  };
  const patch: Partial<typeof boards.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim().slice(0, 120);
  if (typeof body.cameraX === "number" && Number.isFinite(body.cameraX)) patch.cameraX = body.cameraX;
  if (typeof body.cameraY === "number" && Number.isFinite(body.cameraY)) patch.cameraY = body.cameraY;
  if (typeof body.zoom === "number" && Number.isFinite(body.zoom)) patch.zoom = Math.min(8, Math.max(0.05, body.zoom));
  const db = await getDb();
  await db.update(boards).set(patch).where(eq(boards.id, id));
  const payload = await loadBoard(viewer.session.user.id, id);
  return NextResponse.json(payload);
}

export async function DELETE(_request: Request, { params }: Params) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const { id } = await params;
  const board = await getOwnedBoard(viewer.session.user.id, id);
  if (!board) return jsonError("Not found", 404);
  const db = await getDb();
  await db.delete(boards).where(eq(boards.id, id));
  return NextResponse.json({ ok: true });
}
