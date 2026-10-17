import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { assets } from "@/db/schema";
import { jsonError, requireUser } from "@/lib/http";
import { readStored } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const { id } = await params;
  const variant = new URL(request.url).searchParams.get("variant") === "original" ? "original" : "preview";
  const db = await getDb();
  const rows = await db
    .select()
    .from(assets)
    .where(and(eq(assets.id, id), eq(assets.userId, viewer.session.user.id)))
    .limit(1);
  const asset = rows[0];
  if (!asset) return jsonError("Not found", 404);
  const stored = variant === "original" ? asset.originalUrl : asset.previewUrl;
  const bytes = await readStored(stored);
  if (!bytes) return jsonError("Not found", 404);
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": asset.mime,
      "Cache-Control": "private, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
