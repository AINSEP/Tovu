import { expect, test, type Locator } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/** Checks the rendered containing block and hit testing with the production styles. */
async function expectReachable(locator: Locator) {
  await expect(locator).toBeVisible();
  expect(await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && element.contains(hit);
  })).toBe(true);
}

async function expectPreviewControlAnchored(surface: Locator) {
  const control = surface.locator(".post-preview-fab");
  await control.scrollIntoViewIfNeeded();
  await expectReachable(control);
  await expect.poll(() => surface.evaluate((element) => {
    const button = element.querySelector<HTMLElement>(".post-preview-fab")!;
    const surfaceBox = element.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.6;
    return Math.abs(buttonBox.top - surfaceBox.top - inset) <= 1
      && Math.abs(surfaceBox.right - buttonBox.right - inset) <= 1;
  })).toBe(true);
}

test("expanded post preview leaves the chat FAB and open assistant dock accessible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsAdmin(page);
  await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);

  const fab = page.locator(".chat-fab");
  const dock = page.locator(".admin-chat-dock");
  if (await dock.isVisible()) await fab.click();
  await expect(dock).toBeHidden();
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expectPreviewControlAnchored(page.locator(".post-preview-surface"));
  await page.getByRole("button", { name: "Show full screen", exact: true }).click();
  const expanded = page.locator(".post-preview-expanded");
  await expect(expanded).toBeVisible();
  await expectPreviewControlAnchored(expanded.locator(".post-preview-surface"));
  // Breaking any link in the flex chain leaves a ~150px intrinsic iframe in a tall panel.
  await expect.poll(() => expanded.evaluate((element) => {
    const surface = element.querySelector(".post-preview-surface");
    const shell = element.querySelector(".editor-shell");
    const frame = element.querySelector(".page-preview-frame");
    const iframe = element.querySelector("iframe");
    if (!surface || !shell || !frame || !iframe) return false;
    const panelHeight = element.getBoundingClientRect().height;
    const surfaceHeight = surface.getBoundingClientRect().height;
    const notice = element.querySelector(".editor-preview-notice");
    const noticeStyle = notice && getComputedStyle(notice);
    const noticeHeight = notice && noticeStyle ? notice.getBoundingClientRect().height
      + parseFloat(noticeStyle.marginTop) + parseFloat(noticeStyle.marginBottom) : 0;
    const shellHeight = shell.getBoundingClientRect().height;
    const frameHeight = frame.getBoundingClientRect().height;
    const iframeHeight = iframe.getBoundingClientRect().height;
    return panelHeight > 300 && surfaceHeight >= panelHeight - 2
      && shellHeight >= surfaceHeight - noticeHeight - 2 && frameHeight >= shellHeight - 2
      && iframeHeight >= frameHeight - 2;
  })).toBe(true);
  await expectReachable(fab);
  await fab.click();
  await expectReachable(dock);
  await expectReachable(fab);

  // A changed inset/size or containing block must not spill into the dock's separate column.
  await expect.poll(async () => {
    const previewBox = await expanded.boundingBox();
    const mainBox = await page.locator(".admin-main-col").boundingBox();
    const dockBox = await dock.boundingBox();
    if (!previewBox || !mainBox || !dockBox) return false;
    const tolerance = 1;
    return previewBox.width > 0 && previewBox.height > 0
      && previewBox.x >= mainBox.x - tolerance
      && previewBox.y >= mainBox.y - tolerance
      && previewBox.x + previewBox.width <= mainBox.x + mainBox.width + tolerance
      && previewBox.y + previewBox.height <= mainBox.y + mainBox.height + tolerance
      && previewBox.x + previewBox.width <= dockBox.x + tolerance;
  }).toBe(true);
});
