import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pagesFromFig } from "@/lib/figma/pages";

function fig(name: string) {
  return new Uint8Array(readFileSync(path.join(process.cwd(), "src/lib/figma/fixtures", name)));
}

describe("figma import", () => {
  it("rejects a file that is not a figma document", () => {
    expect(() => pagesFromFig(new Uint8Array([1, 2, 3, 4]), "notes.txt")).toThrow(/isn't a Figma/);
  });

  it("turns a zipped design into one board and keeps the ellipse color", () => {
    const { pages } = pagesFromFig(fig("circle.fig"), "circle.fig");
    expect(pages).toHaveLength(1);
    expect(pages[0]?.name).toBe("circle");
    expect(pages[0]?.objects).toHaveLength(1);
    const frame = pages[0]?.objects[0];
    expect(frame?.name).toBe("Frame 1");
    expect(frame?.width).toBeGreaterThanOrEqual(350);
    expect(frame?.height).toBeGreaterThanOrEqual(350);
    expect((frame?.x ?? 0) + (frame?.width ?? 0) / 2).toBeCloseTo(0, 0);
    expect(frame?.svg).toContain("#ff0000");
    expect(frame?.svg).toContain("#ededed");
  });

  it("renders vector artwork from a zipped file", () => {
    const { pages } = pagesFromFig(fig("OpenFigs.fig"), "OpenFigs.fig");
    expect(pages).toHaveLength(1);
    const art = pages[0]?.objects[0];
    expect(art?.name).toBe("WhiteOpenFigOutlinedIcon");
    expect(art?.svg.match(/<path /g)?.length ?? 0).toBeGreaterThan(10);
  });

  it("splits a screen into separate photos, labels, and cards", () => {
    const { pages } = pagesFromFig(fig("sample.fig"), "sample.fig");
    expect(pages.map((page) => page.name)).toEqual(["sample"]);
    const objects = pages[0]?.objects ?? [];
    expect(objects.length).toBeGreaterThan(10);
    const photo = objects.find((object) => object.name === "20161507112601 1");
    const label = objects.find((object) => object.name === "Cappuccino");
    expect(photo).toMatchObject({ width: 146, height: 175 });
    expect(photo?.svg).toContain("data:image/jpeg;base64,");
    expect(label?.svg).toContain("scale(14 -14)");
    expect(label?.width).toBeLessThan(100);
    expect(objects.some((object) => object.svg.includes("feDropShadow"))).toBe(true);
  });

  it("splits pages into separate logos you can move on their own", () => {
    const { pages } = pagesFromFig(fig("banks.fig"), "banks.fig");
    expect(pages.map((page) => page.name)).toEqual(["banks — Cover", "banks — Read Me", "banks — Iran Banks"]);
    const readme = pages[1];
    const farsi = readme?.objects.find((object) => object.name === "Farsi");
    const english = readme?.objects.find((object) => object.name === "English");
    expect(farsi && english && english.x - farsi.x).toBe(450);
    expect(farsi && english && english.y - farsi.y).toBe(0);
    const coverLogo = pages[0]?.objects.find((object) => object.name === "Bank / Saman / Color");
    expect(coverLogo).toMatchObject({ width: 20, height: 20 });
    expect(coverLogo?.svg).toContain("scale(0.417 0.417)");
    const logos = pages[2]?.objects ?? [];
    expect(logos.length).toBeGreaterThan(40);
    const multicolor = logos.find((object) => object.name === "Banks (Multicolor)");
    const monocolor = logos.find((object) => object.name === "Bank (Monocolor)");
    expect(multicolor).toMatchObject({ type: "frame", color: "#f5f5f5" });
    expect(monocolor).toMatchObject({ type: "frame", color: "#616161" });
    const ansar = logos.find((object) => object.name === "Bank / Ansar / Color");
    expect(ansar).toMatchObject({ type: "image", width: 48, height: 48, parentKey: multicolor?.key });
  });
});
