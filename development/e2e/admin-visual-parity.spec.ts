import { test } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Visual-parity audit — Settings/Posts (reference idiom, per the owner) vs Workspace/Taxonomy
 * (reported "look worse"), with Media/Menus as controls. Written for the 2026-08-05 web-design pass
 * after the owner rejected an earlier code-only review ("Workspace matches the house idiom, no
 * defect found") on the grounds that they're looking at rendered pixels, not source.
 *
 * This is a capture-and-save tool, not a pass/fail regression: every "test" below just navigates to
 * one admin section and writes a full-page screenshot to `ADS-memory/reports/`, so the images can be
 * diffed by eye and rerun after a fix for a real before/after. Run against `playwright.visual-
 * parity.config.ts`'s hermetic `TOVU_DB=memory` boot — never the real `infra/content.db`.
 *
 * Categories & Tags renders empty in a fresh memory boot (`seed.ts` seeds posts/media/menus but no
 * taxonomies), which would hide the owner's actual complaint (a page with real dummy categories/tags
 * on it). The first test creates two demo taxonomies through the real "New taxonomy"/"Add term" UI
 * (not a raw API bypass) — one flat, one hierarchical with a parent/child pair — so the capture shows
 * the same shape of screen the owner is looking at.
 *
 * `SNAPSHOT_DIR` is overridable so the same spec produces `before/` and `after/` sets across a fix
 * without editing this file twice.
 */

const SNAPSHOT_DIR =
  process.env.VISUAL_PARITY_DIR ?? "ADS-memory/reports/visual-parity-taxonomy-workspace/before";

async function shoot(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: `${SNAPSHOT_DIR}/${name}.png`, fullPage: true });
}

test.describe.serial("admin visual parity capture", () => {
  test("seeds two demo taxonomies (flat + hierarchical) through the real UI", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/taxonomy");
    await page.locator(".page-title", { hasText: "Categories & Tags" }).waitFor({ state: "visible" });

    // Flat taxonomy — "Category", matches the owner's own naming ("categories/tags").
    await page.getByRole("button", { name: "New taxonomy" }).click();
    await page.getByLabel("New taxonomy").fill("Category");
    await page.getByRole("button", { name: "Create taxonomy" }).click();
    await page.locator(".settings-namespace-group", { hasText: "Category" }).waitFor({ state: "visible" });

    // Two flat terms.
    const categoryGroup = page.locator(".settings-namespace-group", { hasText: "Category" });
    for (const term of ["News", "Guides"]) {
      await categoryGroup.getByRole("button", { name: "+ Add term" }).click();
      await categoryGroup.getByPlaceholder("Term name").fill(term);
      await categoryGroup.getByRole("button", { name: "Add term" }).click();
      await categoryGroup.getByText(term, { exact: true }).waitFor({ state: "visible" });
    }

    // Hierarchical taxonomy — "Topic", with one parent/child pair, to exercise the indented row.
    await page.getByRole("button", { name: "New taxonomy" }).click();
    await page.getByLabel("New taxonomy").fill("Topic");
    await page.getByRole("checkbox", { name: "Hierarchical" }).check();
    await page.getByRole("button", { name: "Create taxonomy" }).click();
    await page.locator(".settings-namespace-group", { hasText: "Topic" }).waitFor({ state: "visible" });

    const topicGroup = page.locator(".settings-namespace-group", { hasText: "Topic" });
    await topicGroup.getByRole("button", { name: "+ Add term" }).click();
    await topicGroup.getByPlaceholder("Term name").fill("Engineering");
    await topicGroup.getByRole("button", { name: "Add term" }).click();
    await topicGroup.getByText("Engineering", { exact: true }).waitFor({ state: "visible" });

    await topicGroup.getByRole("button", { name: "+ Add term" }).click();
    await topicGroup.getByPlaceholder("Term name").fill("Backend");
    await topicGroup.locator('select[aria-label="Parent term"]').selectOption({ label: "Engineering" });
    await topicGroup.getByRole("button", { name: "Add term" }).click();
    await topicGroup.getByText("Backend", { exact: true }).waitFor({ state: "visible" });
  });

  test("captures Settings (reference)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/settings");
    await page.locator(".settings-ui-section").waitFor({ state: "visible" });
    await shoot(page, "01-settings");
  });

  test("captures Posts (reference)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/posts");
    await page.locator(".page-title", { hasText: "Posts" }).waitFor({ state: "visible" });
    await page.locator("table").waitFor({ state: "visible" });
    await shoot(page, "02-posts");
  });

  test("captures Workspace (problem)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/workspace");
    await page.locator(".page-title", { hasText: "Workspace" }).waitFor({ state: "visible" });
    await shoot(page, "03-workspace");
  });

  test("captures Categories & Tags (problem)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/taxonomy");
    await page.locator(".page-title", { hasText: "Categories & Tags" }).waitFor({ state: "visible" });
    await page.locator(".settings-namespace-group", { hasText: "Topic" }).waitFor({ state: "visible" });
    await shoot(page, "04-taxonomy");

    // Also capture the term detail panel open (the two-pane state), since that's a second layout
    // the owner would actually see, not just the list-only resting state.
    await page.getByText("Backend", { exact: true }).click();
    await page.locator(".settings-detail-panel").waitFor({ state: "visible" });
    await shoot(page, "04b-taxonomy-detail-open");
  });

  test("captures Media (control)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/media");
    await page.locator(".page-title", { hasText: "Media" }).waitFor({ state: "visible" });
    await shoot(page, "05-media");
  });

  test("captures Menus (control)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/menus");
    await page.locator(".page-title", { hasText: "Menus" }).waitFor({ state: "visible" });
    await shoot(page, "06-menus");
  });
});
