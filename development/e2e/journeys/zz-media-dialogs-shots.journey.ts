// SCRATCH (media-dialogs lane, 2026-10-13): before/after captures; deleted before commit.
import { writeFileSync } from "node:fs";
import { TINY_PNG, WS_API, expect, test } from "./_fixtures.js";

const DIR = process.env.SHOT_DIR!;
const TAG = process.env.SHOT_TAG ?? "x";
const SIZES = [[375, 667], [834, 1112], [1280, 900]] as const;

test("media dialogs shots", async ({ page, request }) => {
  test.setTimeout(240_000);
  const ids: string[] = [];
  for (const n of [1, 2]) {
    const res = await request.post(`${WS_API}/media`, { data: { filename: `shot-${Date.now()}-${n}.png`, contentType: "image/png", dataBase64: TINY_PNG.toString("base64") } });
    expect(res.ok(), await res.text()).toBe(true);
    ids.push((await res.json()).media.id);
  }
  const metrics: Record<string, unknown> = {};
  try {
    for (const [w, h] of SIZES) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("/admin/media");
      await expect(page.getByRole("heading", { name: "Media", exact: true })).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `${DIR}/${TAG}-${w}-page.png` });
      if (TAG === "before") continue;
      metrics[`${w}`] = await page.evaluate(() => Array.from(document.querySelectorAll(".media-actions > button")).map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.textContent, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }));
      await page.getByRole("button", { name: "Upload image", exact: true }).click();
      const up = page.getByRole("dialog", { name: "Upload image" });
      await expect(up).toBeVisible();
      metrics[`${w}-focus-upload`] = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
      await page.screenshot({ path: `${DIR}/${TAG}-${w}-upload-open.png` });
      await up.getByLabel("File to upload").setInputFiles({ name: "a-very-long-file-name-for-wrapping-check.png", mimeType: "image/png", buffer: TINY_PNG });
      await page.screenshot({ path: `${DIR}/${TAG}-${w}-upload-filled.png` });
      await page.keyboard.press("Escape");
      await expect(up).toBeHidden();
      metrics[`${w}-focus-return`] = await page.evaluate(() => document.activeElement?.textContent);
      await page.getByRole("button", { name: "Import from URL", exact: true }).click();
      const im = page.getByRole("dialog", { name: "Import from URL" });
      await expect(im).toBeVisible();
      await page.screenshot({ path: `${DIR}/${TAG}-${w}-import-open.png` });
      await im.getByLabel("Remote image URL").fill("http://example.com/a.png");
      await page.screenshot({ path: `${DIR}/${TAG}-${w}-import-invalid.png` });
      await im.getByRole("button", { name: "Cancel" }).click();
      await expect(im).toBeHidden();
    }
  } finally {
    writeFileSync(`${DIR}/${TAG}-metrics.json`, JSON.stringify(metrics, null, 2));
    for (const id of ids) {
      await request.post(`${WS_API}/media/${id}/trash`);
      await request.delete(`${WS_API}/media/${id}`);
    }
  }
});
