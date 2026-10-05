// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { Page } from "@playwright/test";

import { PUBLIC_URL, TINY_PNG, WS_API, expect, test, uniqSlug } from "./_fixtures.js";

/**
 * Media journeys (SCOPE.md W4). Uploads go to `TOVU_MEDIA_UPLOADS_DIR` in the config's temp runtime
 * dir, so nothing lands in the repo's real site dir.
 *
 * Selectors from `apps/admin/src/features/media/Media.tsx`: hidden file input labelled
 * "File to upload", "Alt text (optional)", button "Upload"; card edit button `Edit "<title>"`;
 * edit panel "File URL" link; per-card `RowMenu` (`@jini-ai/admin/react`) whose trigger is named
 * `Actions for "<title>"`, with menuitems "Trash" / "Delete permanently" (ConfirmDialog
 * "Delete permanently?"). Cards are plain `<div class="media-card">` with no list-item role, so
 * the journeys address a card through its own named buttons, not a card container. The uploaded
 * title is the file name minus its extension (`deriveTitleFromFilename`, `@jini-ai/cms/media`).
 *
 * Public URLs: an image's "File URL" is its `"public"` core transform rendition
 * (`/m/{key}/public.v{n}/image.webp`, `features/media/public-path.ts`), served by the SITE server
 * (`PUBLIC_URL`), not the Vite admin origin, which only proxies `/api`. That rendition is a WebP
 * re-encode, so original bytes are checked separately through the admin original-file endpoint.
 */
async function uploadPng(page: Page, name: string, alt: string): Promise<void> {
  await page.goto("/admin/media");
  await page.getByLabel("File to upload").setInputFiles({ name, mimeType: "image/png", buffer: TINY_PNG });
  await page.getByLabel("Alt text (optional)").fill(alt);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
}

test.describe("W4 media lifecycle", () => {
  test("upload a PNG, see it in the library, its public URL serves a WebP rendition and the original keeps its bytes", { tag: ["@unrun"] }, async ({ page }) => {
    const name = `${uniqSlug("journey-image")}.png`;
    const title = name.replace(/\.png$/, "");
    const alt = `Alt ${name}`;
    await uploadPng(page, name, alt);
    await expect(page.locator(`img[alt="${alt}"]`)).toBeVisible();

    await page.getByRole("button", { name: `Edit "${title}"`, exact: true }).click();
    // The edit panel's "File URL" row renders the URL as `<a class="field-mono field-readonly">`. The
    // row only renders when the server resolved a `publicUrl`, which needs the workspace's "public"
    // core transform registered (`ensureCoreMediaTransform`).
    const href = await page.locator("a.field-readonly[href]").first().getAttribute("href");
    expect(href).toMatch(/^\/m\/[^/]+\/public\.v\d+\/image\.webp$/);
    const served = await page.request.get(new URL(href!, PUBLIC_URL).toString());
    expect(served.status()).toBe(200);
    expect(served.headers()["content-type"]).toContain("image/webp");
    expect((await served.body()).byteLength).toBeGreaterThan(0);

    const listed = await page.request.get(`${WS_API}/media`);
    expect(listed.status()).toBe(200);
    const asset = ((await listed.json()) as { media: Array<{ id: string; alt: string; publicUrl: string | null }> }).media.find((m) => m.alt === alt);
    expect(asset, "the uploaded asset is listed").toBeDefined();
    expect(asset!.publicUrl).toBe(href);
    const original = await page.request.get(`${WS_API}/media/${asset!.id}/original`);
    expect(original.status()).toBe(200);
    expect(original.headers()["content-type"]).toContain("image/png");
    expect(Buffer.compare(await original.body(), TINY_PNG)).toBe(0);
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
    const title = name.replace(/\.png$/, "");
    await uploadPng(page, name, alt);
    const image = page.locator(`img[alt="${alt}"]`);
    await expect(image).toBeVisible();
    const actions = page.getByRole("button", { name: `Actions for "${title}"`, exact: true });
    await actions.click();
    await page.getByRole("menuitem", { name: "Trash", exact: true }).click();
    // A trashed asset stays in the grid; its row menu swaps "Trash" for "Delete permanently".
    await actions.click();
    await page.getByRole("menuitem", { name: "Delete permanently", exact: true }).click();
    const confirm = page.getByRole("dialog", { name: "Delete permanently?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Delete permanently", exact: true }).click();
    await expect(image).toHaveCount(0);
    await expect(actions).toHaveCount(0);
  });

  test("media library baseline", { tag: ["@unrun"] }, async ({ page }) => {
    await page.goto("/admin/media");
    await expect(page.getByLabel("File to upload")).toBeAttached();
    await expect(page).toHaveScreenshot("media-library.png", { mask: [page.locator("img")] });
  });
});
