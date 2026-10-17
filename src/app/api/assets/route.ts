import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { jsonError, requireUser } from "@/lib/http";
import { sniffMime } from "@/lib/sniff";
import { readStored } from "@/lib/storage";

export async function POST(request: Request) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const body = (await request.json().catch(() => null)) as {
    originalUrl?: string;
    previewUrl?: string;
    width?: number;
    height?: number;
  } | null;
  if (!body?.originalUrl || !body.previewUrl) return jsonError("Missing file", 400);
  const bytes = await readStored(body.originalUrl);
  if (!bytes) return jsonError("Could not read the upload", 400);
  const mime = sniffMime(bytes);
  if (!mime) return jsonError("Use a PNG, JPEG, WebP, GIF, or SVG", 400);
  const width = Number(body.width);
  const height = Number(body.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return jsonError("Could not read the image size", 400);
  }
  const id = crypto.randomUUID();
  const db = await getDb();
  await db.insert(assets).values({
    id,
    userId: viewer.session.user.id,
    originalUrl: body.originalUrl,
    previewUrl: body.previewUrl,
    mime,
    width: Math.round(width),
    height: Math.round(height),
    createdAt: new Date(),
  });
  return NextResponse.json({ asset: { id, mime, width: Math.round(width), height: Math.round(height) } });
}
