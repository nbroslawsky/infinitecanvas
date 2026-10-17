import { EXPORT_MAX_EDGE, EXPORT_PADDING } from "@/lib/types";

export type LayoutItem = {
  id: string;
  type: "image" | "text" | "frame";
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
};

export type Aabb = { x: number; y: number; width: number; height: number };

export function rotatedAabb(box: {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}): Aabb {
  const rad = (box.rotation * Math.PI) / 180;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const corners: Array<[number, number]> = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ];
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const pts = corners.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos] as const;
  });
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function worldOrigin(items: LayoutItem[], id: string): { x: number; y: number } {
  const byId = new Map(items.map((item) => [item.id, item]));
  let x = 0;
  let y = 0;
  let current = byId.get(id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    x += current.x;
    y += current.y;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return { x, y };
}

export function worldBox(items: LayoutItem[], item: LayoutItem) {
  const origin = worldOrigin(items, item.id);
  return {
    x: origin.x,
    y: origin.y,
    width: item.width,
    height: item.height,
    rotation: item.type === "frame" ? 0 : item.rotation,
  };
}

function descendants(items: LayoutItem[], id: string): Set<string> {
  const ids = new Set<string>();
  const walk = (parentId: string) => {
    for (const item of items) {
      if (item.parentId === parentId && !ids.has(item.id)) {
        ids.add(item.id);
        walk(item.id);
      }
    }
  };
  walk(id);
  return ids;
}

export function frameAtPoint(items: LayoutItem[], itemId: string, worldX: number, worldY: number): string | null {
  const blocked = descendants(items, itemId);
  blocked.add(itemId);
  const hits = items
    .filter((item) => item.type === "frame" && !blocked.has(item.id))
    .filter((frame) => {
      const box = worldBox(items, frame);
      return worldX >= box.x && worldX <= box.x + box.width && worldY >= box.y && worldY <= box.y + box.height;
    })
    .sort((a, b) => b.zIndex - a.zIndex);
  return hits[0]?.id ?? null;
}

export function reparent(items: LayoutItem[], itemId: string): { parentId: string | null; x: number; y: number } | null {
  const item = items.find((entry) => entry.id === itemId);
  if (!item || item.type === "frame") return null;
  const world = worldBox(items, item);
  const centerX = world.x + world.width / 2;
  const centerY = world.y + world.height / 2;
  const nextParent = frameAtPoint(items, itemId, centerX, centerY);
  if (nextParent === item.parentId) return null;
  const parentOrigin = nextParent ? worldOrigin(items, nextParent) : { x: 0, y: 0 };
  return {
    parentId: nextParent,
    x: world.x - parentOrigin.x,
    y: world.y - parentOrigin.y,
  };
}

export type AlignKind = "left" | "center" | "right" | "top" | "middle" | "bottom";

export function alignItems<T extends LayoutItem>(items: T[], ids: string[], kind: AlignKind): T[] {
  const selected = items.filter((item) => ids.includes(item.id));
  if (selected.length < 2) return items;
  const boxes = selected.map((item) => ({ item, aabb: rotatedAabb(worldBox(items, item)) }));
  const minX = Math.min(...boxes.map((box) => box.aabb.x));
  const minY = Math.min(...boxes.map((box) => box.aabb.y));
  const maxX = Math.max(...boxes.map((box) => box.aabb.x + box.aabb.width));
  const maxY = Math.max(...boxes.map((box) => box.aabb.y + box.aabb.height));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const shifts = new Map<string, { x: number; y: number }>();
  for (const box of boxes) {
    let dx = 0;
    let dy = 0;
    if (kind === "left") dx = minX - box.aabb.x;
    if (kind === "right") dx = maxX - (box.aabb.x + box.aabb.width);
    if (kind === "center") dx = midX - (box.aabb.x + box.aabb.width / 2);
    if (kind === "top") dy = minY - box.aabb.y;
    if (kind === "bottom") dy = maxY - (box.aabb.y + box.aabb.height);
    if (kind === "middle") dy = midY - (box.aabb.y + box.aabb.height / 2);
    shifts.set(box.item.id, { x: dx, y: dy });
  }
  return items.map((item) => {
    const shift = shifts.get(item.id);
    if (!shift) return item;
    return { ...item, x: item.x + shift.x, y: item.y + shift.y };
  });
}

export function distributeItems<T extends LayoutItem>(items: T[], ids: string[], axis: "x" | "y"): T[] {
  const selected = items.filter((item) => ids.includes(item.id));
  if (selected.length < 3) return items;
  const boxes = selected
    .map((item) => ({ item, aabb: rotatedAabb(worldBox(items, item)) }))
    .sort((a, b) => (axis === "x" ? a.aabb.x - b.aabb.x : a.aabb.y - b.aabb.y));
  const first = boxes[0];
  const last = boxes[boxes.length - 1];
  const span =
    axis === "x"
      ? last.aabb.x + last.aabb.width - first.aabb.x
      : last.aabb.y + last.aabb.height - first.aabb.y;
  const size = boxes.reduce((sum, box) => sum + (axis === "x" ? box.aabb.width : box.aabb.height), 0);
  const gap = (span - size) / (boxes.length - 1);
  let cursor = axis === "x" ? first.aabb.x : first.aabb.y;
  const shifts = new Map<string, { x: number; y: number }>();
  for (const box of boxes) {
    const start = axis === "x" ? box.aabb.x : box.aabb.y;
    const delta = cursor - start;
    shifts.set(box.item.id, axis === "x" ? { x: delta, y: 0 } : { x: 0, y: delta });
    cursor += (axis === "x" ? box.aabb.width : box.aabb.height) + gap;
  }
  return items.map((item) => {
    const shift = shifts.get(item.id);
    if (!shift) return item;
    return { ...item, x: item.x + shift.x, y: item.y + shift.y };
  });
}

export function contentBounds(items: LayoutItem[], padding = EXPORT_PADDING): Aabb | null {
  if (items.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    const aabb = rotatedAabb(worldBox(items, item));
    minX = Math.min(minX, aabb.x);
    minY = Math.min(minY, aabb.y);
    maxX = Math.max(maxX, aabb.x + aabb.width);
    maxY = Math.max(maxY, aabb.y + aabb.height);
  }
  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

export function exportScale(width: number, height: number, desired = 2, maxEdge = EXPORT_MAX_EDGE): number {
  if (width <= 0 || height <= 0) return desired;
  const edge = Math.max(width, height) * desired;
  if (edge <= maxEdge) return desired;
  return maxEdge / Math.max(width, height);
}

export function pdfPageSize(bounds: Aabb): { width: number; height: number } {
  return { width: bounds.width, height: bounds.height };
}

export function pdfImageOrigin(options: {
  pageHeight: number;
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
}) {
  const radians = (-options.rotation * Math.PI) / 180;
  const cx = options.left + options.width / 2;
  const cy = options.pageHeight - (options.top + options.height / 2);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const vx = (options.width / 2) * cos - (options.height / 2) * sin;
  const vy = (options.width / 2) * sin + (options.height / 2) * cos;
  return { x: cx - vx, y: cy - vy };
}
