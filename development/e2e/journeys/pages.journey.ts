// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { Page } from "@playwright/test";

import { PUBLIC_URL, WS_API, expect, fetchPublic, hasHorizontalScroll, test, uniq } from "./_fixtures.js";

/**
 * Pages journeys (SCOPE.md W3) and the preview sandbox stress cases.
 *
 * Selectors from `apps/admin/src/features/pages/PageEditor.tsx` and the proven
 * `pages-editor.spec.ts`: "New Page", tabs "HTML"/"Preview", textbox "Page HTML"/"Page title",
 * iframe title "Page preview", "Saved" text after Save.
 *
 * Sandbox note: `PAGE_PREVIEW_IFRAME_SANDBOX` (`features/pages/rules.ts`) is
 * "allow-scripts allow-same-origin allow-forms allow-popups", i.e. no `allow-top-navigation`. These
 * tests assert the behaviour (admin URL unchanged after a top-navigation attempt from inside the
 * preview), not the flag string, because the flags are expected to change once previews move to
 * their own origin (todos, 2026-10-04).
 */
async function newPage(page: Page): Promise<string> {
  await page.goto("/admin/pages");
  await page.getByRole("button", { name: "New Page" }).click();
  await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);
  return page.url();
}

async function writeHtmlAndSave(page: Page, html: string): Promise<void> {
  await page.getByRole("tab", { name: "HTML" }).click();
  await page.getByRole("textbox", { name: "Page HTML" }).fill(html);
  await page.getByRole("button", { name: /^Save/ }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}

test.describe("W3 page lifecycle", () => {
  test("create an HTML page, publish it, and read it at /<slug> on the public site", { tag: ["@unrun"] }, async ({ page, request }) => {
    const marker = uniq("page-marker");
    await newPage(page);
    await page.getByRole("textbox", { name: "Page title" }).fill(uniq("Journey page"));
    await writeHtmlAndSave(page, `<main><h1 id="journey-h1">${marker}</h1></main>`);
    await page.getByRole("button", { name: "Publish" }).click();
    // A page's save notice is "Saved" for both Save and Publish (`pageSaveSuccessMessage`); the
    // status field and the public read below are what prove it published.
    await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue("published");
    await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
    await expect(page.locator(".save-ok")).toHaveText("Saved");
    const slug = await page.getByLabel("URL slug").inputValue();
    const live = await fetchPublic(request, `/${slug}`);
    expect(live.status).toBe(200);
    expect(live.html).toContain(marker);
  });

  test("page editor HTML and preview baselines", { tag: ["@unrun"] }, async ({ page }) => {
    await newPage(page);
    await writeHtmlAndSave(page, "<main><h1>Baseline page</h1><p>Fixed content for the visual baseline.</p></main>");
    await expect(page).toHaveScreenshot("page-editor-html.png", { mask: [page.getByLabel("URL slug")] });
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(page.frameLocator('iframe[title="Page preview"]').getByRole("heading", { name: "Baseline page" })).toBeVisible();
    await expect(page).toHaveScreenshot("page-editor-preview.png", { mask: [page.getByLabel("URL slug")] });
  });

  test("published page at phone width: no horizontal scroll on the public page or in the admin editor", { tag: ["@unrun"] }, async ({ page, request }) => {
    const created = await request.post(`${WS_API}/pages`, { data: { title: uniq("Phone page"), slug: uniq("phone-page").toLowerCase(), status: "published" } });
    expect(created.status()).toBe(201);
    const { id, slug } = (await created.json()).post as { id: string; slug: string };
    await request.put(`${WS_API}/pages/${id}/html`, { data: { html: `<main><h1>${"Verylongunbrokenword".repeat(8)}</h1></main>` } });
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto(`${PUBLIC_URL}/${slug}`);
    expect(await hasHorizontalScroll(page)).toBe(false);
    await page.goto(`/admin/pages/${id}`);
    await expect(page.getByRole("textbox", { name: "Page title" })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    await expect(page).toHaveScreenshot("page-editor-phone.png", { mask: [page.getByLabel("URL slug")] });
  });
});

test.describe("page preview sandbox", () => {
  // If the sandbox ever fails open, the escape lands on this local stub instead of the network.
  test.beforeEach(async ({ context }) => {
    await context.route("https://example.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>escaped</p>" }));
  });

  test("a target=_top link inside the preview does not navigate the admin", { tag: ["@unrun"] }, async ({ page }) => {
    const editorUrl = await newPage(page);
    await writeHtmlAndSave(page, '<main><a id="escape" href="https://example.com/escaped" target="_top">Escape to top</a></main>');
    await page.getByRole("tab", { name: "Preview" }).click();
    const preview = page.frameLocator('iframe[title="Page preview"]');
    await preview.getByRole("link", { name: "Escape to top" }).click();
    // The positive signal that the click was processed: the editor is still interactive.
    await expect(page.getByRole("tab", { name: "HTML" })).toBeVisible();
    expect(page.url()).toBe(editorUrl);
  });

  test("a script inside the preview cannot navigate window.top", { tag: ["@unrun"] }, async ({ page, pageErrors }) => {
    const editorUrl = await newPage(page);
    await writeHtmlAndSave(
      page,
      '<main><button id="go" onclick="try{window.top.location.href=\'https://example.com/escaped-by-script\'}catch(e){document.body.dataset.blocked=\'1\'}">Go</button></main>',
    );
    await page.getByRole("tab", { name: "Preview" }).click();
    const preview = page.frameLocator('iframe[title="Page preview"]');
    await preview.getByRole("button", { name: "Go" }).click();
    await expect(preview.locator("body[data-blocked='1']")).toHaveCount(1);
    expect(page.url()).toBe(editorUrl);
    // A blocked top navigation is a SecurityError inside the frame, caught above; nothing may
    // surface as an uncaught error on the admin page.
    expect(pageErrors).toEqual([]);
  });

  test("a target=_blank popup from the preview opens a new tab, never replaces the admin", { tag: ["@unrun"] }, async ({ page, context }) => {
    const editorUrl = await newPage(page);
    await writeHtmlAndSave(page, '<main><a href="https://example.com/popup" target="_blank" rel="noopener">Popup</a></main>');
    await page.getByRole("tab", { name: "Preview" }).click();
    const popup = context.waitForEvent("page");
    await page.frameLocator('iframe[title="Page preview"]').getByRole("link", { name: "Popup" }).click();
    await (await popup).close();
    expect(page.url()).toBe(editorUrl);
  });
});
