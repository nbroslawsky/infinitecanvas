"use client";

import { zipSync } from "fflate";
import { domToBlob } from "modern-screenshot";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, rgb } from "pdf-lib";
import { contentBounds, exportScale, pdfImageOrigin, worldBox, type LayoutItem } from "@/lib/layout";
import type { AssetRecord, CanvasItem } from "@/lib/types";

export type ExportResult = {
  blob: Blob;
  filename: string;
  scale: number;
  capped: boolean;
};

function asLayout(items: CanvasItem[]): LayoutItem[] {
  return items.map((item) => ({
    id: item.id,
    type: item.type,
    parentId: item.parentId,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    zIndex: item.zIndex,
  }));
}

function subsetFor(items: CanvasItem[], ids?: string[]) {
  if (!ids || ids.length === 0) return items;
  const wanted = new Set(ids);
  return items.filter((item) => wanted.has(item.id));
}

export async function exportBoardPng(items: CanvasItem[], ids?: string[]): Promise<ExportResult | { error: string }> {
  const chosen = subsetFor(items, ids);
  const bounds = contentBounds(asLayout(chosen));
  if (!bounds) return { error: "Nothing on this board to export" };
  let scale = exportScale(bounds.width, bounds.height);
  try {
    const blob = await renderPng(chosen, bounds, scale);
    return { blob, filename: "board.png", scale, capped: scale < 1.99 };
  } catch {
    scale = Math.max(0.25, scale / 2);
    const blob = await renderPng(chosen, bounds, scale);
    return { blob, filename: "board.png", scale, capped: true };
  }
}

async function renderPng(
  items: CanvasItem[],
  bounds: { x: number; y: number; width: number; height: number },
  scale: number,
) {
  const width = Math.max(1, Math.round(bounds.width * scale));
  const height = Math.max(1, Math.round(bounds.height * scale));
  const root = document.createElement("div");
  root.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;background:#f4f1ea;overflow:hidden;`;
  const world = document.createElement("div");
  world.style.cssText = `position:absolute;left:0;top:0;width:${bounds.width}px;height:${bounds.height}px;transform:scale(${scale});transform-origin:0 0;`;
  const layout = asLayout(items);
  const ordered = [...items].sort((a, b) => a.zIndex - b.zIndex);
  for (const item of ordered) {
    const box = worldBox(layout, item);
    const node = document.createElement("div");
    node.style.cssText = `position:absolute;left:${box.x - bounds.x}px;top:${box.y - bounds.y}px;width:${item.width}px;height:${item.height}px;transform:rotate(${item.type === "frame" ? 0 : item.rotation}deg);transform-origin:center center;box-sizing:border-box;`;
    if (item.type === "frame") {
      node.style.border = "1px solid #d6d3d1";
      node.style.background = "rgba(255,255,255,0.72)";
      node.style.overflow = "hidden";
      const title = document.createElement("div");
      title.textContent = item.name || "Frame";
      title.style.cssText = "position:absolute;left:0;top:-22px;font:600 13px Inter,sans-serif;color:#57534e;white-space:nowrap;";
      node.appendChild(title);
    } else if (item.type === "text") {
      node.style.font = `${item.fontSize}px Inter, sans-serif`;
      node.style.color = item.color;
      node.style.whiteSpace = "pre-wrap";
      node.style.lineHeight = "1.3";
      node.textContent = item.text;
    } else if (item.assetId) {
      const image = document.createElement("img");
      image.alt = "";
      image.crossOrigin = "anonymous";
      image.src = `/api/assets/${item.assetId}?variant=original`;
      image.style.cssText = "width:100%;height:100%;object-fit:fill;display:block;";
      node.appendChild(image);
    }
    world.appendChild(node);
  }
  root.appendChild(world);
  document.body.appendChild(root);
  try {
    await Promise.all(
      [...root.querySelectorAll("img")].map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) resolve();
            else {
              image.onload = () => resolve();
              image.onerror = () => resolve();
            }
          }),
      ),
    );
    return await domToBlob(root, { width, height, scale: 1 });
  } finally {
    root.remove();
  }
}

export async function exportBoardPdf(pages: Array<{ name: string; items: CanvasItem[] }>): Promise<ExportResult | { error: string }> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fontBytes = await fetch("/fonts/Inter-Regular.ttf").then((response) => response.arrayBuffer());
  const font = await pdf.embedFont(fontBytes);
  let drew = false;
  for (const page of pages) {
    const bounds = contentBounds(asLayout(page.items));
    if (!bounds) continue;
    drew = true;
    const pdfPage = pdf.addPage([bounds.width, bounds.height]);
    const layout = asLayout(page.items);
    const ordered = [...page.items].sort((a, b) => a.zIndex - b.zIndex);
    for (const item of ordered) {
      const box = worldBox(layout, item);
      const left = box.x - bounds.x;
      const top = box.y - bounds.y;
      if (item.type === "frame") {
        pdfPage.drawRectangle({
          x: left,
          y: bounds.height - top - item.height,
          width: item.width,
          height: item.height,
          borderWidth: 1,
          borderColor: rgb(0.84, 0.83, 0.82),
          color: rgb(1, 1, 1),
          opacity: 0.9,
        });
        pdfPage.drawText(item.name || "Frame", {
          x: left,
          y: bounds.height - top + 6,
          size: 13,
          font,
          color: rgb(0.34, 0.33, 0.31),
        });
        continue;
      }
      if (item.type === "text") {
        const origin = pdfImageOrigin({
          pageHeight: bounds.height,
          left,
          top,
          width: item.width,
          height: item.height,
          rotation: item.rotation,
        });
        const lines = wrapText(item.text || "Text", font, item.fontSize, item.width);
        lines.forEach((line, index) => {
          pdfPage.drawText(line, {
            x: origin.x,
            y: origin.y + item.height - item.fontSize * (index + 1),
            size: item.fontSize,
            font,
            color: hexToRgb(item.color),
            rotate: degrees(-item.rotation),
          });
        });
        continue;
      }
      if (!item.assetId) continue;
      const response = await fetch(`/api/assets/${item.assetId}?variant=original`);
      if (!response.ok) continue;
      const bytes = await response.arrayBuffer();
      const mime = response.headers.get("content-type") || "";
      const embedded = mime.includes("png")
        ? await pdf.embedPng(bytes)
        : mime.includes("jpeg") || mime.includes("jpg")
          ? await pdf.embedJpg(bytes)
          : await pdf.embedPng(await rasterize(bytes, mime));
      const origin = pdfImageOrigin({
        pageHeight: bounds.height,
        left,
        top,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
      });
      pdfPage.drawImage(embedded, {
        x: origin.x,
        y: origin.y,
        width: item.width,
        height: item.height,
        rotate: degrees(-item.rotation),
      });
    }
  }
  if (!drew) return { error: "Nothing on the selected boards to export" };
  const saved = await pdf.save();
  const pdfBytes = saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength) as ArrayBuffer;
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  return { blob, filename: "boards.pdf", scale: 1, capped: false };
}

export async function exportBoardsZip(pages: Array<{ name: string; items: CanvasItem[] }>): Promise<ExportResult | { error: string }> {
  const files: Record<string, Uint8Array> = {};
  let capped = false;
  let scale = 2;
  for (const page of pages) {
    const result = await exportBoardPng(page.items);
    if ("error" in result) continue;
    capped = capped || result.capped;
    scale = Math.min(scale, result.scale);
    const safe = (page.name || "board").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "board";
    let filename = `${safe}.png`;
    let n = 2;
    while (files[filename]) {
      filename = `${safe}-${n}.png`;
      n += 1;
    }
    files[filename] = new Uint8Array(await result.blob.arrayBuffer());
  }
  if (Object.keys(files).length === 0) return { error: "Nothing on the selected boards to export" };
  const zipped = zipSync(files);
  const bytes = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
  return { blob: new Blob([bytes], { type: "application/zip" }), filename: "boards.zip", scale, capped };
}

function wrapText(text: string, font: { widthOfTextAtSize: (text: string, size: number) => number }, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines.length > 0 ? lines : [""];
}

function hexToRgb(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return rgb(0.11, 0.1, 0.09);
  const value = Number.parseInt(match[1], 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

async function rasterize(bytes: ArrayBuffer, mime: string) {
  const blob = new Blob([bytes], { type: mime || "image/png" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("image"));
      element.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 1;
    canvas.height = image.naturalHeight || 1;
    canvas.getContext("2d")?.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("png"))), "image/png");
    });
    return png.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
