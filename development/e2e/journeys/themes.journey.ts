// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { APIRequestContext, Page } from "@playwright/test";

import { PUBLIC_URL, WS_API, expect, expectStatus, fetchPublic, test } from "./_fixtures.js";

/**
 * Theme switching journeys (SCOPE.md W5): activate a different theme in the admin, see the public
 * home change, then revert through the same screen.
 *
 * The public-side check is a DOM marker, not a screenshot: a static theme's pages link their own
 * assets as `/theme-assets/<themeId>/...` (`features/theme/static-asset-contract.ts`), so the
 * active theme id is visible in the served HTML.
 *
 * Order safety: run order is alphabetical on one shared server, and `widgets-menus.journey.ts` runs
 * after this file and renders public pages. Every test restores the theme that was active when it
 * started (UI first, API in `finally` as the safety net).
 *
 * Themes are discovered once at boot from `<site>/themes` (seeded from `content/themes`), so the
 * available list is read from `GET .../presentation` rather than hard-coded.
 */
interface ThemeSummary {
  id: string;
  name?: string;
  tier: string;
}

interface Presentation {
  settings: { activeThemeId: string };
  availableThemes: ThemeSummary[];
}

/** Tier -> the Themes screen's `?tab=` group (mirrors `TIER_TAB_GROUP` in `features/themes/rules.ts`). */
function tabGroupOf(tier: string): string {
  return tier === "handlebars" ? "templated" : tier;
}

function displayName(theme: ThemeSummary): string {
  return theme.name || theme.id;
}

async function readPresentation(request: APIRequestContext): Promise<Presentation> {
  const res = await request.get(`${WS_API}/presentation`);
  await expectStatus(res, 200, "presentation read");
  return (await res.json()) as Presentation;
}

/** A static theme other than the active one; static themes carry the `/theme-assets/<id>/` marker. */
function pickStaticTarget(presentation: Presentation): ThemeSummary {
  const target = presentation.availableThemes.find((t) => t.tier === "static" && t.id !== presentation.settings.activeThemeId);
  expect(target, `no inactive static theme among ${presentation.availableThemes.map((t) => t.id).join(", ")}`).toBeDefined();
  return target!;
}

async function restoreTheme(request: APIRequestContext, themeId: string): Promise<void> {
  const current = await readPresentation(request);
  if (current.settings.activeThemeId === themeId) return;
  const res = await request.patch(`${WS_API}/presentation`, { data: { activeThemeId: themeId } });
  await expectStatus(res, 200, "theme restore");
}

async function activateThroughUi(page: Page, theme: ThemeSummary): Promise<void> {
  await page.goto(`/admin/themes?tab=${tabGroupOf(theme.tier)}`);
  const patched = page.waitForResponse((r) => r.url().endsWith(`${WS_API}/presentation`) && r.request().method() === "PATCH");
  await page.getByRole("button", { name: `Activate ${displayName(theme)}`, exact: true }).click();
  expect((await patched).status()).toBe(200);
  const card = page.locator(".theme-card").filter({ has: page.getByRole("heading", { name: displayName(theme), exact: true }) });
  await expect(card.getByText("Active", { exact: true })).toBeVisible();
}

test.describe("W5 theme switching", () => {
  test("activating another theme changes the public home, and reverting through the screen restores it", { tag: ["@unrun"] }, async ({ page, request }) => {
    const before = await readPresentation(request);
    const original = before.availableThemes.find((t) => t.id === before.settings.activeThemeId);
    expect(original, `active theme "${before.settings.activeThemeId}" is not in the available list`).toBeDefined();
    const target = pickStaticTarget(before);
    const marker = `/theme-assets/${target.id}/`;
    try {
      const home = await fetchPublic(request, "/");
      expect(home.status).toBe(200);
      expect(home.html, "the target theme must not already be what the public home renders").not.toContain(marker);

      await activateThroughUi(page, target);
      expect((await readPresentation(request)).settings.activeThemeId).toBe(target.id);

      const switched = await fetchPublic(request, "/");
      expect(switched.status).toBe(200);
      expect(switched.html, "public home must render the newly active theme").toContain(marker);

      // The theme's own stylesheet must actually load in a browser, not only be referenced.
      const failedAssets: string[] = [];
      page.on("response", (r) => {
        if (r.url().includes(marker) && r.status() >= 400) failedAssets.push(`${r.status()} ${r.url()}`);
      });
      await page.goto(`${PUBLIC_URL}/`, { waitUntil: "load" });
      await expect(page.locator(`link[href*="${marker}"], script[src*="${marker}"]`).first()).toBeAttached();
      expect(failedAssets).toEqual([]);

      await activateThroughUi(page, original!);
      const reverted = await fetchPublic(request, "/");
      expect(reverted.status).toBe(200);
      expect(reverted.html, "after revert the public home must stop rendering the target theme").not.toContain(marker);
      expect((await readPresentation(request)).settings.activeThemeId).toBe(original!.id);
    } finally {
      await restoreTheme(request, before.settings.activeThemeId);
    }
  });

  test("double-clicking Activate sends exactly one theme change", { tag: ["@unrun"] }, async ({ page, request }) => {
    const before = await readPresentation(request);
    const target = pickStaticTarget(before);
    const patches: string[] = [];
    page.on("request", (r) => {
      if (r.method() === "PATCH" && r.url().endsWith(`${WS_API}/presentation`)) patches.push(r.url());
    });
    try {
      await page.goto(`/admin/themes?tab=${tabGroupOf(target.tier)}`);
      await page.getByRole("button", { name: `Activate ${displayName(target)}`, exact: true }).dblclick();
      const card = page.locator(".theme-card").filter({ has: page.getByRole("heading", { name: displayName(target), exact: true }) });
      await expect(card.getByText("Active", { exact: true })).toBeVisible();
      expect(patches, "the busy state must swallow the second click").toHaveLength(1);
    } finally {
      await restoreTheme(request, before.settings.activeThemeId);
    }
  });

  test("Themes screen baseline", { tag: ["@unrun"] }, async ({ page }) => {
    await page.goto("/admin/themes");
    await expect(page.locator(".theme-card").first()).toBeVisible();
    await expect(page).toHaveScreenshot("themes-list.png", { fullPage: true });
  });
});
