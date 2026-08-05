import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file SPEC-047 — the Pages editor, driven in a real browser.
 *
 * This suite exists because `features/pages`' own README says a change to that screen is
 * "unverified until you have driven it in a browser", and because the screen it replaces was the
 * Posts editor: until this ran, "a Page no longer opens in Tiptap" was an assertion about code, not
 * an observation about the product.
 *
 * The AI-driven half (asking the assistant dock to generate a page) is deliberately NOT here. That
 * path spawns a real local CLI agent and its output is a model's, so it is neither hermetic nor
 * deterministic — it belongs in a live-smoke suite alongside `byok-google-live-smoke.spec.ts`, not
 * in the suite that has to stay green on every run. What IS covered here is everything that path
 * lands on: the editor, the write endpoint, the preview, and the round trip.
 */

test.describe("Pages editor", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("New Page opens the Pages editor, not the Posts/Tiptap one", async ({ page }) => {
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();

    // The destination is the Pages editor. This URL is the whole point — it used to be
    // /admin/posts/{id}, which mounted Tiptap over a document Tiptap would silently mangle.
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);
    await expect(page.getByRole("heading", { name: "Edit page" })).toBeVisible();

    // No Tiptap. Asserting on its toolbar buttons rather than a class name, because those buttons
    // are what an operator would actually see and click.
    await expect(page.getByRole("button", { name: "Insert widget" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "H1", exact: true })).toHaveCount(0);

    // And the surface that replaces it.
    await expect(page.getByRole("tab", { name: "Preview" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "HTML" })).toBeVisible();
  });

  test("HTML written in the editor is saved and rendered in the sandboxed preview", async ({ page }) => {
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);

    const html =
      '<section data-agent-element="page-hero" data-agent-role="region">' +
      "<h1>Glassmorphic</h1><p>Frosted and translucent.</p></section>";

    await page.getByRole("tab", { name: "HTML" }).click();
    const source = page.getByRole("textbox", { name: "Page HTML" });
    await source.fill(html);

    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });

    // Back to the preview: the iframe must actually render the markup, which is the only proof the
    // srcdoc pipeline works end to end rather than the textarea merely holding a string.
    await page.getByRole("tab", { name: "Preview" }).click();
    const preview = page.frameLocator('iframe[title="Page preview"]');
    await expect(preview.getByRole("heading", { name: "Glassmorphic" })).toBeVisible();

    // The preview must stay sandboxed WITHOUT `allow-same-origin` — with it, generated markup could
    // reach the admin's own cookies and DOM. Asserted, not eyeballed.
    const sandbox = await page.locator('iframe[title="Page preview"]').getAttribute("sandbox");
    expect(sandbox).toBeTruthy();
    expect(sandbox).not.toContain("allow-same-origin");
  });

  test("a saved page survives a reload — the HTML is persisted, not just held in component state", async ({ page }) => {
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);
    const url = page.url();

    await page.getByRole("tab", { name: "HTML" }).click();
    await page.getByRole("textbox", { name: "Page HTML" }).fill("<h1>Persisted</h1>");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });

    await page.goto(url);
    await page.getByRole("tab", { name: "HTML" }).click();
    await expect(page.getByRole("textbox", { name: "Page HTML" })).toHaveValue("<h1>Persisted</h1>");
  });

  test("renaming a generated page keeps its HTML — the regression that used to delete it", async ({ page }) => {
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);
    const url = page.url();

    await page.getByRole("tab", { name: "HTML" }).click();
    await page.getByRole("textbox", { name: "Page HTML" }).fill("<h1>Keep me</h1>");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });

    // The metadata write — a different server-side path from the HTML one. This exact sequence used
    // to revert the page to doc format and discard the body, silently, with a 200.
    await page.getByRole("textbox", { name: "Page title" }).fill("Renamed page");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });

    await page.goto(url);
    await page.getByRole("tab", { name: "HTML" }).click();
    await expect(page.getByRole("textbox", { name: "Page HTML" })).toHaveValue("<h1>Keep me</h1>");
  });
});
