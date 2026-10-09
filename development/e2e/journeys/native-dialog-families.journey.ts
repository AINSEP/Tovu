import { test, expect, type Locator, type Page } from "../support/bug-pin-fixtures.js";
import { loginAsAdmin } from "../support/bug-pin-auth.js";
import { WS_API } from "./_fixtures.js";

// Phase 17: jsdom cannot exercise showModal's top layer, inert background, or native Tab loop.
// These assertions retain the keyboard coverage formerly tied to the removed JavaScript traps.
test.beforeEach(async ({ page }) => { await loginAsAdmin(page); });

// A native modal does not wrap Tab itself: past its edge, focus may leave the page (the browser's
// own UI, seen here as document.body) before re-entering the dialog. The contract is that focus
// never reaches the inert page behind the dialog and comes back to the dialog's opposite edge.
async function expectFocusReturnsWithinDialog(page: Page, dialog: Locator, key: "Tab" | "Shift+Tab", target: Locator) {
  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.press(key);
    const where = await dialog.evaluate((node) => {
      const active = document.activeElement;
      if (!active || active === document.body) return "outside-page";
      return node.contains(active) ? "dialog" : `background: ${active.outerHTML.slice(0, 160)}`;
    });
    expect(where).not.toMatch(/^background:/);
    if (await target.evaluate((node) => node === document.activeElement)) return;
  }
  await expect(target).toBeFocused();
}

test("collection dialog contains Tab, dismisses on Escape/backdrop, and restores its opener", async ({ page }) => {
  await page.goto("/admin/collections");
  const opener = page.getByRole("button", { name: "New content type", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "New content type", exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => node.matches("dialog:modal"))).toBe(true);
  const first = dialog.getByLabel("Label", { exact: true });
  // Tovu hides Jini's generic Close in domain dialogs (native-domain-dialogs.css), so the footer's
  // Cancel then Create content type end the Tab order.
  const last = dialog.getByRole("button", { name: "Create content type", exact: true });
  await expect(first).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(last).toBeFocused();
  await expectFocusReturnsWithinDialog(page, dialog, "Tab", first);
  await expectFocusReturnsWithinDialog(page, dialog, "Shift+Tab", last);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("form field attributes keep focus inside and return it to the chosen field", async ({ page }) => {
  await page.goto("/admin/forms/new");
  await page.getByRole("button", { name: "Add field", exact: true }).click();
  const opener = page.getByRole("button", { name: /^Attributes for field/ }).last();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: /^Field attributes/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("CSS classes", { exact: true })).toBeFocused();
  // SeeMore may add a focusable disclosure before CSS classes. Native Tab order follows
  // the visible controls, while the explicit initial-focus marker still chooses CSS classes.
  const first = dialog.locator('button:visible:not([disabled]), input:visible:not([disabled]), a[href]:visible').first();
  // Tovu hides Jini's generic Close in domain dialogs (native-domain-dialogs.css); Cancel is last.
  const last = dialog.getByRole("button", { name: "Cancel", exact: true });
  await last.focus();
  await expectFocusReturnsWithinDialog(page, dialog, "Tab", first);
  await expectFocusReturnsWithinDialog(page, dialog, "Shift+Tab", last);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("widget Select portals within the modal and consumes only its own Escape", { tag: "@isolated-site" }, async ({ page, request }) => {
  // The pin fixture deletes this entire isolated site, including the widget and post, on teardown.
  const created = await request.post(`${WS_API}/widgets`, {
    data: { widgetType: "text", title: "Native dialog existing widget", config: { body: "Dialog portal fixture" } },
  });
  expect(created.status()).toBe(201);
  // Posts are created by New Post; /posts/new would look up a nonexistent post named "new".
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  const opener = page.getByRole("button", { name: "Embed", exact: true });
  await opener.click();
  await page.getByRole("menuitem", { name: "Widget…", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Insert widget", exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((node) => node.matches("dialog:modal"))).toBe(true);
  const select = dialog.getByRole("combobox", { name: "Existing Text widgets", exact: true });
  await select.click();
  await expect(dialog.getByRole("listbox")).toBeVisible();
  await dialog.getByRole("option", { name: "Native dialog existing widget", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Use this widget", exact: true })).toBeEnabled();
  await select.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(select).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
