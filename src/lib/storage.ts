import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

export function blobUploadsEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveBytes(id: string, kind: "original" | "preview", bytes: Uint8Array, mime: string) {
  if (blobUploadsEnabled()) {
    const blob = await put(`assets/${id}/${kind}`, Buffer.from(bytes), {
      access: "public",
      contentType: mime,
      addRandomSuffix: true,
    });
    return blob.url;
  }
  const dir = path.join(process.cwd(), ".data", "blobs", id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, kind), bytes);
  return `local:${id}:${kind}`;
}

export async function readStored(url: string): Promise<Uint8Array | null> {
  if (url.startsWith("local:")) {
    const [, id, kind] = url.split(":");
    if (!id || (kind !== "original" && kind !== "preview")) return null;
    try {
      return await readFile(path.join(process.cwd(), ".data", "blobs", id, kind));
    } catch {
      return null;
    }
  }
  const response = await fetch(url);
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}
