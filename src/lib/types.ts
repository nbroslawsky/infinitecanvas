export type ItemType = "image" | "text" | "frame";

export type CanvasItem = {
  id: string;
  type: ItemType;
  assetId: string | null;
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  text: string;
  fontSize: number;
  color: string;
  name: string;
};

export type AssetRecord = {
  id: string;
  mime: string;
  width: number;
  height: number;
};

export type BoardRecord = {
  id: string;
  name: string;
  cameraX: number;
  cameraY: number;
  zoom: number;
  updatedAt: string;
};

export type BoardPayload = {
  board: BoardRecord;
  items: CanvasItem[];
  assets: AssetRecord[];
};

export const FONT_SIZES = [16, 24, 40, 64] as const;
export const TEXT_COLORS = ["#1c1917", "#9a3412", "#166534", "#1d4ed8", "#6b21a8"] as const;
export const FRAME_COLORS = ["#ffffff", "#f5f5f4", "#e7e5e4", "#a8a29e", "#57534e", "#292524", "transparent"] as const;

export function frameFill(color: string) {
  if (!color || color === "#1c1917") return "#ffffff";
  return color;
}
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const PREVIEW_MAX_EDGE = 2048;
export const EXPORT_PADDING = 48;
export const EXPORT_MAX_EDGE = 8192;
export const DEFAULT_LONG_SIDE = 480;
