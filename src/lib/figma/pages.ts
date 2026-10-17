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
    const objects = layoutObjects(objectsOn(doc, sheet));
    if (objects.length === 0) continue;
    pages.push({
      name: boardName(fileName, sheet.name || "Page", sheets.length),
      zoom: fitZoom(objects.filter((object) => !object.parentKey)),
      objects,
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

function childNodes(doc: FigDocument, id: string) {
  const seen = new Set<string>();
  const kids: FigNode[] = [];
  for (const child of doc.childrenMap.get(id) || []) {
    const childId = nodeId(child);
    if (!childId || seen.has(childId)) continue;
    seen.add(childId);
    const latest = doc.nodeMap.get(childId) || child;
    if (latest.phase === "REMOVED" || latest.visible === false) continue;
    kids.push(latest);
  }
  return ordered(kids);
}

function objectsOn(doc: FigDocument, sheet: FigNode) {
  const children = childNodes(doc, nodeId(sheet) || "");
  const objects: RenderedNode[] = [];
  for (const child of children) {
    if (child.type === "CANVAS" || child.type === "DOCUMENT" || child.visible === false || child.phase === "REMOVED") continue;
    flatten(doc, child, IDENTITY, null, objects);
  }
  return objects;
}

function flatten(doc: FigDocument, node: FigNode, parentWorld: FigTransform, parentKey: string | null, objects: RenderedNode[]) {
  if (node.visible === false || node.phase === "REMOVED" || node.mask) return;
  const world = multiply(parentWorld, node.transform ?? IDENTITY);
  const key = nodeId(node) || crypto.randomUUID();
  if (shouldExplode(doc, node)) {
    if (node.type === "FRAME" || node.type === "SECTION") {
      const box = frameBox(node, world);
      if (box) {
        objects.push({
          key,
          parentKey,
          type: "frame",
          name: (node.name || "Frame").slice(0, 120),
          ...box,
          svg: "",
          color: frameColor(node),
        });
        const stroke = renderTopLevel(doc, node, { transform: world, shallow: true, strokesOnly: true });
        if (stroke?.svg) objects.push({ ...stroke, key: `${key}:stroke`, parentKey: key, name: node.name || "Stroke" });
        for (const child of childNodes(doc, key)) flatten(doc, child, world, key, objects);
        return;
      }
    }
    const background = renderTopLevel(doc, node, { transform: world, shallow: true });
    if (background) objects.push({ ...background, key, parentKey });
    for (const child of childNodes(doc, key)) flatten(doc, child, world, parentKey, objects);
    return;
  }
  const rendered = renderTopLevel(doc, node, { transform: world });
  if (rendered) objects.push({ ...rendered, key, parentKey });
}

function frameBox(node: FigNode, world: FigTransform) {
  const width = node.size?.x || 0;
  const height = node.size?.y || 0;
  if (width < 1 || height < 1) return null;
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const pure =
    Math.abs(world.m00 - 1) < 1e-3 && Math.abs(world.m11 - 1) < 1e-3 && Math.abs(world.m01) < 1e-3 && Math.abs(world.m10) < 1e-3;
  if (pure) return { x: round(world.m02), y: round(world.m12), width: round(width), height: round(height) };
  const corners = [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([x, y]) => ({
    x: world.m00 * x + world.m01 * y + world.m02,
    y: world.m10 * x + world.m11 * y + world.m12,
  }));
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  return { x: round(minX), y: round(minY), width: round(maxX - minX), height: round(maxY - minY) };
}

function frameColor(node: FigNode) {
  const paints = [...(node.backgroundPaints || []), ...(node.fillPaints || [])];
  const solid = paints.find((paint) => paint && paint.visible !== false && paint.type === "SOLID" && paint.color);
  if (!solid?.color) return "transparent";
  const opacity = Math.max(0, Math.min(1, (solid.color.a ?? 1) * (solid.opacity ?? 1)));
  const channel = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 255).toString(16).padStart(2, "0");
  const hex = `#${channel(solid.color.r)}${channel(solid.color.g)}${channel(solid.color.b)}`;
  if (opacity >= 0.999) return hex;
  return `${hex}${channel(opacity)}`;
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
  for (const child of childNodes(doc, id)) collect(doc, child, acc, stack);
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

function layoutObjects(objects: RenderedNode[]) {
  if (objects.length === 0) return objects;
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
  const round = (value: number) => Math.round(value * 1000) / 1000;
  const shifted = objects.map((object) => ({ ...object, x: round(object.x - dx), y: round(object.y - dy) }));
  const byKey = new Map(shifted.map((object) => [object.key, object]));
  return shifted.map((object) => {
    if (!object.parentKey) return object;
    const parent = byKey.get(object.parentKey);
    if (!parent || parent.type !== "frame") return { ...object, parentKey: null };
    return { ...object, x: round(object.x - parent.x), y: round(object.y - parent.y) };
  });
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
