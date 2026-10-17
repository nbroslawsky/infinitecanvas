import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { assets, items } from "@/db/schema";
import { jsonError, requireUser } from "@/lib/http";
import { getOwnedBoard, parseItem, touchBoard } from "@/lib/items";

type Params = { params: Promise<{ id: string }> };

async function ownedAsset(userId: string, assetId: string | null) {
  if (!assetId) return true;
  const db = await getDb();
  const rows = await db
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.id, assetId), eq(assets.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function POST(request: Request, { params }: Params) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const { id } = await params;
  const board = await getOwnedBoard(viewer.session.user.id, id);
  if (!board) return jsonError("Not found", 404);
  const body = (await request.json().catch(() => null)) as { item?: unknown } | null;
  const item = parseItem(body?.item);
  if (!item) return jsonError("Invalid item", 400);
  if (item.type === "image" && !(await ownedAsset(viewer.session.user.id, item.assetId))) {
    return jsonError("Unknown image", 400);
  }
  const db = await getDb();
  const existing = await db
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.id, item.id), eq(items.boardId, id)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(items)
      .set({
        parentId: item.parentId,
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
      })
      .where(eq(items.id, item.id));
    await touchBoard(id);
    return NextResponse.json({ item });
  }
  await db.insert(items).values({
    id: item.id,
    boardId: id,
    type: item.type,
    assetId: item.type === "image" ? item.assetId : null,
    parentId: item.parentId,
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
  });
  await touchBoard(id);
  return NextResponse.json({ item });
}

export async function PATCH(request: Request, { params }: Params) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const { id } = await params;
  const board = await getOwnedBoard(viewer.session.user.id, id);
  if (!board) return jsonError("Not found", 404);
  const body = (await request.json().catch(() => null)) as { items?: unknown[] } | null;
  const nextItems = (body?.items ?? []).map(parseItem).filter((item): item is NonNullable<typeof item> => Boolean(item));
  const db = await getDb();
  for (const item of nextItems) {
    await db
      .update(items)
      .set({
        parentId: item.parentId,
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
      })
      .where(and(eq(items.id, item.id), eq(items.boardId, id)));
  }
  if (nextItems.length > 0) await touchBoard(id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: Params) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const { id } = await params;
  const board = await getOwnedBoard(viewer.session.user.id, id);
  if (!board) return jsonError("Not found", 404);
  const body = (await request.json().catch(() => null)) as { ids?: string[] } | null;
  const ids = (body?.ids ?? []).filter((value) => typeof value === "string");
  if (ids.length === 0) return jsonError("Nothing to delete", 400);
  const db = await getDb();
  const existing = await db
    .select()
    .from(items)
    .where(and(eq(items.boardId, id), inArray(items.id, ids)));
  for (const row of existing) {
    const children = await db.select().from(items).where(and(eq(items.boardId, id), eq(items.parentId, row.id)));
    for (const child of children) {
      if (ids.includes(child.id)) continue;
      await db
        .update(items)
        .set({ parentId: row.parentId, x: child.x + row.x, y: child.y + row.y })
        .where(eq(items.id, child.id));
    }
  }
  await db.delete(items).where(and(eq(items.boardId, id), inArray(items.id, ids)));
  await touchBoard(id);
  return NextResponse.json({ ok: true });
}
