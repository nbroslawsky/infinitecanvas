import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { jsonError, requireUser } from "@/lib/http";
import { sniffMime } from "@/lib/sniff";
import { saveBytes } from "@/lib/storage";
import { MAX_UPLOAD_BYTES } from "@/lib/types";

export async function POST(request: Request) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const form = await request.formData();
  const original = form.get("original");
  const preview = form.get("preview");
  if (!(original instanceof File)) return jsonError("Choose an image", 400);
  if (original.size > MAX_UPLOAD_BYTES) return jsonError("Images need to be under 25 MB", 400);
  const bytes = new Uint8Array(await original.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return jsonError("Use a PNG, JPEG, WebP, GIF, or SVG", 400);
  const width = Number(form.get("width"));
  const height = Number(form.get("height"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    return jsonError("Could not read the image size", 400);
  }
  const previewBytes =
    preview instanceof File ? new Uint8Array(await preview.arrayBuffer()) : bytes;
  const previewMime = preview instanceof File ? sniffMime(previewBytes) || "image/jpeg" : mime;
  const id = crypto.randomUUID();
  const originalUrl = await saveBytes(id, "original", bytes, mime);
  const previewUrl = await saveBytes(id, "preview", previewBytes, previewMime);
  const db = await getDb();
  await db.insert(assets).values({
    id,
    userId: viewer.session.user.id,
    originalUrl,
    previewUrl,
    mime,
    width: Math.round(width),
    height: Math.round(height),
    createdAt: new Date(),
  });
  return NextResponse.json({ asset: { id, mime, width: Math.round(width), height: Math.round(height) } });
}
