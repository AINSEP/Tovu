import { expect, test } from "@playwright/test";

import { loginAsAdmin } from "./auth-fixtures.js";

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

  test("[unrun-edit] HTML written in the editor is saved and rendered in the sandboxed preview", async ({ page }) => {
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
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    // Back to the preview: the iframe must actually render the markup, which is the only proof the
    // srcdoc pipeline works end to end rather than the textarea merely holding a string.
    await page.getByRole("tab", { name: "Preview" }).click();
    const preview = page.frameLocator('iframe[title="Page preview"]');
    await expect(preview.getByRole("heading", { name: "Glassmorphic" })).toBeVisible();

    // The preview carries exactly `PAGE_PREVIEW_IFRAME_SANDBOX`'s flags (`features/pages/rules.ts`,
    // 7d621d892). `allow-same-origin` is in that set on purpose: without it the preview loses its
    // scroll memory and theme fonts. The risk this spec used to guard (with it, generated markup can
    // reach the admin's cookies and DOM) is real and recorded as the constant's "Honest limit";
    // dropping the flag is an open owner decision. What must stay out is top navigation, so the
    // preview can never navigate the admin tab.
    const sandbox = (await page.locator('iframe[title="Page preview"]').getAttribute("sandbox")) ?? "";
    expect(sandbox.split(/\s+/).sort()).toEqual(["allow-forms", "allow-popups", "allow-same-origin", "allow-scripts"]);
    expect(sandbox).not.toContain("allow-top-navigation");
  });

  test("draft preview POSTs saved and pending HTML into its iframe with the notice above it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);
    const editorUrl = page.url();
    await page.getByRole("tab", { name: "HTML" }).click();
    const source = page.getByRole("textbox", { name: "Page HTML" });
    await source.fill("<h1>Saved draft preview</h1>");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Preview" }).click();

    const iframe = page.locator('iframe[title="Page preview"]');
    const form = page.locator('form:has(input[name="bodyHtml"])');
    await expect(form).toHaveAttribute("method", "post");
    const target = await form.getAttribute("target");
    expect(target).toBeTruthy();
    await expect(iframe).toHaveAttribute("name", target!);
    const preview = page.frameLocator('iframe[title="Page preview"]');
    await expect(preview.getByRole("heading", { name: "Saved draft preview" })).toBeVisible();

    await page.getByRole("tab", { name: "HTML" }).click();
    await source.fill("<h1>Pending draft preview</h1>");
    await page.getByRole("tab", { name: "Preview" }).click();
    await expect(preview.getByRole("heading", { name: "Pending draft preview" })).toBeVisible();
    await expect(preview.getByRole("heading", { name: "Saved draft preview" })).toHaveCount(0);
    await expect(page).toHaveURL(editorUrl);

    // No scroll to the notice: its initial position must precede the large preview frame.
    const notice = page.getByText(/previewing your unsaved edits/i);
    await expect(notice).toBeVisible();
    await expect(notice).toBeInViewport({ ratio: 1 });
    await expect.poll(async () => {
      const noticeBox = await notice.boundingBox();
      const frameBox = await iframe.boundingBox();
      return !!noticeBox && !!frameBox && noticeBox.y + noticeBox.height <= frameBox.y;
    }).toBe(true);
  });

  test("a saved page survives a reload — the HTML is persisted, not just held in component state", async ({ page }) => {
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);
    const url = page.url();

    await page.getByRole("tab", { name: "HTML" }).click();
    await page.getByRole("textbox", { name: "Page HTML" }).fill("<h1>Persisted</h1>");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

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
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    // The metadata write — a different server-side path from the HTML one. This exact sequence used
    // to revert the page to doc format and discard the body, silently, with a 200.
    await page.getByRole("textbox", { name: "Page title" }).fill("Renamed page");
    const renamed = page.waitForResponse((response) =>
      response.request().method() === "PUT" &&
      /\/workspaces\/[^/]+\/posts\/[^/?]+$/.test(new URL(response.url()).pathname) &&
      response.request().postDataJSON()?.title === "Renamed page"
    );
    await page.getByRole("button", { name: /^Save/ }).click();
    expect((await renamed).status()).toBe(200);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.goto(url);
    await expect(page.getByRole("textbox", { name: "Page title" })).toHaveValue("Renamed page");
    await page.getByRole("tab", { name: "HTML" }).click();
    await expect(page.getByRole("textbox", { name: "Page HTML" })).toHaveValue("<h1>Keep me</h1>");
  });
});

test.describe("Pages editor — Interactive tab (GrapesJS)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("clicking into rendered text and typing flows through to the HTML tab", async ({ page }) => {
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);

    await page.getByRole("tab", { name: "HTML" }).click();
    await page.getByRole("textbox", { name: "Page HTML" }).fill("<h1>Hello Interactive</h1>");
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("tab", { name: "Interactive" }).click();
    // GrapesJS's Canvas always constructs (and never removes) an initial, never-rendered
    // `FrameView` alongside the real one it settles on — confirmed live: the never-rendered one
    // keeps Backbone's default `class="frame"`, only the real one reaches `class="gjs-frame"` (set
    // in `FrameView.render()`). Targeting `.gjs-frame` specifically, not a bare `iframe`, is what
    // makes this deterministic rather than a strict-mode violation on two matches.
    const canvas = page.frameLocator(".interactive-html-editor iframe.gjs-frame");
    const heading = canvas.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10_000 });

    // GrapesJS's text components activate RTE editing on double-click (`ComponentTextView.canActivate`).
    await heading.dblclick();
    await page.keyboard.press("End");
    await page.keyboard.type(" edited");

    // Blur the RTE-active element from WITHIN the same document first (GrapesJS's `rte:disable`,
    // which syncs the edited DOM back into the component model, is driven by a same-document blur
    // event) — before navigating away, which unmounts this component and calls `editor.destroy()`.
    // Destroying before that sync has a chance to run would tear the editor down with the edit still
    // only in the DOM, never folded into `getHtml()`'s output.
    await canvas.locator("body").click();

    await page.getByRole("tab", { name: "HTML" }).click();
    await expect(page.getByRole("textbox", { name: "Page HTML" })).toHaveValue(/Hello Interactive edited/);
  });

  test("an embed placeholder div survives an Interactive-tab edit byte-for-byte", async ({ page }) => {
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);

    const embedDiv = '<div data-embed-type="widget" data-embed-id="verify-embed-1"></div>';
    const html = `<h1>Before</h1>${embedDiv}<p>After edit target</p>`;

    await page.getByRole("tab", { name: "HTML" }).click();
    await page.getByRole("textbox", { name: "Page HTML" }).fill(html);
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("tab", { name: "Interactive" }).click();
    const canvas = page.frameLocator(".interactive-html-editor iframe.gjs-frame");
    const paragraph = canvas.locator("p");
    await expect(paragraph).toBeVisible({ timeout: 10_000 });

    // Edit text elsewhere on the page — the embed div itself must never be clicked or entered.
    await paragraph.dblclick();
    await page.keyboard.press("End");
    await page.keyboard.type(" — edited nearby");
    await canvas.locator("body").click();

    await page.getByRole("tab", { name: "HTML" }).click();
    const exported = await page.getByRole("textbox", { name: "Page HTML" }).inputValue();
    expect(exported).toContain(embedDiv);
    expect(exported).toContain("After edit target — edited nearby");
  });

  test("opening the Interactive tab on realistic mixed-content HTML does not crash", async ({ page }) => {
    // Reproduces the shape of a real, non-trivial page: multiple block elements, inline text mixed
    // with element children (an <a> inside a <p>), and whitespace-only text nodes between siblings
    // (the newlines in this template literal) — all of these reach GrapesJS's `isComponent` detector
    // during parsing (`ParserHtml.parseNodes` calls `detectNode` on every child node, text nodes
    // included, confirmed by reading the parser source directly), which is exactly the code path
    // `isProtectedEmbedElement` sits in. A page that is a single lone `<h1>` (the other tests here)
    // does not exercise a text node sitting as a sibling next to elements, or nested inline content.
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);

    const html = `
      <section>
        <h1>Realistic page</h1>
        <p>Some intro text with a <a href="https://example.com">link</a> inline, and more words after it.</p>
        <ul>
          <li>First item</li>
          <li>Second item with <strong>bold</strong> text</li>
        </ul>
        <div data-embed-type="widget" data-embed-id="mixed-content-embed"></div>
        <p>Closing paragraph.</p>
      </section>
    `;

    await page.getByRole("tab", { name: "HTML" }).click();
    await page.getByRole("textbox", { name: "Page HTML" }).fill(html);
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("tab", { name: "Interactive" }).click();
    const canvas = page.frameLocator(".interactive-html-editor iframe.gjs-frame");
    const closingParagraph = canvas.getByText("Closing paragraph.");
    await expect(closingParagraph).toBeVisible({ timeout: 10_000 });

    // Edit the closing paragraph, which sits after the embed div and after a whitespace-only text
    // node — the exact adjacency the crash report described.
    await closingParagraph.dblclick();
    await page.keyboard.press("End");
    await page.keyboard.type(" More.");
    await canvas.locator("body").click();

    // Pre-existing, unrelated noise in this hermetic test env: the AssistantDock's BYOK config
    // fetch and its SSE session-event connection both fail against a server that never wires up
    // live credentials here — present on every page load regardless of the Interactive tab, not
    // something this test's GrapesJS interaction could cause. Confirmed by observing them fire
    // identically on the plain "New Page" navigation before any Interactive-tab code runs.
    const KNOWN_UNRELATED_NOISE = [/BYOK/, /cannot reach the Tovu API/, /frontend session Event/];
    expect(pageErrors, `Uncaught page errors: ${pageErrors.join("; ")}`).toEqual([]);
    expect(
      consoleErrors.filter((m) => !KNOWN_UNRELATED_NOISE.some((re) => re.test(m))),
      `Unexpected console errors: ${consoleErrors.join("; ")}`
    ).toEqual([]);

    await page.getByRole("tab", { name: "HTML" }).click();
    const exported = await page.getByRole("textbox", { name: "Page HTML" }).inputValue();
    expect(exported).toContain('<div data-embed-type="widget" data-embed-id="mixed-content-embed"></div>');
    expect(exported).toContain("Closing paragraph. More.");
  });

  test("a page's own <style> block survives an Interactive-tab edit", async ({ page }) => {
    // Regression test for a real incident (2026-08-07): `editor.getHtml()` alone does NOT include
    // GrapesJS's CSS — HTML (component tree) and CSS (CssComposer) are separate outputs
    // (`getHtml()`/`getCss()`). Before any edit, GrapesJS passes an unparsed `<style>` block through
    // untouched, which masks the bug; the moment a real edit triggers GrapesJS's component-tree
    // re-sync, `getHtml()` rebuilds from the component model alone and the entire `<style>` block —
    // and every rule in it — silently vanishes from what gets saved. Confirmed live against the
    // actual production page this happened on: one text edit took the saved HTML from 8215 characters
    // down to 3160, with the `<style>` block and all CSS rules gone, only the typed edit surviving.
    // The fix combines `editor.getCss()` with `editor.getHtml()` — this test exists so that fix can
    // never silently regress back to `getHtml()` alone.
    await page.goto("/admin/pages");
    await page.getByRole("button", { name: "New Page" }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/[^/]+$/);

    const html =
      "<style>.card { border-radius: 12px; background: #eef; padding: 1rem; }</style>" +
      '<div class="card"><h1>Styled card</h1><p>Some body text.</p></div>';

    await page.getByRole("tab", { name: "HTML" }).click();
    await page.getByRole("textbox", { name: "Page HTML" }).fill(html);
    await page.getByRole("button", { name: /^Save/ }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("tab", { name: "Interactive" }).click();
    const canvas = page.frameLocator(".interactive-html-editor iframe.gjs-frame");
    const paragraph = canvas.locator("p");
    await expect(paragraph).toBeVisible({ timeout: 10_000 });

    // A real edit — this is what triggers GrapesJS's component-tree re-sync that dropped the CSS.
    await paragraph.dblclick();
    await page.keyboard.press("End");
    await page.keyboard.type(" Edited.");
    await canvas.locator("body").click();

    await page.getByRole("tab", { name: "HTML" }).click();
    const exported = await page.getByRole("textbox", { name: "Page HTML" }).inputValue();
    // GrapesJS expands shorthands into longhands on export (`border-radius` -> the four
    // `border-*-radius` properties, `background` -> `background-color` + friends) — semantically
    // equivalent, so assert on the actual values surviving rather than the original property names.
    expect(exported).toContain("<style>");
    expect(exported).toContain("12px");
    expect(exported).toMatch(/rgb\(\s*238,\s*238,\s*255\s*\)/);
    expect(exported).toContain("Some body text. Edited.");

    // The saved CSS must be readable, not the single dense line GrapesJS's own `getCss()`
    // produces (`InteractiveHtmlEditor.hooks.tsx`'s `prettifyCss` formats it before it's saved) —
    // an operator opening the HTML tab after an edit should see indented rules, not a minified blob.
    const styleBlock = exported.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(styleBlock.split("\n").length).toBeGreaterThan(1);
    expect(styleBlock).toMatch(/\n\s+border-top-left-radius: 12px;/);

    // Check the rule on its intended element after saving and reopening the page.
    const url = page.url();
    const savedHtml = page.waitForResponse((response) =>
      response.request().method() === "PUT" && /\/pages\/[^/]+\/html$/.test(new URL(response.url()).pathname)
    );
    await page.getByRole("button", { name: /^Save/ }).click();
    expect((await savedHtml).status()).toBe(200);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.goto(url);
    await page.getByRole("tab", { name: "Preview" }).click();
    const savedCard = page.frameLocator('iframe[title="Page preview"]').locator(".card");
    await expect(savedCard).toContainText("Some body text. Edited.");
    await expect(savedCard).toHaveCSS("border-top-left-radius", "12px");
    await expect(savedCard).toHaveCSS("background-color", "rgb(238, 238, 255)");
  });
});
