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

// Owner report 2026-10-05 (/healthy-futures): a Builder checkbox stacked under its label, centred in
// the column, because the baseline treated it like a text input. It must sit at the left, on the
// label's line, with no theme CSS at all, in Builder and HTML mode alike.
test("checkbox fields render inline before their label with only the emitted stylesheet", async () => {
  const builder = renderWidgetIr({ componentId: "contact-form", props: {
    slug: "builder", fields: [{ id: "email", label: "Email", type: "email" }, { id: "updates", label: "Send me updates", type: "checkbox" }],
  } });
  const html = renderWidgetIr({ componentId: "contact-form", props: {
    slug: "authored", mode: "html", fields: [], html: '<label>Email <input type="email" name="email"></label><label><input type="checkbox" name="updates"> Send me updates</label>',
  } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    for (const [name, markup, labelSelector] of [["builder", builder, "label[for=widget-contact-updates]"], ["html", html, "label:has(input[type=checkbox])"]] as const) {
      await page.setContent(`<body style="width:600px">${markup}</body>`);
      const box = await page.locator('form input[type="checkbox"]').boundingBox();
      const label = await page.locator(labelSelector).boundingBox();
      const form = await page.locator("form").boundingBox();
      assert.ok(box && label && form);
      // A stretched checkbox box draws its glyph centred, so the box must also stay glyph-sized.
      assert.ok(box.width <= 24, `${name}: checkbox is not stretched across the column (width ${box.width})`);
      assert.ok(box.x - form.x <= 4, `${name}: checkbox starts at the form's left edge (offset ${box.x - form.x})`);
      assert.ok(Math.abs((box.y + box.height / 2) - (label.y + label.height / 2)) < 6, `${name}: checkbox shares the label's line`);
      if (name === "builder") assert.ok(label.x > box.x, "builder: the label text follows the box");
    }
  } finally {
    await browser.close();
  }
});
