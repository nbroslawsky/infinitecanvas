import { readFileSync } from "node:fs";
import path from "node:path";
import { geometryBlobToSVGPath, getBlobBytes, nodeId, parseFig, parseFigBinary, resolveVectorNodePaths, type FigDocument, type FigNode } from "openfig-core";
import { chromium, type Page } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pagesFromFig, readFig, type FigImportPage } from "@/lib/figma/pages";

function fig(name: string) {
  return new Uint8Array(readFileSync(path.join(process.cwd(), "src/lib/figma/fixtures", name)));
}

function cleanPath(d: string) {
  return d.replace(/^Z+/, "");
}

function figNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? "0" : String(rounded);
}

function childrenOf(doc: FigDocument, id: string) {
  return (doc.childrenMap.get(id) || [])
    .filter((node) => node.phase !== "REMOVED" && node.visible !== false)
    .sort((a, b) => (a.parentIndex?.position || "").localeCompare(b.parentIndex?.position || ""));
}

function visibleNodes(doc: FigDocument, node: FigNode, acc: FigNode[], stack = new Set<string>()) {
  acc.push(node);
  if (node.type === "INSTANCE" && node.symbolData?.symbolID) {
    const id = `${node.symbolData.symbolID.sessionID}:${node.symbolData.symbolID.localID}`;
    const symbol = doc.nodeMap.get(id);
    if (symbol && !stack.has(id)) {
      const next = new Set(stack);
      next.add(id);
      visibleNodes(doc, symbol, acc, next);
    }
    return;
  }
  for (const child of childrenOf(doc, nodeId(node) || "")) visibleNodes(doc, child, acc, stack);
}

function importedSvg(bytes: Uint8Array, filename: string) {
  return pagesFromFig(bytes, filename)
    .pages.flatMap((page) => page.objects.map((object) => object.svg))
    .join("\n");
}

function sourceGeometry(doc: FigDocument) {
  const document = doc.nodes.find((node) => node.type === "DOCUMENT");
  const canvases = childrenOf(doc, nodeId(document!) || "").filter((node) => node.type === "CANVAS" && node.internalOnly !== true);
  const paths: string[] = [];
  const glyphs: Array<{ d: string; transform: string }> = [];
  const images: Uint8Array[] = [];
  for (const canvas of canvases) {
    for (const top of childrenOf(doc, nodeId(canvas) || "")) {
      const nodes: FigNode[] = [];
      visibleNodes(doc, top, nodes);
      for (const node of nodes) {
        const vector = node.type === "VECTOR" || node.type === "STAR" || node.type === "POLYGON" || node.type === "REGULAR_POLYGON";
        if (vector || (node.strokeGeometry?.length ?? 0) > 0) {
          const resolved = resolveVectorNodePaths(doc, node);
          const list = vector ? [...resolved.fill, ...resolved.stroke] : resolved.stroke;
          for (const entry of list) {
            const d = cleanPath(entry.svgPath || "");
            if (d) paths.push(d);
          }
        }
        const text = node.textData as { glyphs?: Array<{ commandsBlob?: number; position?: { x: number; y: number }; fontSize?: number }> } | undefined;
        for (const glyph of text?.glyphs ?? []) {
          if (typeof glyph?.commandsBlob !== "number") continue;
          const bytes = getBlobBytes(doc, glyph.commandsBlob);
          if (!bytes) continue;
          const d = cleanPath(geometryBlobToSVGPath(bytes));
          if (!d) continue;
          const fontSize = glyph.fontSize || node.fontSize || 16;
          const em = pathIsEm(d);
          const scale = em ? fontSize : 1;
          glyphs.push({
            d,
            transform: `translate(${figNumber(glyph.position?.x ?? 0)} ${figNumber(glyph.position?.y ?? fontSize)}) scale(${figNumber(scale)} ${figNumber(em ? -scale : scale)})`,
          });
        }
        for (const paint of node.fillPaints || []) {
          if (paint.type === "IMAGE" && typeof paint.image?.dataBlob === "number") {
            const bytes = getBlobBytes(doc, paint.image.dataBlob);
            if (bytes) images.push(bytes);
          }
        }
      }
    }
  }
  return { paths, glyphs, images };
}

function pathIsEm(d: string) {
  const values = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  let max = 0;
  for (const value of values) max = Math.max(max, Math.abs(Number(value)));
  return max > 0 && max < 8;
}

describe("figma import fidelity", () => {
  it("copies every vector path exactly", () => {
    for (const [file, parse] of [
      ["OpenFigs.fig", parseFig],
      ["sample.fig", parseFigBinary],
      ["banks.fig", parseFigBinary],
    ] as const) {
      const bytes = fig(file);
      const svg = importedSvg(bytes, file);
      const { paths } = sourceGeometry(parse(bytes));
      const missing = paths.filter((d) => !svg.includes(`d="${d}"`));
      expect(paths.length, file).toBeGreaterThan(0);
      expect(missing, file).toEqual([]);
    }
    const open = sourceGeometry(parseFig(fig("OpenFigs.fig")));
    expect(open.paths).toHaveLength(20);
    const banks = sourceGeometry(parseFigBinary(fig("banks.fig")));
    expect(banks.paths).toHaveLength(398);
  });

  it("embeds each raster byte-for-byte and keeps its crop", () => {
    const bytes = fig("sample.fig");
    const svg = importedSvg(bytes, "sample.fig");
    const { images } = sourceGeometry(parseFigBinary(bytes));
    const unique = [...new Map(images.map((image) => [Buffer.from(image).toString("base64"), image])).values()];
    expect(unique).toHaveLength(4);
    for (const image of unique) {
      expect(image.length).toBeGreaterThan(1000);
      const mime = image[0] === 0x89 && image[1] === 0x50 ? "image/png" : "image/jpeg";
      expect(svg).toContain(`data:${mime};base64,${Buffer.from(image).toString("base64")}`);
    }
    const doc = readFig(bytes);
    const photo = doc.nodes.find((node) => node.name === "20161507112601 1");
    const paint = photo?.fillPaints?.find((entry) => entry.type === "IMAGE");
    expect(paint?.transform).toBeTruthy();
    const transform = paint!.transform!;
    const width = photo!.size!.x;
    const height = photo!.size!.y;
    const det = transform.m00 * transform.m11 - transform.m01 * transform.m10;
    const matrix = [
      (transform.m11 / det) * width,
      (-transform.m10 / det) * height,
      (-transform.m01 / det) * width,
      (transform.m00 / det) * height,
      ((transform.m01 * transform.m12 - transform.m11 * transform.m02) / det) * width,
      ((transform.m10 * transform.m02 - transform.m00 * transform.m12) / det) * height,
    ].map(figNumber);
    expect(svg).toContain(`matrix(${matrix.join(" ")})`);
  });

  it("places glyph outlines on the Figma baselines", () => {
    const bytes = fig("sample.fig");
    const svg = importedSvg(bytes, "sample.fig");
    const { glyphs } = sourceGeometry(parseFigBinary(bytes));
    expect(glyphs).toHaveLength(64);
    for (const glyph of glyphs) {
      expect(svg).toContain(`d="${glyph.d}"`);
      expect(svg).toContain(glyph.transform);
    }
    expect(svg).not.toContain('d="Z');
  });

  it("keeps frame size, child position, and solid color exactly", () => {
    const circle = pagesFromFig(fig("circle.fig"), "circle.fig").pages[0]?.objects[0];
    expect(circle).toMatchObject({ name: "Frame 1", width: 350, height: 350 });
    expect(circle?.svg).toContain('width="350" height="350" viewBox="0 0 350 350"');
    expect(circle?.svg).toContain('fill="#ededed"');
    expect(circle?.svg).toContain('fill="#ff0000"');
    expect(circle?.svg).toContain("matrix(1 0 0 1 25 25)");
    expect(circle?.svg).toContain('d="M300 150A150 150 0 1 0 0 150A150 150 0 1 0 300 150Z"');

    const sample = pagesFromFig(fig("sample.fig"), "sample.fig").pages[0]?.objects ?? [];
    expect(sample.find((object) => object.name === "20161507112601 1")).toMatchObject({ width: 146, height: 175 });
    expect(sample.some((object) => object.svg.includes('feDropShadow dx="0" dy="1" stdDeviation="3" flood-color="#000000" flood-opacity="0.1"'))).toBe(true);
  });

  it("keeps multi-page frame spacing identical to Figma", () => {
    const pages = pagesFromFig(fig("banks.fig"), "banks.fig").pages;
    const readme = pages.find((page) => page.name.endsWith("Read Me")) as FigImportPage;
    const farsi = readme.objects.find((object) => object.name === "Farsi");
    const english = readme.objects.find((object) => object.name === "English");
    expect(farsi && english && english.x - farsi.x).toBe(450);
    expect(farsi && english && english.y - farsi.y).toBe(0);
    expect(farsi).toMatchObject({ width: 400, height: 400 });
    expect(english).toMatchObject({ width: 400, height: 400 });

    const logos = pages.find((page) => page.name.endsWith("Iran Banks")) as FigImportPage;
    const byName = new Map(logos.objects.map((object) => [object.name, object]));
    const color = byName.get("Banks (Multicolor)");
    const mono = byName.get("Bank (Monocolor)");
    const gateways = byName.get("Gateways (Multicolor)");
    expect(mono && color && mono.x - color.x).toBe(2676);
    expect(mono && color && mono.y - color.y).toBe(0);
    expect(gateways && color && gateways.y - color.y).toBe(1211);
    expect(gateways && color && gateways.x - color.x).toBe(0);
    expect(color).toMatchObject({ width: 2476, height: 1011 });
  });
});

describe("figma import pixels", () => {
  let page: Page;
  let browser: Awaited<ReturnType<typeof chromium.launch>>;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ deviceScaleFactor: 1 });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("paints the circle frame and ellipse as solid source colors", async () => {
    const svg = pagesFromFig(fig("circle.fig"), "circle.fig").pages[0]?.objects[0]?.svg ?? "";
    const colors = await page.evaluate(async (source) => {
      const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("svg"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("canvas");
      context.drawImage(img, 0, 0);
      return {
        width: canvas.width,
        height: canvas.height,
        corner: [...context.getImageData(10, 10, 1, 1).data],
        center: [...context.getImageData(175, 175, 1, 1).data],
      };
    }, svg);
    expect(colors).toMatchObject({ width: 350, height: 350, corner: [237, 237, 237, 255], center: [255, 0, 0, 255] });
  });

  it("paints vector fills and leaves the icon background clear", async () => {
    const svg = pagesFromFig(fig("OpenFigs.fig"), "OpenFigs.fig").pages[0]?.objects[0]?.svg ?? "";
    const image = await page.evaluate(async (source) => {
      const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" }));
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("svg"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("canvas");
      context.drawImage(img, 0, 0);
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let white = 0;
      let clear = 0;
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] === 0) clear += 1;
        else if (data[i - 3] > 250 && data[i - 2] > 250 && data[i - 1] > 250) white += 1;
      }
      return { width: canvas.width, height: canvas.height, white, clear };
    }, svg);
    expect(image).toMatchObject({ width: 546, height: 587 });
    expect(image.white).toBeGreaterThan(1000);
    expect(image.clear).toBeGreaterThan(1000);
  });

  it("paints text outlines and the cropped photo at the source pixel", async () => {
    const bytes = fig("sample.fig");
    const objects = pagesFromFig(bytes, "sample.fig").pages[0]?.objects ?? [];
    const doc = parseFigBinary(bytes);
    const photo = doc.nodes.find((node) => node.name === "20161507112601 1");
    const paint = photo?.fillPaints?.find((entry) => entry.type === "IMAGE");
    const jpeg = getBlobBytes(doc, paint?.image?.dataBlob);
    const photoObject = objects.find((object) => object.name === "20161507112601 1");
    const label = objects.find((object) => object.name === "Cappuccino");
    const x = Math.round((photoObject?.width ?? 0) / 2);
    const y = Math.round((photoObject?.height ?? 0) / 2);
    const result = await page.evaluate(
      async ({ svg, label: labelSvg, jpeg: encoded, transform, x, y }) => {
        const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("svg"));
          img.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("canvas");
        context.drawImage(img, 0, 0);
        const labelUrl = URL.createObjectURL(new Blob([labelSvg], { type: "image/svg+xml" }));
        const labelImage = new Image();
        await new Promise<void>((resolve, reject) => {
          labelImage.onload = () => resolve();
          labelImage.onerror = () => reject(new Error("label"));
          labelImage.src = labelUrl;
        });
        const labelCanvas = document.createElement("canvas");
        labelCanvas.width = labelImage.naturalWidth;
        labelCanvas.height = labelImage.naturalHeight;
        const labelContext = labelCanvas.getContext("2d", { willReadFrequently: true });
        if (!labelContext) throw new Error("canvas");
        labelContext.drawImage(labelImage, 0, 0);
        const labelPixels = labelContext.getImageData(0, 0, labelCanvas.width, labelCanvas.height).data;
        let dark = 0;
        for (let i = 0; i < labelPixels.length; i += 4) {
          if (labelPixels[i] < 40 && labelPixels[i + 3] > 200) dark += 1;
        }
        const photo = new Image();
        await new Promise<void>((resolve, reject) => {
          photo.onload = () => resolve();
          photo.onerror = () => reject(new Error("jpeg"));
          photo.src = `data:image/jpeg;base64,${encoded}`;
        });
        const photoCanvas = document.createElement("canvas");
        photoCanvas.width = photo.naturalWidth;
        photoCanvas.height = photo.naturalHeight;
        const photoContext = photoCanvas.getContext("2d", { willReadFrequently: true });
        if (!photoContext) throw new Error("canvas");
        photoContext.drawImage(photo, 0, 0);
        const u = transform.m00 * 0.5 + transform.m01 * 0.5 + transform.m02;
        const v = transform.m10 * 0.5 + transform.m11 * 0.5 + transform.m12;
        const ix = Math.max(0, Math.min(photo.naturalWidth - 1, Math.round(u * (photo.naturalWidth - 1))));
        const iy = Math.max(0, Math.min(photo.naturalHeight - 1, Math.round(v * (photo.naturalHeight - 1))));
        return {
          width: canvas.width,
          height: canvas.height,
          rendered: [...context.getImageData(x, y, 1, 1).data],
          source: [...photoContext.getImageData(ix, iy, 1, 1).data],
          glyph: { width: labelCanvas.width, height: labelCanvas.height },
          dark,
        };
      },
      { svg: photoObject?.svg ?? "", label: label?.svg ?? "", jpeg: Buffer.from(jpeg!).toString("base64"), transform: paint!.transform!, x, y },
    );
    expect(result).toMatchObject({ width: 146, height: 175 });
    expect(result.glyph?.width ?? 0).toBeGreaterThan(4);
    expect(result.glyph?.height ?? 0).toBeGreaterThan(6);
    expect(result.dark).toBeGreaterThan(0);
    expect(Math.abs(result.rendered[0] - result.source[0])).toBeLessThanOrEqual(8);
    expect(Math.abs(result.rendered[1] - result.source[1])).toBeLessThanOrEqual(8);
    expect(Math.abs(result.rendered[2] - result.source[2])).toBeLessThanOrEqual(8);
    expect(result.rendered[3]).toBe(255);
  }, 20_000);
});
