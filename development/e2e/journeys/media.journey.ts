// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { APIRequestContext, Locator, Page } from "@playwright/test";

import { TINY_PNG, WS_API, expect, test, uniqSlug } from "./_fixtures.js";

/**
 * Media journeys (SCOPE.md W4). Uploads go to `TOVU_MEDIA_UPLOADS_DIR` in the config's temp runtime
 * dir, so nothing lands in the repo's real site dir.
 *
 * Selectors from `apps/admin/src/features/media/Media.tsx`: page button "Upload image" opens the
 * "Upload image" dialog (2026-10-13) holding the hidden file input labelled "File to upload",
 * "Alt text (optional)" and submit "Upload"; it closes after a successful upload. Card edit button `Edit "<title>"`;
 * edit panel "File URL" link; per-card `RowMenu` (`@jini-ai/admin/react`) whose trigger is named
 * `Actions for "<title>"`, with menuitems "Trash" / "Delete permanently" (ConfirmDialog
 * "Delete permanently?"). Cards are plain `<div class="media-card">` with no list-item role, so
 * the journeys address a card through its own named buttons, not a card container. The uploaded
 * title is the file name minus its extension (`deriveTitleFromFilename`, `@jini-ai/cms/media`).
 *
 * Public URLs: an image's "File URL" is its `"public"` core transform rendition
 * (`/m/{key}/public.v{n}/image.webp`, `features/media/public-path.ts`), served by the SITE server
 * (`journeySite.apiURL`), not the Vite admin origin, which only proxies `/api`. That rendition is a WebP
 * re-encode, so original bytes are checked separately through the admin original-file endpoint.
 */
/** Opens the "Upload image" dialog; its fields are scoped to it (the import dialog also has an alt label). */
async function openUpload(page: Page): Promise<Locator> {
  await page.goto("/admin/media");
  await page.getByRole("button", { name: "Upload image", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Upload image" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function uploadPng(page: Page, name: string, alt: string): Promise<void> {
  const dialog = await openUpload(page);
  await dialog.getByLabel("File to upload").setInputFiles({ name, mimeType: "image/png", buffer: TINY_PNG });
  await dialog.getByLabel("Alt text (optional)", { exact: true }).fill(alt);
  await dialog.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** Trash then hard-delete (the purge route 409s on an untrashed asset) every asset with one of these titles. */
async function purgeByTitle(request: APIRequestContext, titles: string[]): Promise<void> {
  const listed = await request.get(`${WS_API}/media`);
  expect(listed.status()).toBe(200);
  for (const { id } of ((await listed.json()) as { media: Array<{ id: string; title: string }> }).media.filter((m) => titles.includes(m.title))) {
    expect((await request.post(`${WS_API}/media/${id}/trash`)).status()).toBe(200);
    expect((await request.delete(`${WS_API}/media/${id}`)).status()).toBe(200);
  }
}

test.describe("W4 media lifecycle", () => {
  // Uploads this file's tests leave behind, removed after each test so the library baseline below
  // shows the same empty library whether it runs alone or after the upload tests.
  const uploaded: string[] = [];
  test.beforeEach(async ({ journeySite }) => {
    expect(journeySite.database, "Media requires SQLite first-boot core transforms").toBe("sqlite");
  });
  test.afterEach(async ({ request }) => {
    await purgeByTitle(request, uploaded.splice(0));
  });

  test("upload a PNG, see it in the library, its public URL serves a WebP rendition and the original keeps its bytes", { tag: ["@unrun"] }, async ({ page, journeySite }) => {
    const name = `${uniqSlug("journey-image")}.png`;
    const title = name.replace(/\.png$/, "");
    const alt = `Alt ${name}`;
    uploaded.push(title);
    await uploadPng(page, name, alt);
    await expect(page.locator(`img[alt="${alt}"]`)).toBeVisible();

    await page.getByRole("button", { name: `Edit "${title}"`, exact: true }).click();
    // The edit panel's "File URL" row renders the URL as `<a class="field-mono field-readonly">`. The
    // row only renders when the server resolved a `publicUrl`, which needs the workspace's "public"
    // core transform registered (`ensureCoreMediaTransform`).
    const href = await page.locator("a.field-readonly[href]").first().getAttribute("href");
    expect(href).toMatch(/^\/m\/[^/]+\/public\.v\d+\/image\.webp$/);
    const served = await page.request.get(new URL(href!, journeySite.apiURL).toString());
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
    uploaded.push(name.replace(/\.png$/, ""));
    let uploads = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/media(\/upload)?$/.test(new URL(r.url()).pathname)) uploads += 1;
    });
    const dialog = await openUpload(page);
    await dialog.getByLabel("File to upload").setInputFiles({ name, mimeType: "image/png", buffer: TINY_PNG });
    await dialog.getByRole("button", { name: "Upload", exact: true }).dblclick();
    await expect(page.getByRole("button", { name: new RegExp(`^Edit ".*${name.replace(".png", "")}`) })).toHaveCount(1);
    expect(uploads).toBe(1);
  });

  test("a disallowed file type is refused with a visible error, and nothing is added", { tag: ["@unrun"] }, async ({ page }) => {
    const name = `${uniqSlug("not-media")}.html`;
    const dialog = await openUpload(page);
    // setInputFiles bypasses the input's accept list, which is exactly the server-side check under test.
    await dialog.getByLabel("File to upload").setInputFiles({ name, mimeType: "text/html", buffer: Buffer.from("<script>alert(1)</script>") });
    await dialog.getByRole("button", { name: "Upload", exact: true }).click();
    // The refusal shows inside the dialog, which stays open for a retry.
    await expect(dialog.getByRole("alert")).toBeVisible();
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
    await expect(page.getByRole("button", { name: "Upload image", exact: true })).toBeVisible();
    await expect(page).toHaveScreenshot("media-library.png", { mask: [page.locator("img")] });
  });
});
