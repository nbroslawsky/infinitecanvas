import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { assets, boards, items } from "@/db/schema";
import type { AssetRecord, BoardPayload, BoardRecord, CanvasItem, ItemType } from "@/lib/types";

function toBoard(row: typeof boards.$inferSelect): BoardRecord {
  return {
    id: row.id,
    name: row.name,
    cameraX: row.cameraX,
    cameraY: row.cameraY,
    zoom: row.zoom,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toItem(row: typeof items.$inferSelect): CanvasItem {
  return {
    id: row.id,
    type: row.type as ItemType,
    assetId: row.assetId,
    parentId: row.parentId,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    rotation: row.rotation,
    zIndex: row.zIndex,
    text: row.text ?? "",
    fontSize: row.fontSize ?? 24,
    color: row.color ?? "#1c1917",
    name: row.name ?? "",
  };
}

export async function listBoards(userId: string) {
  const db = await getDb();
  const rows = await db.select().from(boards).where(eq(boards.userId, userId)).orderBy(desc(boards.updatedAt));
  return rows.map(toBoard);
}

export async function getOwnedBoard(userId: string, boardId: string) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function loadBoard(userId: string, boardId: string): Promise<BoardPayload | null> {
  const board = await getOwnedBoard(userId, boardId);
  if (!board) return null;
  const db = await getDb();
  const itemRows = await db.select().from(items).where(eq(items.boardId, boardId)).orderBy(asc(items.zIndex));
  const assetIds = [...new Set(itemRows.map((item) => item.assetId).filter((id): id is string => Boolean(id)))];
  const assetRows =
    assetIds.length === 0
      ? []
      : await db
          .select()
          .from(assets)
          .where(and(eq(assets.userId, userId), inArray(assets.id, assetIds)));
  const assetRecords: AssetRecord[] = assetRows.map((asset) => ({
    id: asset.id,
    mime: asset.mime,
    width: asset.width,
    height: asset.height,
  }));
  return { board: toBoard(board), items: itemRows.map(toItem), assets: assetRecords };
}

export async function touchBoard(boardId: string) {
  const db = await getDb();
  await db.update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, boardId));
}

export function parseItem(input: unknown): CanvasItem | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Partial<CanvasItem>;
  if (typeof value.id !== "string" || !value.id) return null;
  if (value.type !== "image" && value.type !== "text" && value.type !== "frame") return null;
  const number = (field: unknown, fallback = 0) => (typeof field === "number" && Number.isFinite(field) ? field : fallback);
  return {
    id: value.id,
    type: value.type,
    assetId: typeof value.assetId === "string" ? value.assetId : null,
    parentId: typeof value.parentId === "string" ? value.parentId : null,
    x: number(value.x),
    y: number(value.y),
    width: Math.max(8, number(value.width, 80)),
    height: Math.max(8, number(value.height, 40)),
    rotation: value.type === "frame" ? 0 : number(value.rotation),
    zIndex: Math.round(number(value.zIndex)),
    text: typeof value.text === "string" ? value.text.slice(0, 5000) : "",
    fontSize: [16, 24, 40, 64].includes(number(value.fontSize, 24)) ? number(value.fontSize, 24) : 24,
    color: typeof value.color === "string" ? value.color.slice(0, 32) : "#1c1917",
    name: typeof value.name === "string" ? value.name.slice(0, 120) : "",
  };
}
