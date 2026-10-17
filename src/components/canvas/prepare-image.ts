import { MAX_UPLOAD_BYTES, PREVIEW_MAX_EDGE } from "@/lib/types";
import { sniffMime } from "@/lib/sniff";

export type PreparedImage = {
  original: Blob;
  preview: Blob;
  width: number;
  height: number;
  name: string;
  mime: string;
};

export async function prepareImage(file: File): Promise<PreparedImage | { error: string }> {
  if (file.size > MAX_UPLOAD_BYTES) return { error: "Images need to be under 25 MB" };
  let blob: Blob = file;
  let name = file.name || "image";
  if (file.type === "image/heic" || file.type === "image/heif" || /\.heic$/i.test(name) || /\.heif$/i.test(name)) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    blob = Array.isArray(converted) ? converted[0] : converted;
    name = name.replace(/\.heic$/i, ".jpg").replace(/\.heif$/i, ".jpg");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return { error: "Use a PNG, JPEG, WebP, GIF, SVG, or HEIC image" };
  if (mime === "image/svg+xml") {
    const size = svgSize(new TextDecoder().decode(bytes));
    return { original: blob, preview: blob, width: size.width, height: size.height, name, mime };
  }
  const image = await loadImage(blob);
  const width = image.naturalWidth || 1;
  const height = image.naturalHeight || 1;
  const preview = mime === "image/gif" ? blob : await makePreview(image);
  return { original: blob, preview, width, height, name, mime };
}

function svgSize(text: string) {
  const viewBox = text.match(/viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/i);
  if (viewBox) {
    const width = Number(viewBox[3]);
    const height = Number(viewBox[4]);
    if (width > 0 && height > 0) return { width, height };
  }
  const width = Number(text.match(/\bwidth=["']([\d.]+)/i)?.[1]);
  const height = Number(text.match(/\bheight=["']([\d.]+)/i)?.[1]);
  if (width > 0 && height > 0) return { width, height };
  return { width: 480, height: 480 };
}

function loadImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    image.src = url;
  });
}

function makePreview(image: HTMLImageElement) {
  const edge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = edge > PREVIEW_MAX_EDGE ? PREVIEW_MAX_EDGE / edge : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return Promise.resolve(imageToBlob(image));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? imageToBlob(image)), "image/jpeg", 0.86);
  });
}

function imageToBlob(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d")?.drawImage(image, 0, 0);
  return new Blob();
}
