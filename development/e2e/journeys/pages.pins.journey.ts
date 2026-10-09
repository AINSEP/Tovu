// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { loginAsAdmin } from "../support/bug-pin-auth.js";

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

// Migrated from pages-editor-scroll-flush.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: pages-editor-scroll-flush", () => {
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
    // STALE PIN 2026-10-07: f65fb186a (2026-10-05) moved the preview into an opaque origin and
    // documented "per-tab preview scroll memory no longer works" as an accepted cost on
    // PAGE_PREVIEW_IFRAME_SANDBOX, so the behaviour this pinned was removed on purpose.
    test.skip(true, "Preview scroll memory was dropped on purpose by f65fb186a (opaque-origin preview)");
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
});

// Migrated from pages-editor.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: pages-editor", () => {
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

    await page.getByRole("button", { name: "Save •", exact: true }).click();
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
    // STALE PIN UPDATED 2026-10-07: f65fb186a (2026-10-05) made that owner decision and dropped
    // `allow-same-origin`, so preview script runs in an opaque origin.
    expect(sandbox.split(/\s+/).sort()).toEqual(["allow-forms", "allow-popups", "allow-scripts"]);
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
    // The page save and the independent "Save categories & tags" action are both present.
    await page.getByRole("button", { name: "Save •", exact: true }).click();
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
    await page.getByRole("button", { name: "Save •", exact: true }).click();
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
    await page.getByRole("button", { name: "Save •", exact: true }).click();
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
    // STALE PIN UPDATED 2026-10-07: the HTML tab shows a display-only pretty-printed copy
    // (7421b8055, `lib/prettify-html.ts`), which puts an empty element's close tag on its own line.
    // The marker's attributes must survive untouched; only that display whitespace may differ.
    expect(exported).toMatch(/<div data-embed-type="widget" data-embed-id="verify-embed-1">\s*<\/div>/);
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
    await page.getByRole("button", { name: "Save •", exact: true }).click();
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
    // STALE PIN UPDATED 2026-10-07: pretty-printed display copy, see the embed pin above.
    expect(exported).toMatch(/<div data-embed-type="widget" data-embed-id="mixed-content-embed">\s*<\/div>/);
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
    // STALE PIN UPDATED 2026-10-07: a pure text edit now splices into the ORIGINAL source
    // (`@jini-ai/ui` html-editor `serializeWithSplice`), so the authored `<style>` block comes back
    // verbatim instead of GrapesJS's expanded, rgb() re-serialization. The fallback path below
    // still applies after structural edits only.
    expect(exported).toContain("<style>.card { border-radius: 12px; background: #eef; padding: 1rem; }</style>");
    expect(exported).toContain("Some body text. Edited.");

    // The saved CSS must be readable, not the single dense line GrapesJS's own `getCss()`
    // produces (`InteractiveHtmlEditor.hooks.tsx`'s `prettifyCss` formats it before it's saved) —
    // an operator opening the HTML tab after an edit should see indented rules, not a minified blob.
    // (Spliced output keeps the operator's own formatting, so there is no GrapesJS blob to check.)

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
});
