import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./auth-fixtures.js";

test.describe("Pages editor scroll restoration and active text edits", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);
    await page.getByRole("tab", { name: "HTML" }).click();
  });

  test("restores a populated HTML textarea's actual scroll position after a tab remount", async ({ page }) => {
    const source = page.getByRole("textbox", { name: "Page HTML" });
    const html = Array.from({ length: 150 }, (_, n) => `<p>Line ${n}</p>`).join("\n");
    await source.fill(html);
    await source.evaluate((node: HTMLTextAreaElement) => { node.scrollTop = 400; });
    await expect.poll(() => source.evaluate((node) => node.scrollTop)).toBe(400);
    // Wait for the native scroll event to reach React before leaving the tab.
    await source.evaluate((node) => new Promise<void>((resolve) => {
      node.addEventListener("scroll", () => resolve(), { once: true });
      node.scrollTop = 480;
    }));
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(source).toHaveCount(0);
    await page.getByRole("tab", { name: "HTML" }).click();
    await expect(source).toHaveValue(html);
    await expect.poll(() => source.evaluate((node) => node.scrollTop)).toBe(480);
  });

  test("restores the same-origin preview window after its document loads again", async ({ page }) => {
    await page.getByRole("textbox", { name: "Page HTML" }).fill(
      '<h1>Scrollable preview</h1><div style="height: 5000px">Long body</div>'
    );
    await page.getByRole("tab", { name: "Preview" }).click();
    const preview = page.frameLocator('iframe[title="Page preview"]');
    await expect(preview.getByRole("heading", { name: "Scrollable preview" })).toBeVisible();
    await preview.locator("body").evaluate((body) => new Promise<void>((resolve) => {
      const win = body.ownerDocument.defaultView!;
      win.addEventListener("scroll", () => resolve(), { once: true });
      win.scrollTo(0, 480);
    }));
    const scrollY = () => preview.locator("body").evaluate((body) => body.ownerDocument.defaultView!.scrollY);
    await expect.poll(scrollY).toBe(480);
    await page.getByRole("tab", { name: "HTML" }).click();
    await expect(page.locator('iframe[title="Page preview"]')).toHaveCount(0);
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(preview.getByRole("heading", { name: "Scrollable preview" })).toBeVisible();
    await expect.poll(scrollY).toBe(480);
  });

  test("Save flushes text still being edited in the real Interactive canvas", async ({ page }) => {
    await page.getByRole("textbox", { name: "Page HTML" }).fill("<h1>Active text</h1>");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    const editorUrl = page.url();
    await page.getByRole("tab", { name: "Interactive" }).click();
    const canvas = page.frameLocator(".interactive-html-editor iframe.gjs-frame");
    const heading = canvas.locator("h1");
    await expect(heading).toBeVisible();
    await heading.dblclick();
    await page.keyboard.press("End");
    await page.keyboard.type(" pending edit");
    await expect(heading).toHaveAttribute("contenteditable", "true");
    await expect(heading).toContainText("Active text pending edit");
    // Keep the RTE active until Save calls the real imperative handle. A programmatic click
    // avoids a pointer-induced blur synchronizing the text before flush() can be exercised.
    const save = page.getByRole("button", { name: /^Save/ });
    await expect(save).toBeEnabled();
    const savedBody = page.waitForResponse((response) =>
      response.request().method() === "PUT" && /\/pages\/[^/]+\/html$/.test(new URL(response.url()).pathname)
    );
    await save.evaluate((button: HTMLButtonElement) => button.click());
    expect((await savedBody).ok()).toBe(true);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.goto(editorUrl);
    await page.getByRole("tab", { name: "HTML" }).click();
    await expect(page.getByRole("textbox", { name: "Page HTML" })).toHaveValue(/Active text pending edit/);
  });
});
