import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/** Absolute — `addStyleTag`'s `path` option resolves against `process.cwd()` at test-run time,
 *  which varies by how the suite is invoked; anchoring to `__dirname` (this file's own directory,
 *  matching `byok-google-live-smoke.spec.ts`/`placeholder-tabs-card-parity.spec.ts`'s own
 *  precedent in this directory) makes the fixture path invocation-independent. */
const BASIC_THEME_CSS_PATH = path.resolve(__dirname, "../../src/themes/static/basic/css/styles.css");

/**
 * @file Regression coverage for the owner-reported bug (2026-08-12): "embed an image [in the
 * post editor]. It's showing up really bad, like, excessively large." Reproduced live (private
 * headless Chromium against the real dev server, before any fix) with a 2400x1500 test image: the
 * inserted `<img>` rendered at its raw intrinsic size — `max-width: none`, `display: inline` —
 * blowing out the whole editor pane, on BOTH insertion paths this editor supports.
 *
 * Root cause: `apps/admin/src/styles.css` had `.editor-body .tiptap` rules for paragraphs, code
 * blocks, blockquotes, etc., but no `img` rule at all — an asymmetry with the public theme, which
 * already constrains `.post-detail-body img`. The fix adds one scoped rule mirroring the public
 * theme's own values (`max-width: 100%; height: auto; display: block; border-radius: 10px;
 * margin: 20px 0;`), matched to the pane in test 1 below and matched to the public theme's own
 * values in test 2.
 *
 * A SECOND, related bug was found while verifying the public side per this dispatch's own "check
 * both renderers" instruction (this project has shipped fixes that looked right in one of the two
 * post renderers — Tiptap in-browser vs. `render.ts`'s hand-written `renderDocNode` — while wrong
 * or absent in the other, multiple times before): the public theme's `.post-detail-body img` rule
 * had `max-width: 100%` but no `height: auto`. `render.ts`'s `renderImageTag` emits `width`/
 * `height` HTML attributes independently whenever a media asset has that metadata stored — a real,
 * reachable shape, not hypothetical. Without `height: auto`, the browser's own presentational-hint
 * mapping for the HTML `height` attribute wins over the shrunk `max-width`, squashing the image
 * instead of scaling it. Confirmed live via a standalone HTML fixture loading the theme's real
 * stylesheet with a real PNG carrying both attributes: pre-fix, a 2400x1500 source rendered at
 * 720x1500 (visibly squashed); post-fix, 720x450 (aspect ratio preserved). Test 3 below locks this
 * in at the CSS-rule level (`getComputedStyle`) since the e2e harness has no fixture post whose
 * image node carries stored width/height metadata to exercise the full render path live — see that
 * test's own comment for why a rule-level assertion is the right-sized proof here, not a gap.
 *
 * Both the editor rule and the public theme rule are asserted directly against `getComputedStyle`
 * (this project's own memory: CSS presence is not proof of precedence — a prior bug shipped twice
 * from confirming a rule existed without confirming it actually won against everything else in the
 * cascade).
 */

const BIG_SVG_DATA_URI =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1500"><rect width="2400" height="1500" fill="#4caf7a"/></svg>'
  );

/** Copied (not imported) from `post-editor-preview-branches.spec.ts` — see that file's own header
 *  for why this directory duplicates small scenario setup instead of sharing it. */
async function openFreshPost(page: Page): Promise<{ id: string; slug: string }> {
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  const slug = await page.getByLabel("URL slug").inputValue();
  return { id, slug };
}

/** Reads the box a real browser would paint from, not just declared CSS — `getBoundingClientRect`
 *  plus the three cascade-precedence properties this bug (and its public-theme sibling) hinge on. */
async function measureImage(locator: Locator) {
  return locator.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      width: rect.width,
      height: rect.height,
      naturalWidth: (el as HTMLImageElement).naturalWidth,
      naturalHeight: (el as HTMLImageElement).naturalHeight,
      maxWidth: style.maxWidth,
      height_css: style.height,
      display: style.display,
    };
  });
}

test.describe("post editor — inserted image sizing", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("an image inserted via 'Img by URL' is constrained to the editor pane, not its raw intrinsic size", async ({
    page,
  }) => {
    await openFreshPost(page);
    const editorBody = page.locator(".editor-body");
    const paneWidth = await editorBody.evaluate((el) => el.getBoundingClientRect().width);

    page.once("dialog", (dialog) => dialog.accept(BIG_SVG_DATA_URI));
    await page.click('button[title="Insert image by URL"]');

    const img = page.locator('[data-agent-element="post-body"] img').last();
    await img.waitFor({ state: "attached", timeout: 5000 });
    const m = await measureImage(img);

    // The regression: pre-fix this was `naturalWidth` (2400) with `maxWidth: "none"`, overflowing
    // the pane. Post-fix it must be constrained to (at most) the pane's own width, scaled down from
    // the 2400x1500 source with its aspect ratio intact.
    expect(m.naturalWidth).toBe(2400);
    expect(m.width).toBeLessThanOrEqual(paneWidth + 1); // +1: sub-pixel rounding
    expect(m.width).toBeLessThan(m.naturalWidth);
    expect(m.maxWidth).toBe("100%");
    expect(m.display).toBe("block");
    expect(m.height / m.width).toBeCloseTo(1500 / 2400, 2);
  });

  test("an image inserted by drag/paste upload (FileHandler -> MediaImage node view) is equally constrained", async ({
    page,
  }) => {
    await openFreshPost(page);
    const editorBody = page.locator(".editor-body");
    const paneWidth = await editorBody.evaluate((el) => el.getBoundingClientRect().width);

    // Builds a real 2400x1500 PNG in-browser (canvas -> toBlob -> File) so this test needs no
    // binary fixture checked into the repo, then dispatches a real `drop` DragEvent onto the
    // ProseMirror editable — the same path `FileHandler.onDrop` (`use-post-editor.hooks.ts`)
    // listens on. TOVU_DB=memory for this suite's hermetic server (see
    // `playwright.post-editor.config.ts`), so the resulting upload is discarded with the rest of
    // the test DB — unlike the live dev server, no manual cleanup is needed here.
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2400;
      canvas.height = 1500;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#4caf7a";
      ctx.fillRect(0, 0, 2400, 1500);
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
      const file = new File([blob], "big-drop-test.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const target = document.querySelector('[data-agent-element="post-body"] .ProseMirror')!;
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(
        new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        })
      );
    });

    const img = page.locator(".media-image-node__preview").last();
    await img.waitFor({ state: "attached", timeout: 15_000 });
    const m = await measureImage(img);

    expect(m.naturalWidth).toBe(2400);
    expect(m.width).toBeLessThanOrEqual(paneWidth + 1);
    expect(m.width).toBeLessThan(m.naturalWidth);
    expect(m.maxWidth).toBe("100%");
    expect(m.display).toBe("block");
    expect(m.height / m.width).toBeCloseTo(1500 / 2400, 2);
  });
});

test.describe("public theme — post body image sizing (the second bug this dispatch found)", () => {
  /**
   * `render.ts`'s `renderImageTag` emits BOTH `width` and `height` HTML attributes whenever a
   * media asset has that metadata stored (`meta?.width`/`meta?.height`, independent of each
   * other). This suite's hermetic post has no such asset (creating one needs a real upload +
   * transform-registry entry, which is what test 2 above already exercises against the ADMIN
   * side of the same node). What matters for THIS bug is the CSS rule alone: given an `<img>`
   * with explicit `width`/`height` attributes, does `.post-detail-body img` preserve aspect ratio
   * or squash it? That is a direct, deterministic function of the stylesheet, asserted here
   * against a minimal fixture that loads the real theme CSS — not a live post render, but not a
   * gap either, since the CSS rule (not the render path that reaches it) is what this dispatch
   * changed.
   */
  test("`.post-detail-body img` scales height when the img carries explicit width/height attributes", async ({
    page,
  }) => {
    await page.setContent(`<!doctype html><html><body>
      <div class="post-detail-body">
        <img id="probe" width="2400" height="1500"
             src="data:image/svg+xml,${encodeURIComponent(
               '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1500"><rect width="2400" height="1500" fill="#4caf7a"/></svg>'
             )}" alt="probe">
      </div>
    </body></html>`);
    await page.addStyleTag({ path: BASIC_THEME_CSS_PATH });

    const img = page.locator("#probe");
    const m = await measureImage(img);

    // Pre-fix this was `height_css: "1500px"` regardless of the shrunk width — a squashed image.
    expect(m.maxWidth).toBe("100%");
    expect(m.height / m.width).toBeCloseTo(1500 / 2400, 2);
  });
});
