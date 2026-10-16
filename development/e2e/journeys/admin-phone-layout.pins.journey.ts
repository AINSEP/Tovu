import { test, expect } from "../support/bug-pin-fixtures.js";

/**
 * Phone-layout fixes (site-key.css; styles.css's phone editor-toolbar rules). Exercise the real seeded site and editor;
 * assert painted bounds rather than CSS text (testing-mistakes F1.5/F2.4). The admin-visual baselines
 * mask the fingerprint and cannot prove keyboard reach, so these two checks stay as journeys.
 * Wider layouts are unchanged and covered by the tablet/desktop baselines.
 */
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("site-key fingerprint stays inside its card on a phone", async ({ page }) => {
  await page.goto("/admin/access-tokens?tab=site-key");
  const card = page.locator('[data-agent-element="security-site-key-status"]');
  await expect(card.getByRole("heading", { name: "Site key", exact: true })).toBeVisible();
  // Only the non-secret fingerprint lives in this status card; never reveal a key for layout.
  const fingerprint = card.getByText("Fingerprint", { exact: true }).locator("..").locator("code");
  await expect(fingerprint).toBeVisible();
  await expect.poll(() => fingerprint.evaluate((element) => {
    const card = element.closest("section")!.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = Array.from(range.getClientRects());
    return rects.length > 0 && rects.every((rect) =>
      rect.left >= card.left && rect.right <= card.right && rect.bottom <= card.bottom,
    );
  })).toBe(true);
});

test("post formatting controls stay visible and keyboard-reachable on a phone", async ({ page }) => {
  await page.goto("/admin/posts");
  const created = page.waitForResponse((response) =>
    response.request().method() === "POST"
    && new URL(response.url()).pathname === "/api/admin/v1/workspaces/workspace-local/posts",
  );
  await page.getByRole("button", { name: "New Post", exact: true }).click();
  expect((await created).status()).toBe(201);
  const toolbar = page.getByRole("toolbar", { name: "Formatting", exact: true });
  await expect(toolbar).toBeVisible();

  // Collapsed, the phone toolbar is one row: the primary controls plus "More" (owner 2026-10-15:
  // the fully wrapped toolbar was ~8 ragged rows). Every visible control shares one top edge.
  const more = toolbar.getByRole("button", { name: "More formatting", exact: true });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await expect(toolbar.getByRole("button", { name: "YouTube", exact: true })).toBeHidden();
  await expect.poll(() => toolbar.evaluate((element) => {
    const tops = Array.from(element.querySelectorAll("button, select, input"))
      .map((control) => control.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .map((rect) => Math.round(rect.top));
    return tops.length > 1 && new Set(tops).size === 1;
  })).toBe(true);
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");

  // Expanded, restoring a single unwrapped group must fail even when the outer toolbar wraps.
  await expect.poll(() => toolbar.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const controls = Array.from(element.querySelectorAll("button, select, input"))
      .map((control) => control.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    return controls.length > 0 && controls.every((rect) =>
      rect.left >= bounds.left && rect.right <= bounds.right + 1,
    );
  })).toBe(true);

  // Native keyboard traversal still reaches the trailing control.
  const mention = toolbar.getByRole("combobox", { name: "Mention a post", exact: true });
  await toolbar.getByRole("button", { name: "YouTube", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(mention).toBeFocused();
  await expect(mention).toBeInViewport();
});
