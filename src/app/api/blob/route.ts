import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { jsonError, requireUser } from "@/lib/http";
import { blobUploadsEnabled } from "@/lib/storage";
import { MAX_UPLOAD_BYTES } from "@/lib/types";

export async function POST(request: Request) {
  if (!blobUploadsEnabled()) return jsonError("Direct upload is not configured", 404);
  const viewer = await requireUser();
  if (!viewer) return jsonError("Unauthorized", 401);
  const body = (await request.json()) as HandleUploadBody;
  const result = await handleUpload({
    request,
    body,
    onBeforeGenerateToken: async () => ({
      allowedContentTypes: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"],
      maximumSizeInBytes: MAX_UPLOAD_BYTES,
      addRandomSuffix: true,
      tokenPayload: viewer.session.user.id,
    }),
    onUploadCompleted: async () => {},
  });
  return NextResponse.json(result);
}
