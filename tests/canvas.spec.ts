import { expect, test, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function login(page: Page, email = "admin@test.dev") {
  await page.goto("/sign-in");
  const response = await page.evaluate(async (value) => {
    const result = await fetch("/api/auth/dev-login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: value }),
    });
    return result.status;
  }, email);
  expect(response).toBe(200);
  await page.goto("/");
}

test("refuses someone who is not on the list", async ({ page }) => {
  await login(page, "stranger@test.dev");
  await expect(page.getByTestId("not-allowed")).toBeVisible();
  const status = await page.evaluate(async () => (await fetch("/api/boards")).status);
  expect(status).toBe(401);
});

test("keeps boards private", async ({ page }) => {
  await login(page);
  await page.goto("/people");
  await page.getByTestId("people-email").fill("other@test.dev");
  await page.getByRole("button", { name: "Add" }).click();
  await page.goto("/");
  await page.getByTestId("new-board").click();
  await page.waitForURL(/\/boards\//);
  const boardUrl = page.url();
  await page.context().clearCookies();
  await login(page, "other@test.dev");
  const response = await page.goto(boardUrl);
  expect(response?.status()).toBe(404);
});

test.describe("desktop canvas", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 900);

  test("arranges, saves, and exports", async ({ page }) => {
    await login(page);
    await page.getByTestId("new-board").click();
    await page.waitForURL(/\/boards\//);
    await page.getByLabel("Board name").fill("Desktop");
    await page.getByLabel("Board name").blur();

    await page.getByTestId("file-input").setInputFiles({
      name: "dot.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    const image = page.locator("[data-type='image']");
    await expect(image).toBeVisible();
    await expect(page.getByTestId("save-status")).toHaveText("Saved");
    const before = Number(await image.getAttribute("data-x"));

    const box = await image.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + 80, box!.y + box!.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId("save-status")).toHaveText("Saved");
    await expect.poll(async () => Number(await image.getAttribute("data-x"))).not.toBe(before);

    await page.reload();
    await expect(page.locator("[data-type='image']")).toBeVisible();
    const after = Number(await page.locator("[data-type='image']").getAttribute("data-x"));
    expect(after).not.toBe(before);

    const canvas = page.getByTestId("viewport");
    const canvasBox = await canvas.boundingBox();
    await page.getByTestId("frame-tool").click();
    await page.mouse.move(canvasBox!.x + 80, canvasBox!.y + 80);
    await page.mouse.down();
    await page.mouse.move(canvasBox!.x + 280, canvasBox!.y + 220, { steps: 6 });
    await page.mouse.up();
    const frame = page.locator("[data-type='frame']");
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute("data-selected", "true");
    await expect(page.getByTestId("frame-tool")).toHaveClass(/bg-stone-900/);

    await page.getByRole("button", { name: "Move" }).click();
    const empty = await canvas.boundingBox();
    await page.mouse.click(empty!.x + empty!.width - 40, empty!.y + 40);
    await expect(frame).toHaveAttribute("data-selected", "false");
    await frame.click();
    await expect(frame).toHaveAttribute("data-selected", "true");

    const imageBox = await page.locator("[data-type='image']").boundingBox();
    await page.locator("[data-type='image']").click();
    await expect(page.locator("[data-type='image']")).toHaveAttribute("data-selected", "true");
    const handle = page.locator(".moveable-rotation-control, .moveable-rotation");
    if (await handle.count()) {
      const handleBox = await handle.first().boundingBox();
      if (handleBox && imageBox) {
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(imageBox.x + imageBox.width + 30, imageBox.y - 20, { steps: 6 });
        await page.mouse.up();
        await expect(page.getByTestId("save-status")).toHaveText("Saved");
      }
    }

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-png").click();
    const download = await downloadPromise;
    const png = readFileSync(await download.path());
    expect(png.readUInt32BE(16)).toBeGreaterThan(32);
    expect(png.readUInt32BE(20)).toBeGreaterThan(32);

    const zoomCanvas = await page.getByTestId("viewport").boundingBox();
    await page.mouse.move(zoomCanvas!.x + zoomCanvas!.width / 2, zoomCanvas!.y + zoomCanvas!.height / 2);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -200);
    await page.keyboard.up("Control");
    await expect(page.getByTestId("zoom-label")).not.toHaveText("100%");
  });

  test("drops an image into a frame", async ({ page }) => {
    await login(page);
    await page.getByTestId("new-board").click();
    await page.waitForURL(/\/boards\//);
    const frame = page.locator("[data-type='frame']");
    const canvas = page.getByTestId("viewport");
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    await page.getByTestId("frame-tool").click();
    await page.mouse.move(box!.x + 80, box!.y + 80);
    await page.mouse.down();
    await page.mouse.move(box!.x + 360, box!.y + 300, { steps: 8 });
    await page.mouse.up();
    await expect(frame).toBeVisible();
    await page.getByRole("button", { name: "Move" }).click();
    await page.getByTestId("file-input").setInputFiles({
      name: "dot.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    const image = page.locator("[data-type='image']");
    await expect(image).toBeVisible();
    const start = await image.boundingBox();
    const frameBox = await frame.boundingBox();
    expect(start && frameBox).toBeTruthy();
    await image.click();
    await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
    await page.mouse.down();
    await page.mouse.move(frameBox!.x + frameBox!.width / 2, frameBox!.y + frameBox!.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(page.getByTestId("save-status")).toHaveText("Saved");
    await expect(image).toHaveAttribute("data-parent", /.+/, { timeout: 5000 });
    const parent = await image.getAttribute("data-parent");
    await page.reload();
    await expect(page.locator("[data-type='image']")).toHaveAttribute("data-parent", parent!);
  });

  test("exports two boards as a two-page PDF", async ({ page }) => {
    await login(page);
    await page.goto("/");
    const stamp = Date.now();
    const ids: string[] = [];
    for (const name of [`Alpha ${stamp}`, `Beta ${stamp}`]) {
      const id = await page.evaluate(async (boardName) => {
        const response = await fetch("/api/boards", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: boardName }),
        });
        const created = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(created));
        return created.board.id as string;
      }, name);
      ids.push(id);
      await page.goto(`/boards/${id}`);
      await page.getByTestId("frame-tool").click();
      const canvas = page.getByTestId("viewport");
      const box = await canvas.boundingBox();
      await page.mouse.move(box!.x + 80, box!.y + 80);
      await page.mouse.down();
      await page.mouse.move(box!.x + 280, box!.y + 220, { steps: 6 });
      await page.mouse.up();
      await expect(page.locator("[data-type='frame']")).toBeVisible();
      await expect(page.getByTestId("save-status")).toHaveText("Saved");
    }
    await page.goto("/");
    await page.getByRole("checkbox", { name: `Select Alpha ${stamp}` }).check();
    await page.getByRole("checkbox", { name: `Select Beta ${stamp}` }).check();
    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("export-boards-pdf").click();
    const download = await downloadPromise;
    const pdf = await PDFDocument.load(readFileSync(await download.path()));
    expect(pdf.getPageCount()).toBe(2);
  });
});

test.describe("phone canvas", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) >= 900);

  test("pans with one finger and pinches to zoom", async ({ page }) => {
    await login(page);
    await page.getByTestId("new-board").click();
    await page.waitForURL(/\/boards\//);
    const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
    if (coarse) await page.getByTitle("Pan with one finger").click();
    const canvas = page.getByTestId("viewport");
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + 40, box!.y + 80);
    await page.mouse.down();
    await page.mouse.move(box!.x + 140, box!.y + 160, { steps: 6 });
    await page.mouse.up();
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect(page.getByTestId("zoom-label")).not.toHaveText("100%");
  });
});
