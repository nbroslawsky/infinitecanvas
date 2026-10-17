import { NextResponse } from "next/server";
import { importFigFile } from "@/lib/figma/save";
import { jsonError, requireUser } from "@/lib/http";

export const maxDuration = 60;

const MAX_FIG_BYTES = 48 * 1024 * 1024;

export async function POST(request: Request) {
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("Choose a .fig file", 400);
  if (!/\.(fig|deck|jam)$/i.test(file.name)) return jsonError("Choose a .fig file", 400);
  if (file.size > MAX_FIG_BYTES) return jsonError("Figma files need to be under 48 MB", 400);
  if (process.env.VERCEL && file.size > 4.5 * 1024 * 1024) {
    return jsonError("That Figma file is over 4.5 MB. The hosted site can't receive an upload that large.", 400);
  }
  try {
    const boards = await importFigFile(viewer.session.user.id, new Uint8Array(await file.arrayBuffer()), file.name);
    return NextResponse.json({ boards });
  } catch (error) {
    console.error("Figma import failed", error);
    const message = error instanceof Error ? error.message : "Could not read that Figma file";
    const safe = message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[database]").slice(0, 240);
    return jsonError(safe || "Could not read that Figma file", 400);
  }
}
