import assert from "node:assert/strict";
import test from "node:test";
import { chromium } from "playwright";

import { injectFormSubmissionResultIntoHtml, renderWidgetIr } from "../render.js";

function formHtml(): string {
  return renderWidgetIr({ componentId: "contact-form", props: {
    slug: "contact", fields: [{ id: "email", label: "Email", type: "email", required: true }], successMessage: "Thank you",
  } });
}

test("a successful contact form is hidden by the emitted stylesheet in a browser", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(formHtml());
    const form = page.locator("form.tovu-form");
    assert.equal(await form.isVisible(), true);
    await page.setContent(injectFormSubmissionResultIntoHtml(formHtml(), { kind: "success", slug: "contact" }));
    assert.equal(await form.getAttribute("hidden"), "");
    assert.equal(await form.evaluate((el) => getComputedStyle(el).display), "none");
    assert.equal(await form.isVisible(), false);
    assert.equal(await page.locator(".tovu-form-success").isVisible(), true);
  } finally {
    await browser.close();
  }
});

test("contact form fallback error and success colors apply in both modes without theme tokens", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const [mode, danger, success] of [["dark", "rgb(248, 113, 113)", "rgb(74, 222, 128)"], ["light", "rgb(185, 28, 28)", "rgb(22, 101, 52)"]]) {
      const document = (body: string) => `<html data-theme="${mode}"><body>${body}</body></html>`;
      await page.setContent(document(injectFormSubmissionResultIntoHtml(formHtml(), {
        kind: "validation", slug: "contact", fieldErrors: [{ field: "email", reason: "Required" }],
      })));
      for (const selector of [".tovu-form-error", ".widget-form-field-error"]) {
        const error = page.locator(selector);
        assert.equal(await error.isVisible(), true);
        assert.equal(await error.evaluate((el) => getComputedStyle(el).color), danger, `${mode}: ${selector}`);
      }
      await page.setContent(document(injectFormSubmissionResultIntoHtml(formHtml(), { kind: "success", slug: "contact" })));
      const message = page.locator(".tovu-form-success");
      assert.equal(await message.isVisible(), true);
      assert.equal(await message.evaluate((el) => getComputedStyle(el).color), success, mode);
    }
  } finally {
    await browser.close();
  }
});
