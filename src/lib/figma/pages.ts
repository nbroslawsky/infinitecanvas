import { nodeId, parseFig, parseFigBinary, type FigDocument, type FigNode, type FigTransform } from "openfig-core";
import { renderTopLevel, type RenderedNode } from "@/lib/figma/svg";

const IDENTITY: FigTransform = { m00: 1, m01: 0, m02: 0, m10: 0, m11: 1, m12: 0 };
const CONTAINERS = new Set(["FRAME", "GROUP", "SECTION", "COMPONENT_SET"]);

export type FigImportPage = {
  name: string;
  zoom: number;
  objects: RenderedNode[];
};

export function pagesFromFig(bytes: Uint8Array, filename: string) {
  const doc = readFig(bytes);
  const fileName = fileTitle(doc, filename);
  const slides = ordered(doc.nodes.filter((node) => node.type === "SLIDE" && node.visible !== false && node.phase !== "REMOVED"));
  const sheets = slides.length > 0 ? slides : canvases(doc);
  const pages: FigImportPage[] = [];
  for (const sheet of sheets) {
    const objects = objectsOn(doc, sheet);
    if (objects.length === 0) continue;
    const centered = center(objects);
    pages.push({
      name: boardName(fileName, sheet.name || "Page", sheets.length),
      zoom: fitZoom(centered),
      objects: centered,
    });
  }
  if (pages.length === 0) throw new Error("That Figma file has no pages to import");
  return { fileName, pages };
}

export function readFig(bytes: Uint8Array): FigDocument {
  if (bytes.length < 12) throw new Error("That file isn't a Figma .fig document");
  try {
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return parseFig(bytes);
    if (String.fromCharCode(...bytes.subarray(0, 4)) === "fig-") return parseFigBinary(bytes);
  } catch {
    throw new Error("That file isn't a Figma .fig document");
  }
  throw new Error("That file isn't a Figma .fig document");
}

function canvases(doc: FigDocument) {
  const document = doc.nodes.find((node) => node.type === "DOCUMENT");
  const children = document ? doc.childrenMap.get(nodeId(document) || "") || [] : [];
  return ordered(children.filter((node) => node.type === "CANVAS" && node.internalOnly !== true && node.phase !== "REMOVED"));
}

function objectsOn(doc: FigDocument, sheet: FigNode) {
  const children = doc.childrenMap.get(nodeId(sheet) || "") || [];
  const objects: RenderedNode[] = [];
  for (const child of ordered(children)) {
    if (child.type === "CANVAS" || child.type === "DOCUMENT" || child.visible === false || child.phase === "REMOVED") continue;
    flatten(doc, child, IDENTITY, objects);
  }
  return objects;
}

function flatten(doc: FigDocument, node: FigNode, parentWorld: FigTransform, objects: RenderedNode[]) {
  if (node.visible === false || node.phase === "REMOVED" || node.mask) return;
  const world = multiply(parentWorld, node.transform ?? IDENTITY);
  if (shouldExplode(doc, node)) {
    const background = renderTopLevel(doc, node, { transform: world, shallow: true });
    if (background) objects.push(background);
    for (const child of ordered(doc.childrenMap.get(nodeId(node) || "") || [])) flatten(doc, child, world, objects);
    return;
  }
  const rendered = renderTopLevel(doc, node, { transform: world });
  if (rendered) objects.push(rendered);
}

function shouldExplode(doc: FigDocument, node: FigNode) {
  if (!CONTAINERS.has(node.type)) return false;
  return !isArtwork(doc, node);
}

function isArtwork(doc: FigDocument, node: FigNode) {
  const nodes: FigNode[] = [];
  collect(doc, node, nodes, new Set());
  return nodes.every((entry) => entry === node || isArtworkPiece(entry));
}

function collect(doc: FigDocument, node: FigNode, acc: FigNode[], stack: Set<string>) {
  acc.push(node);
  if (node.type === "INSTANCE" && node.symbolData?.symbolID) return;
  const id = nodeId(node) || "";
  if (stack.has(id)) return;
  stack.add(id);
  for (const child of doc.childrenMap.get(id) || []) {
    if (child.phase === "REMOVED" || child.visible === false) continue;
    collect(doc, child, acc, stack);
  }
}

function isArtworkPiece(node: FigNode) {
  if (node.type === "TEXT" || node.type === "INSTANCE" || node.type === "SYMBOL" || node.type === "COMPONENT") return false;
  return !(node.fillPaints || []).some((paint) => paint.type === "IMAGE" && paint.visible !== false);
}

function multiply(parent: FigTransform, local: FigTransform): FigTransform {
  return {
    m00: parent.m00 * local.m00 + parent.m01 * local.m10,
    m01: parent.m00 * local.m01 + parent.m01 * local.m11,
    m02: parent.m00 * local.m02 + parent.m01 * local.m12 + parent.m02,
    m10: parent.m10 * local.m00 + parent.m11 * local.m10,
    m11: parent.m10 * local.m01 + parent.m11 * local.m11,
    m12: parent.m10 * local.m02 + parent.m11 * local.m12 + parent.m12,
  };
}

function ordered(nodes: FigNode[]) {
  return [...nodes].sort((a, b) => {
    const left = a.parentIndex?.position || "";
    const right = b.parentIndex?.position || "";
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
}

function center(objects: RenderedNode[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const object of objects) {
    minX = Math.min(minX, object.x);
    minY = Math.min(minY, object.y);
    maxX = Math.max(maxX, object.x + object.width);
    maxY = Math.max(maxY, object.y + object.height);
  }
  const dx = (minX + maxX) / 2;
  const dy = (minY + maxY) / 2;
  return objects.map((object) => ({
    ...object,
    x: Math.round((object.x - dx) * 1000) / 1000,
    y: Math.round((object.y - dy) * 1000) / 1000,
  }));
}

function fitZoom(objects: RenderedNode[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const object of objects) {
    minX = Math.min(minX, object.x);
    minY = Math.min(minY, object.y);
    maxX = Math.max(maxX, object.x + object.width);
    maxY = Math.max(maxY, object.y + object.height);
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const zoom = Math.min(1, 1200 / width, 760 / height);
  return Math.max(0.05, Math.round(zoom * 100) / 100);
}

function boardName(fileName: string, pageName: string, count: number) {
  const page = pageName.trim() || "Page";
  if (count === 1 || page === fileName) return fileName.slice(0, 120);
  return `${fileName} — ${page}`.slice(0, 120);
}

function fileTitle(doc: FigDocument, filename: string) {
  const fromMeta = doc.meta?.file_name;
  if (typeof fromMeta === "string" && fromMeta.trim()) return fromMeta.trim();
  const fromFile = filename.replace(/\.(fig|deck|jam)$/i, "").trim();
  return fromFile || "Figma";
}
