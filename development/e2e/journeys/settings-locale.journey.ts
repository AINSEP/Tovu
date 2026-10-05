// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import type { Page } from "@playwright/test";

import { WS_API, expect, hasHorizontalScroll, test } from "./_fixtures.js";

/**
 * Settings, locale and layout journeys (SCOPE.md W8 slice + the 2026-10-04 stress list): long
 * German and Hungarian labels must fit, Arabic must flip the admin to right-to-left, every key
 * screen must work at phone width (390 px) with no sideways scroll, and the admin must be usable
 * with the keyboard alone.
 *
 * Locale is the per-user `core.language.locale` setting, written through the same route the admin
 * uses (`admin-locale-after-login.spec.ts`), and reset to "en" after every test because all
 * journeys share one storageState user.
 *
 * Known likely bug, asserted as INTENDED here: nothing sets `<html dir="rtl">` for ar/fa/ur
 * (`apps/admin/src/features/settings/SettingsUi.tsx:779` passes `syncDocumentAttributes={false}`
 * on the stale premise that the rest of the admin stays English; the nav is translated since
 * `admin-nav-i18n.ts`).
 *
 * The sidebar opens as an icon rail by default (`App.tsx` `railDefaultCollapsed`), which clips every
 * label; the long-label tests expand it first through its persisted localStorage key.
 */
const RAIL_KEY = "tovu-admin-sidebar-rail-collapsed";
const KEY_SCREENS = ["/admin", "/admin/posts", "/admin/pages", "/admin/media", "/admin/collections", "/admin/forms", "/admin/menus", "/admin/plugins", "/admin/settings"];

async function setLocale(page: Page, locale: string): Promise<void> {
  const res = await page.request.put(`${WS_API}/settings/value`, {
    data: { namespace: "core.language", key: "locale", scope: "user", valueJson: locale },
  });
  expect(res.status(), await res.text()).toBe(200);
}

async function expandRail(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    try {
      localStorage.setItem(key, "0"); // `use-sidebar-rail.ts` persists "1" collapsed / "0" expanded
    } catch {
      /* storage blocked: the rail stays collapsed and the overflow check below fails loudly */
    }
  }, RAIL_KEY);
}

/** Nav labels whose text is clipped (wider than their box). */
async function clippedNavLabels(page: Page): Promise<string[]> {
  return page.locator("nav a.cms-item > span").evaluateAll((spans) =>
    spans.filter((s) => s.scrollWidth > s.clientWidth + 1).map((s) => s.textContent ?? ""),
  );
}

test.afterEach(async ({ page }) => {
  await setLocale(page, "en");
});

for (const { locale, overview, longLabel } of [
  { locale: "de", overview: "Übersicht", longLabel: "Benachrichtigungen" },
  { locale: "hu", overview: "Áttekintés", longLabel: "Szerepkörök és jogosultságok" },
]) {
  test(`${locale}: long translated labels fit the expanded sidebar and no key screen scrolls sideways`, { tag: ["@unrun"] }, async ({ page }) => {
    await expandRail(page);
    await page.goto("/admin");
    await setLocale(page, locale);
    await page.reload();
    const nav = page.getByRole("navigation", { name: "Admin" });
    await expect(nav.getByText(overview, { exact: true })).toBeVisible();
    await expect(nav.getByText(longLabel, { exact: true })).toBeAttached();
    expect(await clippedNavLabels(page), `clipped ${locale} nav labels`).toEqual([]);
    for (const screen of KEY_SCREENS) {
      await page.goto(screen);
      await expect(page.locator("#main-content")).toBeVisible();
      expect(await hasHorizontalScroll(page), `${locale} ${screen} scrolls sideways`).toBe(false);
    }
    await page.goto("/admin/settings?tab=language");
    await expect(page).toHaveScreenshot(`settings-language-${locale}.png`);
    await page.goto("/admin/posts");
    await expect(page).toHaveScreenshot(`posts-list-${locale}.png`, { mask: [page.locator("time, [data-relative-time]")] });
  });
}

test("ar: the admin flips to right-to-left, with the sidebar on the right", { tag: ["@unrun"] }, async ({ page }) => {
  await expandRail(page);
  await page.goto("/admin");
  await setLocale(page, "ar");
  await page.reload();
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByText("نظرة عامة", { exact: true })).toBeVisible();
  // INTENDED (likely bug today: nothing sets these).
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  const box = await nav.boundingBox();
  const width = page.viewportSize()!.width;
  expect(box, "sidebar box").not.toBeNull();
  expect(box!.x + box!.width / 2, "an RTL sidebar sits on the right half").toBeGreaterThan(width / 2);
  expect(await hasHorizontalScroll(page)).toBe(false);
  await expect(page).toHaveScreenshot("dashboard-ar-rtl.png", { mask: [page.locator("time, [data-relative-time]")] });
  await page.goto("/admin/settings?tab=language");
  await expect(page).toHaveScreenshot("settings-language-ar-rtl.png");
});

test("the language picked in Settings persists across reload and drives the nav", { tag: ["@unrun"] }, async ({ page }) => {
  await page.goto("/admin/settings?tab=language");
  // Jini `LanguageTab`: a radiogroup of tiles, each showing its locale code.
  const tile = page.getByRole("radiogroup").getByRole("radio").filter({ has: page.locator(".jini-settings-language-tile-code", { hasText: /^de$/ }) });
  await tile.click();
  await expect(tile).toHaveAttribute("aria-checked", "true");
  const nav = page.getByRole("navigation", { name: "Admin" });
  await expect(nav.getByText("Übersicht", { exact: true })).toBeAttached();
  await page.reload();
  await expect(nav.getByText("Übersicht", { exact: true })).toBeAttached();
});

test.describe("phone width (390 px)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("every key admin screen fits without sideways scroll, and the nav opens and closes", { tag: ["@unrun"] }, async ({ page }) => {
    for (const screen of KEY_SCREENS) {
      await page.goto(screen);
      await expect(page.locator("#main-content")).toBeVisible();
      expect(await hasHorizontalScroll(page), `${screen} scrolls sideways at 390px`).toBe(false);
    }
    await page.goto("/admin/posts");
    const toggle = page.getByRole("button", { name: "Open navigation" });
    await toggle.click();
    const nav = page.getByRole("navigation", { name: "Admin" });
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: "Media" }).click();
    await expect(page).toHaveURL(/\/admin\/media$/);
    await expect(page.getByRole("button", { name: "Open navigation" }), "navigating closes the drawer").toBeVisible();
  });

  test("phone-width baselines for the busiest screens", { tag: ["@unrun"] }, async ({ page }) => {
    await page.goto("/admin/posts");
    await expect(page.getByRole("button", { name: "New Post" })).toBeVisible();
    await expect(page).toHaveScreenshot("phone-posts-list.png", { mask: [page.locator("time, [data-relative-time]")] });
    await page.getByRole("button", { name: "New Post" }).click();
    await expect(page.getByRole("textbox", { name: "Post title" })).toBeVisible();
    expect(await hasHorizontalScroll(page)).toBe(false);
    await expect(page).toHaveScreenshot("phone-post-editor.png", { mask: [page.getByLabel("URL slug")] });
    await page.goto("/admin/plugins");
    await expect(page).toHaveScreenshot("phone-plugins.png");
    await page.goto("/admin/settings");
    await expect(page).toHaveScreenshot("phone-settings.png");
  });
});

test.describe("keyboard only", () => {
  test("first Tab reaches Skip to content, which moves focus into the main region", { tag: ["@unrun"] }, async ({ page }) => {
    await page.goto("/admin/posts");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible(); // visually hidden only until focused
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$|\/admin\/posts$/);
    const insideMain = await page.evaluate(() => !!document.activeElement?.closest("#main-content"));
    expect(insideMain, "focus lands inside the main region").toBe(true);
  });

  test("Posts is reachable from the nav and New Post opens the editor without a mouse, with a visible focus ring", { tag: ["@unrun"] }, async ({ page }) => {
    await expandRail(page);
    await page.goto("/admin");
    const postsLink = page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Posts", exact: true });
    for (let i = 0; i < 80 && !(await postsLink.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(postsLink).toBeFocused();
    const outline = await postsLink.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow };
    });
    expect((outline.style !== "none" && outline.width > 0) || outline.shadow !== "none", "a focused nav link shows a focus indicator").toBe(true);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/posts$/);

    const newPost = page.getByRole("button", { name: "New Post" });
    for (let i = 0; i < 80 && !(await newPost.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
    await expect(newPost).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
    await expect(page.getByRole("textbox", { name: "Post title" })).toBeVisible();
  });

  test("a confirm dialog traps focus and Escape closes it without acting", { tag: ["@unrun"] }, async ({ page }) => {
    await page.goto("/admin/posts");
    await page.getByRole("button", { name: "New Post" }).click();
    await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
    const editorUrl = page.url();
    await page.getByRole("button", { name: "Delete" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")), "focus stays inside the dialog").toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    expect(page.url()).toBe(editorUrl);
  });

  test("the post status select has an accessible name", { tag: ["@unrun"] }, async ({ page }) => {
    // INTENDED (likely bug today: only a data-agent label, no aria name).
    await page.goto("/admin/posts");
    await page.getByRole("button", { name: "New Post" }).click();
    const status = page.locator('[data-agent-element="post-status"]');
    await expect(status).toBeVisible();
    await expect(status).toHaveAccessibleName(/status/i);
  });
});
