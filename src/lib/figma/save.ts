import { inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { assets, boards, items } from "@/db/schema";
import { pagesFromFig } from "@/lib/figma/pages";
import { saveBytes } from "@/lib/storage";

export async function importFigFile(userId: string, bytes: Uint8Array, filename: string) {
  const { pages } = pagesFromFig(bytes, filename);
  const db = await getDb();
  const now = new Date();
  const created: Array<{ id: string; name: string; objects: number }> = [];
  try {
    for (const page of pages) {
      const id = crypto.randomUUID();
      const ids = new Map(page.objects.map((object) => [object.key, crypto.randomUUID()]));
      const assetRows = [];
      const itemRows = [];
      for (const [index, object] of page.objects.entries()) {
        const itemId = ids.get(object.key) ?? crypto.randomUUID();
        const parentId = object.parentKey ? (ids.get(object.parentKey) ?? null) : null;
        let assetId: string | null = null;
        if (object.type === "image" && object.svg) {
          assetId = crypto.randomUUID();
          const svg = new TextEncoder().encode(object.svg);
          const originalUrl = await saveBytes(assetId, "original", svg, "image/svg+xml");
          const previewUrl = await saveBytes(assetId, "preview", svg, "image/svg+xml");
          assetRows.push({
            id: assetId,
            userId,
            originalUrl,
            previewUrl,
            mime: "image/svg+xml",
            width: Math.max(1, Math.round(object.width)),
            height: Math.max(1, Math.round(object.height)),
            createdAt: now,
          });
        }
        itemRows.push({
          id: itemId,
          boardId: id,
          type: object.type,
          assetId,
          parentId,
          x: object.x,
          y: object.y,
          width: object.width,
          height: object.height,
          rotation: 0,
          zIndex: index + 1,
          text: "",
          fontSize: 24,
          color: object.type === "frame" ? object.color : "#1c1917",
          name: object.name,
        });
      }
      await db.insert(boards).values({
        id,
        userId,
        name: page.name,
        cameraX: 0,
        cameraY: 0,
        zoom: page.zoom,
        createdAt: now,
        updatedAt: now,
      });
      created.push({ id, name: page.name, objects: page.objects.length });
      for (let index = 0; index < assetRows.length; index += 40) {
        await db.insert(assets).values(assetRows.slice(index, index + 40));
      }
      for (let index = 0; index < itemRows.length; index += 40) {
        await db.insert(items).values(itemRows.slice(index, index + 40));
      }
    }
  } catch (error) {
    if (created.length > 0) {
      await db.delete(boards).where(inArray(boards.id, created.map((board) => board.id)));
    }
    throw error;
  }
  return created;
}
