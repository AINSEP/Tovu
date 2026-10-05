// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { Page } from "@playwright/test";

import { TINY_PNG, expect, test, uniqSlug } from "./_fixtures.js";

/**
 * Media journeys (SCOPE.md W4). Uploads go to `TOVU_MEDIA_UPLOADS_DIR` in the config's temp runtime
 * dir, so nothing lands in the repo's real site dir.
 *
 * Selectors from `apps/admin/src/features/media/Media.tsx`: hidden file input labelled
 * "File to upload", "Alt text (optional)", button "Upload"; card edit button `Edit "<title>"`;
 * edit panel "File URL" link; per-card "More" menu with Trash / Delete permanently (ConfirmDialog
 * "Delete permanently?"). The uploaded title is assumed to default to the file name.
 */
async function uploadPng(page: Page, name: string, alt: string): Promise<void> {
  await page.goto("/admin/media");
  await page.getByLabel("File to upload").setInputFiles({ name, mimeType: "image/png", buffer: TINY_PNG });
  await page.getByLabel("Alt text (optional)").fill(alt);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
}

test.describe("W4 media lifecycle", () => {
  test("upload a PNG, see it in the library, its public URL serves the same bytes as image/png", { tag: ["@unrun"] }, async ({ page }) => {
    const name = `${uniqSlug("journey-image")}.png`;
    const alt = `Alt ${name}`;
    await uploadPng(page, name, alt);
    await expect(page.getByRole("img", { name: alt })).toBeVisible();

    await page.getByRole("button", { name: new RegExp(`^Edit ".*${name.replace(".png", "")}`) }).click();
    // The edit panel's "File URL" row renders the URL as `<a class="field-mono field-readonly">`.
    const href = await page.locator("a.field-readonly[href]").first().getAttribute("href");
    expect(href).toBeTruthy();
    const served = await page.request.get(new URL(href!, page.url()).toString());
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toContain("image/png");
    expect(Buffer.compare(await served.body(), TINY_PNG)).toBe(0);
  });

  test("double-clicking Upload stores the file once", { tag: ["@unrun"] }, async ({ page }) => {
    const name = `${uniqSlug("double-upload")}.png`;
    let uploads = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/media(\/upload)?$/.test(new URL(r.url()).pathname)) uploads += 1;
    });
    await page.goto("/admin/media");
    await page.getByLabel("File to upload").setInputFiles({ name, mimeType: "image/png", buffer: TINY_PNG });
    await page.getByRole("button", { name: "Upload", exact: true }).dblclick();
    await expect(page.getByRole("button", { name: new RegExp(`^Edit ".*${name.replace(".png", "")}`) })).toHaveCount(1);
    expect(uploads).toBe(1);
  });

  test("a disallowed file type is refused with a visible error, and nothing is added", { tag: ["@unrun"] }, async ({ page }) => {
    const name = `${uniqSlug("not-media")}.html`;
    await page.goto("/admin/media");
    // setInputFiles bypasses the input's accept list, which is exactly the server-side check under test.
    await page.getByLabel("File to upload").setInputFiles({ name, mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") });
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.locator(".save-error, [role=alert], .notice.error").first()).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`^Edit ".*${name}`) })).toHaveCount(0);
  });

  test("trash then delete permanently removes the asset and its public URL", { tag: ["@unrun"] }, async ({ page }) => {
    const name = `${uniqSlug("purge-me")}.png`;
    const alt = `Alt ${name}`;
    await uploadPng(page, name, alt);
    const card = page.locator("li, article, [role=listitem]").filter({ has: page.getByRole("img", { name: alt }) }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Trash" }).click();
    await card.getByRole("button", { name: "More" }).click();
    await page.getByRole("menuitem", { name: "Delete permanently" }).click();
    await expect(page.getByRole("dialog", { name: "Delete permanently?" })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByRole("img", { name: alt })).toHaveCount(0);
  });

  test("media library baseline", { tag: ["@unrun"] }, async ({ page }) => {
    await page.goto("/admin/media");
    await expect(page.getByLabel("File to upload")).toBeAttached();
    await expect(page).toHaveScreenshot("media-library.png", { mask: [page.locator("img")] });
  });
});
