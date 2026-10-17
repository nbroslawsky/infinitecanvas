import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { boards, items } from "@/db/schema";
import { jsonError, requireUser } from "@/lib/http";
import { loadBoard } from "@/lib/items";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const { id } = await params;
  const payload = await loadBoard(viewer.session.user.id, id);
  if (!payload) return jsonError("Not found", 404);
  const now = new Date();
  const nextId = crypto.randomUUID();
  const db = await getDb();
  await db.insert(boards).values({
    id: nextId,
    userId: viewer.session.user.id,
    name: `${payload.board.name} copy`.slice(0, 120),
    cameraX: payload.board.cameraX,
    cameraY: payload.board.cameraY,
    zoom: payload.board.zoom,
    createdAt: now,
    updatedAt: now,
  });
  const idMap = new Map(payload.items.map((item) => [item.id, crypto.randomUUID()]));
  if (payload.items.length > 0) {
    await db.insert(items).values(
      payload.items.map((item) => ({
        id: idMap.get(item.id)!,
        boardId: nextId,
        type: item.type,
        assetId: item.assetId,
        parentId: item.parentId ? (idMap.get(item.parentId) ?? null) : null,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        zIndex: item.zIndex,
        text: item.text,
        fontSize: item.fontSize,
        color: item.color,
        name: item.name,
      })),
    );
  }
  const copy = await loadBoard(viewer.session.user.id, nextId);
  return NextResponse.json(copy ?? { board: { id: nextId } });
}
