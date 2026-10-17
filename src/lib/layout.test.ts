import { describe, expect, it } from "vitest";
import {
  alignItems,
  contentBounds,
  distributeItems,
  dotGridStep,
  exportScale,
  pdfImageOrigin,
  pdfPageSize,
  reparent,
  rotatedAabb,
  type LayoutItem,
} from "@/lib/layout";

function item(partial: Partial<LayoutItem> & Pick<LayoutItem, "id">): LayoutItem {
  return {
    type: "image",
    parentId: null,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    rotation: 0,
    zIndex: 0,
    ...partial,
  };
}

describe("dotGridStep", () => {
  it("keeps the base grid at a normal zoom", () => {
    expect(dotGridStep(1)).toBe(24);
  });

  it("drops to a coarser lattice as the view zooms out", () => {
    expect(dotGridStep(0.2)).toBe(96);
    expect(dotGridStep(0.05)).toBeGreaterThan(96);
  });
});

describe("rotatedAabb", () => {
  it("matches the box when rotation is zero", () => {
    expect(rotatedAabb({ x: 10, y: 20, width: 40, height: 10, rotation: 0 })).toEqual({
      x: 10,
      y: 20,
      width: 40,
      height: 10,
    });
  });

  it("grows the box for a quarter turn of a wide rectangle", () => {
    const box = rotatedAabb({ x: 0, y: 0, width: 100, height: 20, rotation: 90 });
    expect(box.width).toBeCloseTo(20, 5);
    expect(box.height).toBeCloseTo(100, 5);
    expect(box.x + box.width / 2).toBeCloseTo(50, 5);
    expect(box.y + box.height / 2).toBeCloseTo(10, 5);
  });
});

describe("align and distribute", () => {
  const items = [
    item({ id: "a", x: 0, y: 10, width: 40, height: 20 }),
    item({ id: "b", x: 80, y: 40, width: 20, height: 20, rotation: 0 }),
  ];

  it("aligns left edges in world space", () => {
    const next = alignItems(items, ["a", "b"], "left");
    const b = next.find((entry) => entry.id === "b");
    expect(b?.x).toBe(0);
    expect(next.find((entry) => entry.id === "a")?.x).toBe(0);
  });

  it("distributes three items with equal gaps", () => {
    const row = [
      item({ id: "a", x: 0, y: 0, width: 10, height: 10 }),
      item({ id: "b", x: 20, y: 0, width: 10, height: 10 }),
      item({ id: "c", x: 100, y: 0, width: 10, height: 10 }),
    ];
    const next = distributeItems(row, ["a", "b", "c"], "x");
    expect(next.find((entry) => entry.id === "b")?.x).toBe(50);
  });
});

describe("reparent", () => {
  it("parents an item whose center lands in a frame", () => {
    const items = [
      item({ id: "frame", type: "frame", x: 0, y: 0, width: 200, height: 200, zIndex: 1 }),
      item({ id: "photo", x: 40, y: 50, width: 20, height: 20, zIndex: 2 }),
    ];
    expect(reparent(items, "photo")).toEqual({ parentId: "frame", x: 40, y: 50 });
  });

  it("does not parent a frame into itself or its child", () => {
    const items = [
      item({ id: "outer", type: "frame", x: 0, y: 0, width: 300, height: 300, zIndex: 1 }),
      item({ id: "inner", type: "frame", parentId: "outer", x: 10, y: 10, width: 100, height: 100, zIndex: 2 }),
    ];
    expect(reparent(items, "inner")).toBeNull();
  });

  it("pulls an item out when its center leaves the frame", () => {
    const items = [
      item({ id: "frame", type: "frame", x: 0, y: 0, width: 100, height: 100 }),
      item({ id: "photo", parentId: "frame", x: 200, y: 10, width: 20, height: 20 }),
    ];
    expect(reparent(items, "photo")).toEqual({ parentId: null, x: 200, y: 10 });
  });
});

describe("export scale", () => {
  it("stays at 2x when the long side fits", () => {
    expect(exportScale(1000, 500)).toBe(2);
  });

  it("caps the long side at 8192", () => {
    const scale = exportScale(5000, 1000);
    expect(scale).toBeCloseTo(8192 / 5000, 5);
    expect(Math.max(5000, 1000) * scale).toBeCloseTo(8192, 4);
  });

  it("uses the content box as the PDF page size", () => {
    const bounds = contentBounds([item({ id: "a", x: 10, y: 20, width: 100, height: 40 })], 48);
    expect(bounds).toEqual({ x: -38, y: -28, width: 196, height: 136 });
    expect(pdfPageSize(bounds!)).toEqual({ width: 196, height: 136 });
  });

  it("returns null bounds for an empty board", () => {
    expect(contentBounds([])).toBeNull();
  });

  it("keeps an upright image on its PDF rectangle", () => {
    expect(
      pdfImageOrigin({ pageHeight: 200, left: 10, top: 20, width: 100, height: 40, rotation: 0 }),
    ).toEqual({ x: 10, y: 140 });
  });
});
