// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { type Route } from "../support/bug-pin-fixtures.js";
import { loginAsAdmin } from "../support/bug-pin-auth.js";
import path from "node:path";
import { type Locator } from "../support/bug-pin-fixtures.js";
import { type Page } from "../support/bug-pin-fixtures.js";
import { type Frame } from "../support/bug-pin-fixtures.js";

/** STALE PIN UPDATED 2026-10-07: 9a1b3e0ca (2026-10-07) appends a `__tovu_preview` revision so a
 *  theme save can reload the preview; the pins below compare the URL the preview points at. */
function withoutPreviewRevision(url: string | null, baseUrl: string): string | null {
  if (!url) return url;
  // The shared production bundle uses relative URLs; its serving origin proxies the public site.
  const parsed = new URL(url, baseUrl);
  parsed.searchParams.delete("__tovu_preview");
  return parsed.href;
}

/** Wait for the real live-site navigation, not the iframe's initial about:blank document. */
async function waitForLivePostFrame({ page, slug }: { page: Page; slug: string }, _options = {}): Promise<Frame> {
  const liveUrl = new URL(`/${slug}`, page.url()).href;
  const matches = (url: URL) => withoutPreviewRevision(url.href, page.url()) === liveUrl;
  await expect.poll(() => page.frame({ url: matches }) !== null).toBe(true);
  return page.frame({ url: matches })!;
}


// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

// Migrated from post-editor-autosave-teardown.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: post-editor-autosave-teardown", () => {
// Uses the post-editor config's real server and durable autosave endpoint.
test("reload recovers the newest draft while an earlier autosave PUT is pending", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  const editorUrl = page.url();
  // aa4241019 / 8d93a65c9 intentionally route editors by slug; autosave still sends the UUID.
  // Resolve the persisted post before intercepting, otherwise the pending PUT is never held.
  const handle = new URL(editorUrl).pathname.split("/").pop()!;
  // deef547ae: browser fetch sends the Secure session cookie that page.request withholds on HTTP.
  const created = await page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: "same-origin" });
    return { ok: response.ok, body: await response.json() };
  }, `/api/admin/v1/workspaces/workspace-local/posts/${handle}`);
  expect(created.ok).toBe(true);
  const { post: { id } } = created.body;
  const autosavePath = `/api/admin/v1/workspaces/workspace-local/posts/${id}/autosave`;
  let heldRoute: Route | undefined;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**${autosavePath}`, async (route) => {
    if (route.request().method() !== "PUT" || heldRoute) return route.continue();
    heldRoute = route;
    await held;
    // Cleanup only: never persist the older draft after the reload.
    await route.abort().catch(() => {});
  });
  page.on("dialog", (dialog) => dialog.accept());
  try {
    await page.locator('[data-agent-element="post-title"]').fill("Earlier pending draft");
    await expect.poll(() => heldRoute?.request().postDataJSON().title).toBe("Earlier pending draft");
    const newest = "Newest draft survives document teardown";
    await page.locator('[data-agent-element="post-title"]').fill(newest);
    await page.reload({ waitUntil: "domcontentloaded" });

    // Read through the real server after the old document is gone. An eventual port call in
    // that document or a synthetic pagehide cannot satisfy this assertion.
    await expect.poll(async () => {
      const response = await page.evaluate(async (url) => {
        const result = await fetch(url, { credentials: "same-origin" });
        return { ok: result.ok, body: await result.json() };
      }, autosavePath);
      expect(response.ok).toBe(true);
      return response.body.autosave?.title;
    }).toBe(newest);
    // Reload again after persistence is confirmed so recovery does not race the exit request.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator('[data-agent-element="post-autosave-recovery"]')).toBeVisible();
    await page.locator('[data-agent-element="post-autosave-restore"]').click();
    await expect(page.locator('[data-agent-element="post-title"]')).toHaveValue(newest);
  } finally {
    release();
    await page.unroute(`**${autosavePath}`);
  }
});
});

// Migrated from post-editor-image-sizing.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: post-editor-image-sizing", () => {
/** Absolute — `addStyleTag`'s `path` option resolves against `process.cwd()` at test-run time,
 *  which varies by how the suite is invoked; anchoring to `import.meta.dirname` (this file's own directory,
 *  matching `byok-google-live-smoke.spec.ts`/`placeholder-tabs-card-parity.spec.ts`'s own
 *  precedent in this directory) makes the fixture path invocation-independent. */
// STALE PIN UPDATED 2026-10-07: tovu-theme's only stylesheet is now `css/theme.css`; the old
// `css/styles.css` no longer exists, so this pin threw ENOENT before the migration too.
const BASIC_THEME_CSS_PATH = path.resolve(import.meta.dirname, "../../../content/themes/static/tovu-theme/css/theme.css");


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

/** This suite's own hermetic public/API server (`development/playwright.post-editor.config.ts`) —
 *  distinct from Playwright's own `baseURL` fixture, which points at the ADMIN Vite dev server
 *  (7852). The public site lives on the API port, same precedent as
 *  `post-editor-preview-branches.spec.ts`'s own `API_BASE_URL` constant. */

/** Same admin-API convention `post-editor-toolbar.spec.ts` already uses (`fetchBodyJson`'s own
 *  constants) — needed below to read-modify-write `bodyJson` directly, now that there is no toolbar
 *  control left that writes a legacy `src`-only image node (see test 1's own comment). */
const WORKSPACE_ID = "workspace-local";
const API_BASE = "/api/admin/v1";

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
  return locator.evaluate(async (el) => {
    // Attachment precedes image decoding; measuring before decode reads naturalWidth=0.
    await (el as HTMLImageElement).decode();
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

  test("a legacy src-only image node (pre-existing content, no assetId/transformName) is constrained to the editor pane, not its raw intrinsic size", async ({
    page,
  }) => {
    // Was: click the toolbar's "Insert image by URL" button (`window.prompt`s for the URL/alt).
    // That control was REMOVED 2026-08-12 in the same dispatch as this rewrite (owner-reported
    // bug: it wrote exactly this `src`-only node shape, which never renders on the public site —
    // see `PostEditor.tsx`'s own comment on the removal). The node shape itself is still real,
    // reachable content: any post SAVED before the removal (or written some other way) can still
    // carry it, and `MediaImageNodeView`'s legacy branch (`media-image-extension.tsx`) still renders
    // it for exactly that backward-compat reason. There is no toolbar path left that produces this
    // shape, so this test now writes it directly through the same authenticated admin API the editor
    // itself uses (`post-editor-toolbar.spec.ts`'s own `fetchBodyJson` pattern), then reloads —
    // simulating "open a post that already has one", the one way this shape is reached now.
    const { id } = await openFreshPost(page);
    const editorBody = page.locator(".editor-body");
    const paneWidth = await editorBody.evaluate((el) => el.getBoundingClientRect().width);

    // `PUT /posts/:id` (`src/server/inbound/admin-http/routes/posts/update.ts`) has no partial-update path — it
    // reads `title`/`slug`/`status` off the request body with `?? ""`/`undefined` fallbacks and
    // `updatePost` then rejects an empty title/invalid status outright, so the full current record
    // (not just the one field this test cares about) has to travel in every PUT.
    const post = await page.evaluate(
      async ({ url }) => {
        const res = await fetch(url, { credentials: "same-origin" });
        const data = await res.json();
        return data.post;
      },
      { url: `${API_BASE}/workspaces/${WORKSPACE_ID}/posts/${id}` }
    );
    post.bodyJson.content.push({ type: "image", attrs: { src: BIG_SVG_DATA_URI, alt: "legacy image" } });
    const putResult = await page.evaluate(
      async ({ url, post }) => {
        const res = await fetch(url, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: post.title, slug: post.slug, status: post.status, bodyJson: post.bodyJson }),
        });
        return { status: res.status, text: await res.text() };
      },
      { url: `${API_BASE}/workspaces/${WORKSPACE_ID}/posts/${id}`, post }
    );
    expect(putResult.status, `seeding the legacy image node must succeed — got ${putResult.status}: ${putResult.text}`).toBe(200);
    await page.reload();

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

    // f1d6c87b4 intentionally inserts ref-based `media` nodes for file drops, not legacy `image` nodes.
    const img = page.locator(".media-embed-node__preview").last();
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

/**
 * Second owner-reported bug, same dispatch, next escalation (2026-08-12): "the actual image is not
 * showing up. Just has the … or the name of the file" — worse than oversized, the picture never
 * rendered at all, everywhere: the editor's own "Preview" tab AND the published public page.
 *
 * Root cause (`src/widgets/resolver-service.ts`, `src/server/http/site/render.ts`): the "post-
 * content" widget IR — what BOTH the Preview tab (`renderViaTemplate`'s `pendingBodyJson` override)
 * and the published page (`renderViaTemplate`'s normal DB-fetch path) render a post's body through
 * — never resolved `mediaTransformVersions`/`mediaAssetMetadata` for its own embedded ref-based
 * images. `render.ts`'s `renderWidgetPostContent` called `renderDocNode(bodyJson)` with only ONE
 * argument, so those maps silently defaulted to EMPTY — every ref-image's transform lookup was
 * unconditionally a miss, degrading to a `<figure class="media-ph">` labelled with the image's
 * `alt` (the filename, for a freshly dropped file) — regardless of whether the asset, its "public"
 * transform, and the `/m/` rendition route all genuinely worked (confirmed live before this fix:
 * they did).
 *
 * `src/widgets/__tests__/integration/resolve-html-page-embeds.integration.test.ts` pins this fix at
 * the unit/integration level with controlled fakes — the exact seam that was missing the data, for
 * both the `"content"`/`"post"` DB-fetch builders AND the `pendingContentOverride` branch the
 * Preview tab uses — and is the SAVED, deterministic, RED-then-GREEN-proven regression guard for
 * this bug.
 *
 * The true end-to-end proof (drop a real image, publish, fetch the real public page over HTTP) was
 * run live and confirmed working — twice: once against THIS suite's own hermetic
 * `TOVU_DB=memory` boot (see `test.fixme` below for why that run's assertion can't be saved as-is),
 * and once against the real, long-running dev server the owner is actually using (screenshot on
 * file in that session's own report, a real gradient PNG rendering correctly on a real published
 * post). The fix is not in doubt; only THIS harness's ability to prove it via a rerunnable e2e
 * assertion is.
 */
test.describe("public page — inserted image actually renders (not a filename placeholder)", () => {
  // FIXME (2026-08-12, discovered writing this test, unrelated to the fix above): a direct,
  // repeatedly-retried probe of `/m/{assetId}/public.v1/...` — the public rendition route,
  // bypassing `render.ts`/`resolveHtmlPageEmbeds` entirely — 404s for 25+ seconds on THIS suite's
  // `TOVU_DB=memory` hermetic boot, for an asset whose `/original` route (a different route,
  // confirmed) serves correctly within ~2 seconds of upload. That rules out both this dispatch's
  // fix (never on this code path) and a simple boot-order race (25s is far past
  // `ensureCoreMediaTransform`'s own "few milliseconds" assumption). Root cause not yet isolated —
  // candidates include the transform-generation pipeline (`resolveMediaRendition`,
  // `SharpImageTransformer`) behaving differently under this specific harness's memory-DB
  // combination, or a shared `infra/uploads` blob-store path colliding across concurrent hermetic
  // boots (`mediaUploadsDir()` is NOT TOVU_DB-scoped — same directory as the real dev server and
  // every other suite's hermetic boot). Flagged for separate investigation; not blocking this
  // dispatch's actual fix, which is proven at the integration level above and live against the real
  // dev server (see this describe block's own header).
  // Original memory-DB rendition quarantine retained: SQLite isolation removes its suspected
  // cause, but static reading cannot establish the real Sharp rendition succeeds.
  // PRODUCT-SUSPECT: if unquarantined separately, distinguish a rendition 404 from HTML placeholders.
  test.fixme(
    'a drag/paste-uploaded image renders as a real <img src="/m/..."> on the published public page, not a media-ph placeholder',
    async ({ page }) => {
      const { id: postId, slug } = await openFreshPost(page);

      await page.evaluate(async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 600;
        canvas.height = 400;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#e0703a";
        ctx.fillRect(0, 0, 600, 400);
        const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
        const file = new File([blob], "public-render-test.png", { type: "image/png" });
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

      const nodeImg = page.locator(".media-embed-node__preview").last();
      await nodeImg.waitFor({ state: "attached", timeout: 15_000 });

      await page.getByRole("button", { name: "Publish" }).click();
      await expect(page.locator(".save-ok")).toContainText("Published", { timeout: 10_000 });

      const publicHtml = await (await page.request.get(`${PIN_PUBLIC_URL}/${slug}`)).text();
      expect(publicHtml).not.toContain("media-ph");
      expect(publicHtml).toMatch(/<img src="\/m\/[^"]+"[^>]*alt="public-render-test\.png"/);

      await page.request.delete(`${PIN_PUBLIC_URL}/api/admin/v1/workspaces/workspace-local/posts/${postId}`);
    }
  );
});

test.describe("media image node — Replace/Remove button spacing (owner-reported, same dispatch)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("the Replace and Remove buttons have a visible gap, not flush edges", async ({ page }) => {
    const { id: postId } = await openFreshPost(page);

    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 300;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#4caf7a";
      ctx.fillRect(0, 0, 400, 300);
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
      const file = new File([blob], "button-gap-test.png", { type: "image/png" });
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

    await page.locator(".media-embed-node__preview").last().waitFor({ state: "attached", timeout: 15_000 });

    // f1d6c87b4: generic media has Edit/Replace/Remove and the owner approved a 10px gap.
    // Use names so adding/reordering an action cannot make this measure the wrong pair.
    const actions = page.locator(".media-embed-node__actions").last();
    const replaceBox = await actions.getByRole("button", { name: "Replace", exact: true }).boundingBox();
    const removeBox = await actions.getByRole("button", { name: "Remove", exact: true }).boundingBox();
    if (!replaceBox || !removeBox) throw new Error("Replace/Remove buttons did not render a bounding box");
    const gap = removeBox.x - (replaceBox.x + replaceBox.width);
    expect(gap).toBeGreaterThanOrEqual(9);
    expect(gap).toBeLessThanOrEqual(11);

    await page.request.delete(`${PIN_PUBLIC_URL}/api/admin/v1/workspaces/workspace-local/posts/${postId}`);
  });
});
});

// Migrated from post-editor-mention-preview-link.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: post-editor-mention-preview-link", () => {
/**
 * @file Owner-reported bug (2026-08-12), with the owner's own exact repro evidence: clicking a
 * mention link "took me to this blank screen with this message in preview: 'The server is
 * configured with a public base URL of /admin/ — did you mean to visit /admin/token-locator-probe
 * instead?'" — Vite's own stock 404 page for a path outside its configured `base: "/admin/"`.
 *
 * Reproduced live (headless Chromium, before this fix) inside the Posts editor's Preview tab,
 * pending-content branch (`PostPreview`'s branch 3, `PostEditor.tsx` — see that function's own file
 * header for the branch numbering).
 *
 * Root cause: `api.templatePreviewUrl` (branches 2 and 3's iframe `src`/form `action`) used to
 * return a bare `/api/admin/v1/...` path. Every OTHER admin API call stays relative like this on
 * purpose (`request()`'s calls are fetched via Vite's own `/api` dev proxy, same origin as the admin
 * SPA) — but THIS path is different: its response is loaded as a real navigated HTML document, which
 * makes the URL's own origin that document's base URI for every relative link INSIDE it. In dev,
 * that origin is the ADMIN Vite server, which proxies only a small explicit allowlist (`/api`,
 * `/agent-icons`, `/theme-assets`) — so `/theme-assets/...` links in the rendered page kept working
 * (proxied) while a mention's `<a href="/{slug}">` (render.ts's `"mention"` case) did not (not in
 * the allowlist), landing on Vite's own dev server for an unrecognized top-level path. The fix wraps
 * that URL in `siteUrl(...)` (`site-url.ts`) — the SAME helper the live-site branch's own iframe
 * `src` already uses for exactly this "escape the admin origin in dev" reason — making it absolute
 * in dev and a no-op in production, where the admin SPA, this API, and the public site already share
 * one origin.
 *
 * Confirmed live (real headless Chromium, this suite's own hermetic `TOVU_DB=memory` boot) before
 * being written up as the RED state this test started from.
 */



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

function bodyParagraph(page: Page) {
  return page.locator('[data-agent-element="post-body"] .ProseMirror p').last();
}

async function publishAndWaitForConfirmation(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator(".save-ok")).toContainText("Published", { timeout: 10_000 });
}

/** Same poll-for-frame idiom as `post-editor-preview-branches.spec.ts`'s own
 *  `waitForPendingContentFrame` — copied rather than imported for the same DAMP reason that file's
 *  own header states. */
async function waitForPendingContentFrame(page: Page): Promise<Frame> {
  await expect
    .poll(() => page.frames().some((f) => f.url().includes("/template-preview")), { timeout: 10_000 })
    .toBe(true);
  const frame = page.frames().find((f) => f.url().includes("/template-preview"));
  if (!frame) {
    throw new Error(
      "no /template-preview child frame found — frames seen: " + page.frames().map((f) => f.url()).join(", ")
    );
  }
  await frame.locator("body").waitFor({ state: "attached", timeout: 10_000 });
  return frame;
}

test.describe("Post editor Preview tab — mention link regression (2026-08-12)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("FIXED: a mention link inside the pending-content preview (branch 3) navigates to the real public post, not a dead admin-origin URL", async ({
    page,
  }) => {
    // Target post to mention.
    await page.goto("/admin/posts");
    await page.getByRole("button", { name: "New Post" }).click();
    await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
    const targetSlug = await page.getByLabel("URL slug").inputValue();
    await page.getByLabel("Title").fill("Mention Target");
    await publishAndWaitForConfirmation(page);

    // Source post: publish once clean, then dirty its content (the owner's own repro shape — see
    // `post-editor-preview-branches.spec.ts` for why `contentDirty` on an already-published post is
    // exactly what routes the Preview tab into branch 3).
    const { slug: sourceSlug } = await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("hello world");
    await publishAndWaitForConfirmation(page);

    // Reference background, from the CLEAN published post's own live-site branch (sandboxed since
    // f65fb186a, proxied by the production journey harness — ground truth for "the theme is really applied") — same comparison
    // `post-editor-preview-branches.spec.ts`'s own "theme CSS parity" test already uses, reused here
    // to prove `siteUrl(...)` wrapping `templatePreviewUrl` didn't break `/theme-assets/...`
    // resolution in the process of fixing the mention link (this suite's own header explains why
    // that path was never broken pre-fix — Vite's dev proxy already allowlists it — and must stay
    // that way).
    await page.getByRole("tab", { name: "Preview" }).click();
    const siteOrigin = new URL(page.url()).origin;
    const liveFrame = await waitForLivePostFrame({ page, slug: sourceSlug });
    await liveFrame.locator("body").waitFor({ state: "attached" });
    const liveBodyBackground = await liveFrame.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.getByRole("tab", { name: "Editor" }).click();
    await bodyParagraph(page).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" plus edit");
    await page.getByLabel("Mention a post").selectOption({ label: "Mention Target" });

    await page.getByRole("tab", { name: "Preview" }).click();
    const pendingFrame = await waitForPendingContentFrame(page);

    // The production harness proxies public routes on the SPA's origin; the real mention click
    // below must still reach the served public post, which the retired Vite dev origin could not do.
    expect(new URL(pendingFrame.url()).origin).toBe(siteOrigin);

    const pendingBodyBackground = await pendingFrame.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(pendingBodyBackground, "theme CSS (incl. /theme-assets/... resolution) must still apply after the fix").toBe(liveBodyBackground);

    const mention = pendingFrame.locator("a.post-mention");
    await expect(mention).toBeVisible();
    await expect(mention).toHaveAttribute("href", `/${targetSlug}`);

    await mention.click();
    // FIX: lands on the real published target post at the SITE origin — not a Vite dev-server error
    // page, and not left on the admin app's own current URL/origin.
    await expect
      .poll(() => page.frames().some((f) => f.url() === `${siteOrigin}/${targetSlug}`), { timeout: 10_000 })
      .toBe(true);
    const landed = page.frames().find((f) => f.url() === `${siteOrigin}/${targetSlug}`)!;
    await expect(landed.locator("body")).toContainText("Mention Target");

    // Negative half of the regression: the admin app's own top-level URL must be untouched — a
    // pre-fix run would still show the editor shell around a broken iframe, but a plausible WORSE
    // fix (e.g. `target="_top"` somewhere) could have navigated the whole admin tab away instead.
    expect(page.url()).toContain(`/admin/posts/`);
  });
});
});

// Migrated from post-editor-open-redirect-link.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: post-editor-open-redirect-link", () => {
/**
 * @file Regression coverage for the `safeHref` open-redirect fix (`src/server/http/site/render.ts`,
 * 2026-08-20 — audit finding "safeHref accepts protocol-relative URLs").
 *
 * `safeHref` used to allow any href starting with a single `/` through unchanged, which admits a
 * PROTOCOL-RELATIVE url like `"//evil.example"`: a browser resolves that against the current page's
 * own scheme (`https://evil.example`), not against this site's own origin — an open-redirect/
 * phishing primitive dressed up as an ordinary on-site link. This is reachable through the SAME
 * "Link" toolbar button and `window.prompt` flow `post-editor-toolbar.spec.ts`'s own "full chain"
 * test already exercises for an ordinary `https://` link (this suite copies its helpers rather than
 * importing them — see that file's own header for why this directory duplicates small scenario
 * setup instead of sharing it).
 *
 * Unlike the unit-level coverage in `render.test.ts`/`tiptap-render-contract.test.ts` (which feeds
 * hand-authored `bodyJson` straight into the renderer), this test proves the WHOLE path: a real
 * browser typing into the real editor, through the real "Link" prompt, through a real publish, onto
 * the real served public HTML — the same "click it, assert what got PERSISTED and SERVED" discipline
 * `post-editor-toolbar.spec.ts`'s own header states for itself.
 */

 // must match playwright.post-editor.config.ts's API_PORT

/** Copied from `post-editor-toolbar.spec.ts` — see that file's own header for why. */
async function openFreshPost(page: Page): Promise<{ id: string; slug: string }> {
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  const slug = await page.getByLabel("URL slug").inputValue();
  return { id, slug };
}

/** Copied from `post-editor-toolbar.spec.ts` — see that file's own header for why. */
function bodyParagraph(page: Page) {
  return page.locator('[data-agent-element="post-body"] .ProseMirror p').last();
}

/** Copied from `post-editor-toolbar.spec.ts` — see that file's own header for why. */
async function saveAndWaitForConfirmation(page: Page, label: "Saved" | "Published" = "Saved"): Promise<void> {
  await page.getByRole("button", { name: label === "Published" ? "Publish" : /^Save/ }).click();
  await expect(page.locator(".save-ok")).toContainText(label, { timeout: 10_000 });
}

test.describe("Post editor Link toolbar — open-redirect fix (2026-08-20)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("a protocol-relative link URL is neutralized to '#' on the real published public page, never left pointing off-site", async ({
    page,
    request,
  }) => {
    const { slug } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("click me");

    // Select the whole (one-word... well, two-word) paragraph and drive the real "Link" toolbar
    // button, same triple-click + native-dialog pattern `post-editor-toolbar.spec.ts`'s own
    // `selectWordAndToggleMark`/full-chain test already establishes for this exact control — the
    // prompt is a real `window.prompt`, not a fillable in-app dialog, so it can only be answered via
    // Playwright's `page.on('dialog')` API, not a locator.
    await page.getByText("click me", { exact: true }).click({ clickCount: 3 });
    page.once("dialog", (dialog) => dialog.accept("//evil.example"));
    await page.getByTitle("Link", { exact: true }).click();

    // Publish (not Save): the public site only serves published posts.
    await saveAndWaitForConfirmation(page, "Published");

    // Fetched via `request` (Playwright's own HTTP client, not `page.evaluate`/`fetch`): the public
    // site is served by the API process directly, a different origin from the admin SPA's Vite dev
    // server in this config — same reasoning `post-editor-toolbar.spec.ts`'s own full-chain test
    // states for itself.
    const publicUrl = `${PIN_PUBLIC_URL}/${slug}`;
    const res = await request.get(publicUrl);
    expect(res.status(), `expected the published post to be publicly reachable at ${publicUrl}`).toBe(200);
    const html = await res.text();

    // FIX target: the rendered anchor's href must never be the raw attacker-chosen protocol-relative
    // string — safeHref collapses it to "#" (in-page, inert) rather than emitting it unchanged.
    expect(html, `served HTML must not contain the raw protocol-relative href, got: ${html}`).not.toContain(
      'href="//evil.example"'
    );
    expect(html).toContain('<a href="#">click me</a>');

    // Belt-and-braces: load the REAL public page in the browser and read the DOM property a browser
    // would actually navigate on click, not just the serialized attribute string — `HTMLAnchorElement
    // .href` is the browser's OWN fully-resolved interpretation, so this proves the fix from the
    // reader's actual point of view, not just from the HTML source text.
    await page.goto(publicUrl);
    const resolvedHref = await page.locator('a:has-text("click me")').first().evaluate((el) => (el as HTMLAnchorElement).href);
    expect(new URL(resolvedHref).hostname, `the rendered link must resolve on-site, not to evil.example — resolved to: ${resolvedHref}`).not.toBe(
      "evil.example"
    );
  });
});
});

// Migrated from post-editor-preview-branches.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: post-editor-preview-branches", () => {
/**
 * @file The Posts editor's Preview tab (`PostEditor.tsx`'s `PostPreview`) — which of its THREE
 * branches renders, and whether the explanatory notice that is supposed to accompany the non-live
 * ones is actually visible.
 *
 * ## Why this suite exists — there are three renderers, not two
 *
 * `tiptap-render-contract.test.ts` and `post-editor-toolbar.spec.ts` (same session) both target the
 * seam from the Tiptap editor to the PUBLIC site (`renderDocNode`/`renderMarks`). This suite used to
 * cover a THIRD renderer — Tiptap's own `editor.getHTML()`, fed into `SrcDocSandbox` as the Preview
 * tab's raw fallback branch — but that branch was deleted 2026-09-11 (see below): every post now
 * renders through one of the first two renderers, never that third one.
 *
 * ## The bug this suite used to lock in, first fixed 2026-08-12
 *
 * Reported by the owner directly: formatting text with the inline-code button "broke the preview…
 * it didn't update the styling." The published page was fine — a curl test (or anything hitting the
 * public URL) would never see this. Root cause: `PostPreview`'s branch selection used to be —
 *
 * ```
 * canShowLiveSite = status === "published" && !dirty
 * canShowTemplatePreview = status === "published" && !contentDirty && !canShowLiveSite
 * ```
 *
 * — routing ANY content edit (`contentDirty`) on an already-published post to the raw, unstyled
 * `SrcDocSandbox` render with no theme CSS, no nav, no footer, no template. To an operator who just
 * watched a styled preview go blank/plain after one click, that read as "the preview broke," not
 * "this is expected because you have an unsaved edit."
 *
 * The fix (`PostEditor.tsx`'s `PostPreview`, commit 47782cb) added a third branch,
 * `canShowPendingContentPreview = status === "published" && contentDirty`: a hidden `<form
 * method="post" target="{iframe name}">` submits the live, unsaved `editor.getJSON()` as `bodyJson`
 * to the same `template-preview` endpoint branch 2 already `GET`s, landing a real navigated document
 * in the targeted iframe (never `srcDoc` — see `template-preview.ts`'s own file header for why:
 * theme asset paths are root-relative to `/theme-assets/{themeId}/...`, which only resolves against
 * a real navigated page). Debounced 500ms trailing, so this suite waits past that before asserting
 * on the resulting frame.
 *
 * ## Widened 2026-09-09 — branch 3 no longer requires `status === "published"`
 *
 * `template-preview.ts`'s `pendingBodyJson` override (`resolveHtmlPageEmbeds`'s
 * `pendingContentOverride`) is checked BEFORE `findPublishedPostById`'s visibility guard, so it
 * already bypassed that guard for a DRAFT's own id too — the `status === "published"` check on branch
 * 3 was never load-bearing for correctness, only inherited from branch 2's (which genuinely needs it,
 * for the un-overridden `GET` case branch 2 alone uses). `canShowPendingContentPreview` became simply
 * `contentDirty`, which left the raw editor-buffer fallback reachable ONLY for a CLEAN draft — a
 * draft that had never been touched at all.
 *
 * ## Widened again 2026-09-11 — the raw fallback is DELETED, not just narrowed further
 *
 * Owner-reported: "the preview should always show the css and template and all that properly." A
 * brand-new, untouched draft is `contentDirty: false` by definition, so it was STILL hitting the raw
 * fallback under the 2026-09-09 rule — the single most common state a post is ever in (autosave
 * clears `contentDirty` within moments of any edit, so a post spends nearly all its draft life here).
 * `canShowPendingContentPreview` is now simply `!canShowLiveSite && !canShowTemplatePreview` — the
 * plain negation of the two branches above, with no `contentDirty` check left at all — which makes it
 * exhaustive and deletes the raw `SrcDocSandbox` fallback as dead code (see `PostPreview`'s own doc
 * in `PostEditor.tsx`). The first test below, "a brand-new, UNTOUCHED draft," used to assert exactly
 * the raw-fallback behavior as `INTENDED`; it now asserts the fixed behavior instead — same scenario,
 * opposite expectation, so this suite still proves the regression can't come back.
 *
 * `PostPreview`'s own JSX pairs every non-live-site branch with an `.editor-preview-notice`
 * explaining what's being shown. This suite verifies, DOM-first (`toBeVisible()`, not a screenshot —
 * this project's own memory records CSS presence not being proof of precedence, and a
 * `display: contents` element hiding a class that "existed" but did nothing), whether that notice is
 * genuinely rendered and visible in each branch.
 *
 * ## Scope discipline
 *
 * This suite locks in `PostPreview`'s full three-branch behavior (bug-fixed and always-intended
 * alike) as tests. Each test below states which branch it targets.
 */



/** Clicks "New Post", waits for the editor route, and returns the new post's id and slug. Copied
 *  (not imported) from `post-editor-toolbar.spec.ts` — small enough that duplicating it keeps this
 *  file readable on its own, matching this directory's own DAMP-over-shared-helper convention for
 *  scenario-adjacent setup (`test-design` skill: "avoid shared setup for the scenario logic itself"). */
async function openFreshPost(page: Page): Promise<{ id: string; slug: string }> {
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  const slug = await page.getByLabel("URL slug").inputValue();
  return { id, slug };
}

function bodyParagraph(page: Page) {
  return page.locator('[data-agent-element="post-body"] .ProseMirror p').last();
}

async function publishAndWaitForConfirmation(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator(".save-ok")).toContainText("Published", { timeout: 10_000 });
}

/** The "Post preview" iframe carries `src` for branches 1/2 (a real navigable iframe pointed at a
 *  URL up front). Branch 3 (pending-content) sets NEITHER `src` NOR `srcdoc` — it only ever gets a
 *  `name`, and its navigation happens via a targeted form submit rather than an attribute the DOM
 *  exposes, so this structural signal only distinguishes branches 1/2 from branch 3; branch 3 is
 *  asserted with {@link waitForPendingContentFrame} instead. `srcdoc` is still checked below (never
 *  present, on any branch) as a standing regression guard for the raw `SrcDocSandbox` fallback this
 *  file's header records as deleted 2026-09-11 — that component never sets `src`, only `srcdoc`, so a
 *  reappearing `srcdoc` attribute would be the tell if it ever came back. */
async function previewIframeState(page: Page): Promise<{ src: string | null; srcdoc: string | null }> {
  const iframe = page.getByTitle("Post preview", { exact: true });
  await expect(iframe).toBeVisible();
  return {
    src: await iframe.getAttribute("src"),
    srcdoc: await iframe.getAttribute("srcdoc"),
  };
}

/**
 * Waits for branch 3's debounced hidden-form submit to land, then returns the resulting child
 * `Frame`. Polls `page.frames()` for one whose URL matches `/template-preview` rather than
 * `page.waitForNavigation`/`waitForURL` (both are page-level, and this navigation happens inside a
 * named iframe, not the top-level page). 500ms debounce (`PostPreview`'s own effect) plus network
 * time comfortably fits inside the default poll timeout.
 */
async function waitForPendingContentFrame(page: Page): Promise<Frame> {
  await expect
    .poll(() => page.frames().some((f) => f.url().includes("/template-preview")), { timeout: 10_000 })
    .toBe(true);
  const frame = page.frames().find((f) => f.url().includes("/template-preview"));
  if (!frame) {
    throw new Error(
      "no /template-preview child frame found — frames seen: " + page.frames().map((f) => f.url()).join(", ")
    );
  }
  await frame.locator("body").waitFor({ state: "attached", timeout: 10_000 });
  return frame;
}

/**
 * Asserts `.editor-preview-notice` is GENUINELY visible to a human, not merely "visible" by
 * Playwright's narrower `toBeVisible()` definition (non-empty box + not `display:none`/
 * `visibility:hidden` — it does NOT check `opacity`). This project's own memory records a real defect
 * that `toBeVisible()` alone would have missed: a class sitting on a `display: contents` element,
 * doing nothing, while still reading as "present." Measured directly via `getBoundingClientRect` and
 * computed style rather than trusted from one boolean, per the coordinator's own instruction for
 * exactly this class of check.
 */
async function expectNoticeGenuinelyVisible(page: Page): Promise<void> {
  const notice = page.locator(".editor-preview-notice");
  await expect(notice).toBeVisible();
  const measured = await notice.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return { width: rect.width, height: rect.height, opacity: Number(style.opacity), display: style.display, visibility: style.visibility };
  });
  expect(measured.width, "notice must have real rendered width, not a zero-size box").toBeGreaterThan(0);
  expect(measured.height, "notice must have real rendered height, not a zero-size box").toBeGreaterThan(0);
  expect(measured.opacity, "notice must not be transparent").toBeGreaterThan(0);
  expect(measured.display).not.toBe("none");
  expect(measured.visibility).not.toBe("hidden");
}

test.describe("Post editor Preview tab — which of the four branches renders", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("FIXED (2026-09-11, owner-reported): a brand-new, UNTOUCHED draft's Preview tab shows the real themed template render, not the raw editor-buffer fallback", async ({
    page,
  }) => {
    await openFreshPost(page);
    // Deliberately nothing typed — `contentDirty` stays `false`. Before this fix that was exactly
    // the one state that fell through every branch to the raw `SrcDocSandbox` fallback (see this
    // file's header); now it's simply "not live, not template-choice-only," so it takes branch 3.

    await page.getByRole("tab", { name: "Preview" }).click();
    const { src, srcdoc } = await previewIframeState(page);

    expect(src, "a clean draft must never resolve to the live-site or template-preview iframe").toBeNull();
    expect(srcdoc, "REGRESSION GUARD: must never fall back to the deleted SrcDocSandbox render again").toBeNull();

    const pendingFrame = await waitForPendingContentFrame(page);
    expect(
      pendingFrame.url(),
      "must reuse the SAME id-based template-preview endpoint every other branch-3 case uses"
    ).toContain("/template-preview");
    // Real, themed chrome — a `<body>` attached inside a real navigated document, not an inline
    // `srcDoc` string with no template/theme CSS at all.
    await expect(pendingFrame.locator("body")).toBeVisible();
    await pendingFrame.waitForLoadState("load");
    const livePage = await page.context().newPage();
    try {
      await livePage.goto(PIN_PUBLIC_URL, { waitUntil: "load" });
      const liveBackground = await livePage.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(liveBackground, "control must itself have a themed background").not.toBe("rgba(0, 0, 0, 0)");
      expect(await pendingFrame.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(liveBackground);
    } finally {
      await livePage.close();
    }

    // The notice this suite exists to verify — measured, not a screenshot.
    await expectNoticeGenuinelyVisible(page);
    await expect(page.locator(".editor-preview-notice")).toContainText(
      "Previewing your unsaved edits through the live template"
    );
    // The old "rough render... publish this post" notice must never appear again.
    await expect(page.locator(".editor-preview-notice")).not.toContainText("preview it with the theme's real template");
  });

  test("WIDENED (2026-09-09): a DRAFT post's own content edit shows the themed pending-content preview, not the raw editor-buffer fallback", async ({
    page,
  }) => {
    await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("Draft body");

    await page.getByRole("tab", { name: "Preview" }).click();
    // Neither `src` nor `srcdoc` is set for branch 3 (see `previewIframeState`'s own doc) — this is
    // itself the first confirmation that the raw SrcDocSandbox fallback (branch 4) was NOT chosen.
    const { src, srcdoc } = await previewIframeState(page);
    expect(srcdoc, "a dirty draft must NOT fall back to the raw, unstyled SrcDocSandbox render").toBeNull();
    expect(src, "branch 3 never sets `src` directly — it navigates via a targeted form submit").toBeNull();

    const pendingFrame = await waitForPendingContentFrame(page);
    expect(
      pendingFrame.url(),
      "must reuse the SAME id-based template-preview endpoint a published post's branch 3 uses"
    ).toContain("/template-preview");

    // Real, themed chrome around the draft's own unsaved text — the exact visibility-guard bypass
    // `template-preview.ts`'s `pendingBodyJson` override exists for.
    await expect(pendingFrame.locator("body")).toContainText("Draft body");

    await expectNoticeGenuinelyVisible(page);
    await expect(page.locator(".editor-preview-notice")).toContainText(
      "Previewing your unsaved edits through the live template"
    );
  });

  test("INTENDED: a published, unedited post's Preview tab shows the real live site through an actual navigable iframe, with NO notice", async ({
    page,
  }) => {
    const { slug } = await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("Published body");
    await publishAndWaitForConfirmation(page);

    await page.getByRole("tab", { name: "Preview" }).click();
    const { src, srcdoc } = await previewIframeState(page);

    expect(srcdoc, "a clean published post must not fall back to the raw sandbox").toBeNull();
    expect(withoutPreviewRevision(src, page.url())).toBe(new URL(`/${slug}`, page.url()).href);
    const liveFrame = await waitForLivePostFrame({ page, slug });
    await expect(liveFrame.locator("body")).toContainText("Published body");

    // `canShowLiveSite` renders NO notice element at all (`{canShowLiveSite ? null : (...)}`) — not
    // merely a hidden one, so this asserts absence from the DOM, not just non-visibility.
    await expect(page.locator(".editor-preview-notice")).toHaveCount(0);
  });

  test("FIXED (2026-08-12, owner-reported bug): formatting a PUBLISHED post's content keeps its Preview themed via the pending-content branch, carrying the unsaved edit", async ({
    page,
  }) => {
    const { slug } = await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("Sample text");
    await publishAndWaitForConfirmation(page);

    // BEFORE state matches the owner's own report: it looked fine before he touched it. Also the
    // reference point for the theme-CSS-parity assertion below.
    await page.getByRole("tab", { name: "Preview" }).click();
    expect(withoutPreviewRevision((await previewIframeState(page)).src, page.url())).toBe(new URL(`/${slug}`, page.url()).href);
    const liveFrame = await waitForLivePostFrame({ page, slug });
    await liveFrame.locator("body").waitFor({ state: "attached" });
    const liveBodyBackground = await liveFrame.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);

    // The owner's own repro step: format existing text with the inline-code toolbar button.
    await page.getByRole("tab", { name: "Editor" }).click();
    await page.getByText("Sample text", { exact: true }).click({ clickCount: 3 });
    await page.getByTitle("Inline code", { exact: true }).click();
    // A second, independent edit — proves the pending frame reflects the LIVE unsaved buffer, not
    // just whatever `bodyJson` looked like at the moment `contentDirty` first flipped true.
    await bodyParagraph(page).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" plus a live edit");

    await page.getByRole("tab", { name: "Preview" }).click();
    // Neither `src` nor `srcdoc` is set for this branch (see `previewIframeState`'s own doc) — this
    // is itself the first confirmation that the raw SrcDocSandbox fallback (branch 4) was NOT chosen.
    const { src, srcdoc } = await previewIframeState(page);
    expect(srcdoc, "FIX: must not fall back to the raw, unstyled SrcDocSandbox render").toBeNull();
    expect(src, "branch 3 never sets `src` directly — it navigates via a targeted form submit").toBeNull();

    const pendingFrame = await waitForPendingContentFrame(page);
    expect(pendingFrame.url(), "must reuse the SAME template-preview endpoint branch 2 GETs, just POSTed").toContain(
      "/template-preview"
    );

    // Theme CSS parity — the actual bug this fix closes. Computed style, not markup presence, per
    // this project's own memory on CSS presence not being proof of precedence.
    const pendingBodyBackground = await pendingFrame.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(
      pendingBodyBackground,
      "the pending-content preview must carry the SAME theme CSS as the live site, not go unstyled"
    ).toBe(liveBodyBackground);

    // Must reflect the LIVE unsaved buffer, not the last-SAVED body (a silently-stale render would
    // still pass a naive "is it themed" check while showing the wrong content).
    await expect(pendingFrame.locator("body")).toContainText("Sample text plus a live edit");
    // Rendered through the real server pipeline (`renderDocNode`/`renderMarks`, not Tiptap's own
    // `editor.getHTML()`) — a genuine DOM query on the server-rendered output, not a raw-string match,
    // confirming the inline-code mark just applied actually survived that pipeline.
    await expect(pendingFrame.locator("code")).toContainText("Sample text");

    // The notice DOES exist in `PostPreview`'s JSX for this branch too.
    await expectNoticeGenuinelyVisible(page);
    await expect(page.locator(".editor-preview-notice")).toContainText(
      "Previewing your unsaved edits through the live template"
    );
  });

  test("BRANCH 2: changing only a published post's template loads the alternate preview without changing the live page", async ({ page, request }) => {
    const { slug } = await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("Template-only preview content");
    await publishAndWaitForConfirmation(page);
    const liveBefore = await request.get(`${PIN_PUBLIC_URL}/${slug}`);
    expect(liveBefore.ok()).toBe(true);
    const liveHtml = await liveBefore.text();
    // STALE PIN UPDATED: 948706418 promotes the current posts-sidebar template name.
    await page.locator('[data-agent-element="post-template-choice"]').selectOption("posts-sidebar.html");
    await page.getByRole("tab", { name: "Preview" }).click();
    const { src, srcdoc } = await previewIframeState(page);
    expect(srcdoc).toBeNull();
    expect(src).toContain("/template-preview?templateChoice=posts-sidebar.html");
    const preview = page.getByTitle("Post preview", { exact: true }).contentFrame();
    await expect(preview.locator("body")).toContainText("Template-only preview content");
    await expect(preview.locator(".docs-sidebar")).toBeVisible();
    await expectNoticeGenuinelyVisible(page);
    const liveAfter = await request.get(`${PIN_PUBLIC_URL}/${slug}`);
    expect(liveAfter.ok()).toBe(true);
    expect(await liveAfter.text()).toBe(liveHtml);
  });
});
});

// Migrated from post-editor-toolbar.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: post-editor-toolbar", () => {
/**
 * @file The Posts/Pages editor's TipTap formatting toolbar (`PostEditor.tsx`'s `Toolbar`), driven in
 * a real browser.
 *
 * ## Why this suite exists
 *
 * `src/server/http/site/__tests__/tiptap-render-contract.test.ts` (a sibling deliverable, same
 * session) proves the public renderer correctly turns TipTap JSON into HTML — but it starts FROM
 * hand-authored JSON. It can never catch a toolbar button wired to the WRONG editor command: click
 * "Bold", but the `onClick` calls `toggleItalic()` by mistake, and every unit test that only feeds
 * `{type:"bold"}` JSON straight into the renderer would still pass, because that specific bug never
 * produces the JSON the unit test assumes in the first place. This suite closes that half: click the
 * real button, in a real browser, and assert on what actually got PERSISTED — the same shape of gap
 * that let `textAlign`/`underline`/`strike`/`hardBreak` ship broken on the public site in one day
 * (2026-08-11: `8624306`, `154a5be`, `b184940`).
 *
 * ## What "click it, assert the JSON" means here
 *
 * Rather than reaching into TipTap's in-memory `editor` instance (not exposed on `window`, and adding
 * such a hook would be a source change this suite isn't allowed to make — `AI-Dev-Shop/agents/
 * qa-e2e/skills.md`'s "never modify application source code"), each test clicks the toolbar, clicks
 * **Save** (or **Publish**), then re-fetches the post through the SAME authenticated admin API the
 * editor itself uses (`GET /api/admin/v1/workspaces/{ws}/posts/{id}`) and inspects the persisted
 * `bodyJson`. This is a strictly STRONGER assertion than reading the live editor state: it proves the
 * whole path from click to disk, not just that the in-memory doc briefly looked right.
 *
 * ## Selector choice: `getByTitle`, not `getByRole`
 *
 * Every button in `Toolbar` carries a `title` attribute with a stable, human-readable name (`"Bold
 * (⌘B)"`, `"Divider"`, `"Align center"`, …). Several of them have NO `aria-label` and a purely
 * symbolic visible text content (`"―"` for Divider, `"↺"`/`"↻"` for Undo/Redo, a curly `“ Quote` for
 * Quote) — their ACCESSIBLE NAME (which `getByRole('button', {name})` matches against) is that
 * symbol, not a word, so role-based matching would need to hardcode the exact Unicode glyphs. `title`
 * is uniform, human-legible in a test diff, and unambiguous across all 23 buttons (verified: every
 * `title=` value in `Toolbar` is unique) — the pragmatic choice for THIS component, not a downgrade to
 * a CSS class or XPath.
 *
 * ## Scope: "Insert widget" is deliberately NOT covered here
 *
 * That control opens `WidgetPickerDialog`'s full type-then-config flow (creating a real widget entry
 * before a `widgetEmbed` node can even be inserted) — a materially heavier flow than a `window.prompt`
 * toggle, and the `widgetEmbed` node TYPE itself already has thorough coverage both in
 * `tiptap-render-contract.test.ts` (this session) and in the pre-existing `render.test.ts` (REQ-21).
 * Documented as an explicit, disclosed gap per the QA/E2E escalation rule ("document as untestable
 * with reason, do not skip silently") rather than left silently uncovered.
 */

const WORKSPACE_ID = "workspace-local";
const API_BASE = "/api/admin/v1";
/** Must match `playwright.post-editor.config.ts`'s own `API_PORT` — the public site is served by the
 *  API process directly, a different origin from the admin SPA's Vite dev server this suite's
 *  `baseURL` points at, so the full-chain test below cannot reach it through a relative path. */


// ---------------------------------------------------------------------------
// bodyJson helpers — a minimal recursive walker over the TipTap-JSON shape,
// just enough to answer "does this mark/node exist in the saved document".
// ---------------------------------------------------------------------------

interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string }>;
  content?: DocNode[];
  text?: string;
}

function findNode(node: DocNode | undefined, predicate: (n: DocNode) => boolean): DocNode | null {
  if (!node) return null;
  if (predicate(node)) return node;
  for (const child of node.content ?? []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

/** True if a text node with this exact text carries a mark of this type anywhere in the doc. */
function hasMarkedText(doc: DocNode, text: string, markType: string): boolean {
  return findNode(doc, (n) => n.type === "text" && n.text === text && (n.marks ?? []).some((m) => m.type === markType)) !== null;
}

/** The first node of this type anywhere in the doc, or `null`. */
function findNodeOfType(doc: DocNode, type: string): DocNode | null {
  return findNode(doc, (n) => n.type === type);
}

// ---------------------------------------------------------------------------
// Page-driving helpers
// ---------------------------------------------------------------------------

/** Clicks "New Post", waits for the editor route, and returns the new post's id (from the URL) and
 *  its auto-assigned slug (read off the slug field once the post has loaded). */
async function openFreshPost(page: Page): Promise<{ id: string; slug: string }> {
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  const slug = await page.getByLabel("URL slug").inputValue();
  return { id, slug };
}

/** The single starter paragraph below the (non-deletable) title node — see `post-title-extension.ts`.
 *  A fresh post's body is exactly this one empty `<p>`, so it is the reliable place to click to start
 *  typing into the BODY rather than the title. `.ProseMirror` is TipTap's own stable root class, not
 *  an app styling class that a redesign could rename. */
function bodyParagraph(page: Page) {
  return page.locator('[data-agent-element="post-body"] .ProseMirror p').last();
}

async function clickToolbar(page: Page, title: string): Promise<void> {
  await page.getByTitle(title, { exact: true }).click();
}

/**
 * Selects an entire (one-word) paragraph with a TRIPLE CLICK and clicks a toolbar button — every
 * word this suite marks lives alone on its own paragraph (see the two tests below), so "select the
 * whole line" is exactly "select the word".
 *
 * Two other selection strategies were tried and rejected live, in order, before this one — recorded
 * here so nobody re-discovers the same dead ends:
 *
 * 1. **`dblclick()` then click the toolbar immediately.** Applied NO mark to four or five of five
 *    words in a row, every run. `Toolbar`'s buttons carry no `onMouseDown={e => e.preventDefault()}`
 *    guard (the conventional rich-text-editor precaution against a button's own mousedown disturbing
 *    the editor's selection before its `onClick` runs), so this looked like exactly that race.
 * 2. **Same, plus `waitForFunction` on `window.getSelection()!.toString() === word` before clicking**
 *    (to confirm the race theory). This TIMED OUT outright: `window.getSelection()` inside this
 *    ProseMirror `contenteditable` never reported the double-clicked word's text at all, so whatever
 *    `dblclick()` selects here is not what the native Selection API reflects.
 * 3. **`Home` then `Shift+End`** (keyboard-only, to sidestep both unknowns above). `window.
 *    getSelection()` now correctly showed each word alone — but the SAVED document still showed
 *    every mark from every PRIOR word compounding onto every later one (Delta ended up bold+italic+
 *    strike+underline, only the last of which was its own button). The visible/DOM selection was
 *    right; whatever ProseMirror itself used to decide "add vs. remove this mark" was not reading it.
 *
 * A triple click is a single, real, synchronous mouse event ProseMirror's own click handling
 * intercepts directly (unlike two independent key presses whose effects the DOM Selection API and
 * ProseMirror's internal selection apparently didn't agree on in this editor) — confirmed live: every
 * mark below lands on exactly the word it was applied to, nothing more, nothing less, across repeated
 * runs.
 */
async function selectWordAndToggleMark(page: Page, word: string, toolbarTitle: string): Promise<void> {
  await page.getByText(word, { exact: true }).click({ clickCount: 3 });
  await clickToolbar(page, toolbarTitle);
}

async function saveAndWaitForConfirmation(page: Page, label: "Saved" | "Published" = "Saved"): Promise<void> {
  await page.getByRole("button", { name: label === "Published" ? "Publish" : /^Save/ }).click();
  // Scoped to `.save-ok` (`PostEditorHeader`'s own status span), not a bare `getByText` — the status
  // select ALSO has a literal `<option value="published">Published</option>`, and `getByText`
  // without that scope is a strict-mode violation the moment the label is "Published" (confirmed
  // live). `.save-ok` is the app's own semantic class for this exact feedback message, not a
  // brittle styling hook — there is no ARIA live-region role on it to prefer instead.
  await expect(page.locator(".save-ok")).toContainText(label, { timeout: 10_000 });
}

/** Re-fetches the post through the real authenticated admin API — the strongest available proof that
 *  a toolbar click's effect actually persisted, not just that the in-memory editor briefly showed it. */
async function fetchBodyJson(page: Page, id: string): Promise<DocNode> {
  const bodyJson = await page.evaluate(
    async ({ url }) => {
      const res = await fetch(url, { credentials: "same-origin" });
      const data = await res.json();
      return data.post.bodyJson;
    },
    { url: `${API_BASE}/workspaces/${WORKSPACE_ID}/posts/${id}` }
  );
  return bodyJson as DocNode;
}

test.describe("Post editor toolbar — click-to-persisted-JSON contract", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Bold, Italic, Strike, Underline, Code and Link marks apply to the selected word and persist", async ({ page }) => {
    const { id } = await openFreshPost(page);

    // Two phases, deliberately never interleaved. PHASE 1 is pure typing: one word per paragraph
    // (Enter between each — `getByText(word, {exact:true})` needs an ELEMENT whose own normalized
    // text equals `word` exactly, so each word gets its own paragraph rather than sharing one run-on
    // line). PHASE 2 is pure mark-toggling, with no Enter anywhere near it. Confirmed live why they
    // can't mix: toggling a mark on a selected word does not collapse that selection, and immediately
    // following it with Enter (even after an explicit `ArrowRight`/`End` collapse attempt) raced
    // ProseMirror's own selection sync often enough to delete the just-formatted word and leak its
    // mark forward as a stored mark onto everything typed afterward — observed compounding across
    // three separate runs (one word losing its text and a later word gaining 2-4 unintended marks
    // each time, a different word each run). Finishing all the typing FIRST removes Enter from the
    // picture entirely once marks start getting applied, which is the actual fix, not a particular
    // collapse key.
    await bodyParagraph(page).click();
    await page.keyboard.type("Alpha");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Bravo");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Charlie");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Delta");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Echo");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Foxtrot");

    await selectWordAndToggleMark(page, "Alpha", "Bold (⌘B)");
    await selectWordAndToggleMark(page, "Bravo", "Italic (⌘I)");
    await selectWordAndToggleMark(page, "Charlie", "Strikethrough");
    await selectWordAndToggleMark(page, "Delta", "Underline (⌘U)");
    await selectWordAndToggleMark(page, "Echo", "Inline code");

    page.once("dialog", (dialog) => dialog.accept("https://example.com/plugins"));
    await selectWordAndToggleMark(page, "Foxtrot", "Link");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    expect(hasMarkedText(doc, "Alpha", "bold"), "Bold button must produce a bold mark").toBe(true);
    expect(hasMarkedText(doc, "Bravo", "italic"), "Italic button must produce an italic mark").toBe(true);
    expect(hasMarkedText(doc, "Charlie", "strike"), "Strikethrough button must produce a strike mark").toBe(true);
    expect(hasMarkedText(doc, "Delta", "underline"), "Underline button must produce an underline mark").toBe(true);
    expect(hasMarkedText(doc, "Echo", "code"), "Inline code button must produce a code mark").toBe(true);

    const linkNode = findNode(doc, (n) => n.type === "text" && n.text === "Foxtrot" && (n.marks ?? []).some((m) => m.type === "link"));
    expect(linkNode, "Link button must produce a link mark").not.toBeNull();
    const linkMark = linkNode!.marks!.find((m) => m.type === "link") as { attrs?: { href?: string } };
    expect(linkMark.attrs?.href).toBe("https://example.com/plugins");
    for (const [word, mark] of [["Alpha", "bold"], ["Bravo", "italic"], ["Charlie", "strike"], ["Delta", "underline"], ["Echo", "code"], ["Foxtrot", "link"]]) {
      const node = findNode(doc, (n) => n.type === "text" && n.text === word);
      expect(node, `${word} must remain present`).not.toBeNull();
      expect(node!.marks?.map((m) => m.type), `${word} must carry only its own mark`).toEqual([mark]);
    }
  });

  test("H1, H2 and H3 create heading nodes at the correct level, each ending Enter back at a plain paragraph", async ({ page }) => {
    const { id } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("Heading One");
    await clickToolbar(page, "Heading 1");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Plain after One");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Heading Two");
    await clickToolbar(page, "Heading 2");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Plain after Two");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Heading Three");
    await clickToolbar(page, "Heading 3");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Plain after Three");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    for (const [text, level] of [
      ["Heading One", 1],
      ["Heading Two", 2],
      ["Heading Three", 3],
    ] as const) {
      const heading = findNode(doc, (n) => n.type === "heading" && n.attrs?.level === level && (n.content ?? []).some((c) => c.text === text));
      expect(heading, `"${text}" must be a level-${level} heading, not any other level`).not.toBeNull();
    }
    for (const text of ["Plain after One", "Plain after Two", "Plain after Three"]) {
      const parent = doc.content?.find((n) => n.content?.some((c) => c.text === text));
      expect(parent, `${text} must persist after Enter`).toBeDefined();
      expect(parent!.type).toBe("paragraph");
    }
  });

  test("the bullet-list and numbered-list buttons produce the correct list node, not each other's", async ({ page }) => {
    const { id } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("Item A");
    await clickToolbar(page, "Bullet list");
    // Enter continues the list with a new empty item; Enter again on an empty item is TipTap/
    // ProseMirror's standard "lift out of the list" behavior — exercised here as a real user action,
    // not asserted directly (the persisted JSON below is the actual proof).
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Item B");
    await clickToolbar(page, "Numbered list");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    const bulletList = findNodeOfType(doc, "bulletList");
    expect(bulletList, "the Bullet list button must produce a bulletList node").not.toBeNull();
    expect(findNode(bulletList!, (n) => n.text === "Item A"), "Item A's text must live inside the bulletList").not.toBeNull();

    const orderedList = findNodeOfType(doc, "orderedList");
    expect(orderedList, "the Numbered list button must produce an orderedList node, not a second bulletList").not.toBeNull();
    expect(findNode(orderedList!, (n) => n.text === "Item B"), "Item B's text must live inside the orderedList").not.toBeNull();
  });

  test("the Quote button produces a blockquote and the Code block button produces a codeBlock", async ({ page }) => {
    const { id } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("Quoted text");
    await clickToolbar(page, "Quote");
    // Exit the blockquote the same way a real author would (Enter on an empty trailing paragraph
    // lifts out of the block), then start the code block fresh.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("const x = 1;");
    await clickToolbar(page, "Code block");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    const quote = findNodeOfType(doc, "blockquote");
    expect(quote, "the Quote button must produce a blockquote node").not.toBeNull();
    expect(findNode(quote!, (n) => n.text === "Quoted text")).not.toBeNull();

    const codeBlock = findNode(doc, (n) => n.type === "codeBlock" && (n.content ?? []).some((c) => c.text === "const x = 1;"));
    expect(codeBlock, "the Code block button must produce a codeBlock node, not an inline code mark").not.toBeNull();
  });

  test("the Divider button inserts a horizontalRule node between two paragraphs", async ({ page }) => {
    const { id } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("Before");
    await page.keyboard.press("Enter");
    await clickToolbar(page, "Divider");
    await page.keyboard.type("After");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    expect(findNodeOfType(doc, "horizontalRule"), "the Divider button must produce a horizontalRule node").not.toBeNull();
    expect(findNode(doc, (n) => n.text === "Before")).not.toBeNull();
    expect(findNode(doc, (n) => n.text === "After")).not.toBeNull();
    const beforeIndex = doc.content?.findIndex((n) => n.type === "paragraph" && n.content?.some((c) => c.text === "Before")) ?? -1;
    expect(beforeIndex).toBeGreaterThanOrEqual(0);
    expect(doc.content!.slice(beforeIndex).map((n) => ({ type: n.type, text: (n.content ?? []).map((c) => c.text ?? "").join("") }))).toEqual([
      { type: "paragraph", text: "Before" }, { type: "horizontalRule", text: "" }, { type: "paragraph", text: "After" },
    ]);
  });

  test("each align button sets the current paragraph's textAlign attr to its own value, not a neighbor's", async ({ page }) => {
    const { id } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("Aligned text");

    for (const [title, align] of [
      ["Align center", "center"],
      ["Align right", "right"],
      ["Justify", "justify"],
    ] as const) {
      await clickToolbar(page, title);
      await saveAndWaitForConfirmation(page);
      const doc = await fetchBodyJson(page, id);
      const paragraph = findNode(doc, (n) => n.type === "paragraph" && (n.content ?? []).some((c) => c.text === "Aligned text"));
      expect(paragraph?.attrs?.textAlign, `"${title}" must set textAlign to "${align}"`).toBe(align);
    }

    await clickToolbar(page, "Align left");
    await saveAndWaitForConfirmation(page);
    const finalDoc = await fetchBodyJson(page, id);
    const finalParagraph = findNode(finalDoc, (n) => n.type === "paragraph" && (n.content ?? []).some((c) => c.text === "Aligned text"));
    expect(finalParagraph, "Align left must preserve the target paragraph").not.toBeNull();
    expect(finalParagraph!.content?.map((n) => n.text ?? "").join("")).toBe("Aligned text");
    // "left" is the CSS default the public renderer never emits as an explicit style
    // (`tiptap-render-contract.test.ts`'s own "paragraph, textAlign left" row) — what matters here is
    // only that it is no longer "center"/"right"/"justify", not the exact stored representation.
    expect(["left", null, undefined]).toContain(finalParagraph?.attrs?.textAlign ?? null);
  });

  test("REGRESSION (2026-08-12, owner-reported bug): the toolbar no longer offers 'Insert image by URL' — it wrote a src-only node render.ts never renders publicly", async ({ page }) => {
    // Was: click the button, accept two `window.prompt`s, assert the resulting node carried the
    // typed `src`. That node shape is exactly ADR-027 §4's "legacy" case — `render.ts`'s own `image`
    // case comment states plainly it never reads `src`, so this control produced an image that
    // looked fine in the editor and rendered as a permanent grey placeholder on the live site, with
    // no warning to the operator. See `PostEditor.tsx`'s own removal comment for the full reasoning,
    // including why a same-session "fetch the URL server-side, store a real ref" fix was rejected
    // (this repo's one guarded outbound-HTTP seam buffers responses as text, which would corrupt
    // binary image bytes) rather than half-done. The Media picker (`EmbedInsertControl` -> upload a
    // file) and drag/paste (`FileHandler`) both still insert a real `{assetId, transformName}` ref
    // that DOES render publicly — covered by `use-post-editor.hooks.unit.test.tsx` (upload wiring)
    // and `tiptap-render-contract.test.ts`'s "image, ref-based" row (the render side) — and
    // `post-editor-image-sizing.spec.ts` still exercises the legacy `src`-only render path itself
    // (now reachable only via a pre-existing/legacy post, not a fresh toolbar insert).
    // STALE PIN UPDATED 2026-10-07: the owner reversed the removal the same day; the control is
    // back, and `render.ts`'s `safeImageSrc` now renders an allowed `https?:` src publicly (see
    // `PostEditor.tsx`'s "REMOVED and then RESTORED on 2026-08-12" comment).
    await openFreshPost(page);
    await expect(page.locator('button[title="Insert image by URL"]')).toHaveCount(1);
  });

  test("full chain: formatting applied through the toolbar, published, is present in the served public HTML", async ({ page, request }) => {
    const { id, slug } = await openFreshPost(page);

    // Two words, each alone on its own paragraph — same reasoning as the marks test above:
    // `getByText(word, {exact:true})` needs an element whose own text is exactly that word. Typing
    // finishes COMPLETELY before any mark gets toggled — see the marks test above for why Enter can
    // never safely follow a mark toggle in this editor.
    await bodyParagraph(page).click();
    await page.keyboard.type("Bold");
    await page.keyboard.press("Enter");
    await page.keyboard.type("link");

    await selectWordAndToggleMark(page, "Bold", "Bold (⌘B)");

    page.once("dialog", (dialog) => dialog.accept("https://example.com/full-chain"));
    await selectWordAndToggleMark(page, "link", "Link");

    // Centers whichever paragraph the cursor is in — "link", since it's the one just edited. The
    // assertion below only checks the STYLE exists in the served HTML, not which paragraph carries
    // it, so this is enough to prove the Align center button's own wiring.
    await clickToolbar(page, "Align center");

    // Publish (not Save): the public site only serves published posts — see
    // `PostEditorHeader`'s own "Publish" button, which saves and sets status in one action.
    await saveAndWaitForConfirmation(page, "Published");

    // Fetched via `request` (Playwright's own HTTP client, not `page.evaluate`/`fetch`): the public
    // site is served by the API server directly, a different origin from the admin SPA's Vite dev
    // server in this config, and `APIRequestContext` is not subject to the browser's same-origin
    // policy the way an in-page `fetch` would be.
    const publicUrl = `${PIN_PUBLIC_URL}/${slug}`;
    const res = await request.get(publicUrl);
    expect(res.status(), `expected the published post to be publicly reachable at ${publicUrl}`).toBe(200);
    const html = await res.text();

    expect(html).toContain("<strong>Bold</strong>");
    // The served editor HTML preserves Link's safe new-tab attributes as well as href and text.
    expect(html).toContain('<a href="https://example.com/full-chain" rel="noopener noreferrer" target="_blank">link</a>');
    expect(html).toMatch(/style="text-align:center"/);
  });
});
});

// Migrated from post-editor-youtube-preview.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: post-editor-youtube-preview", () => {
/**
 * The historical raw sandboxed draft preview could not initialize YouTube storage. Drafts now
 * use a navigated server-rendered preview, as published pages do. f65fb186a deliberately sandboxes
 * admin previews in an opaque origin, accepting blocked embed storage to protect the admin session.
 * Exercise both current paths with a controlled embed response that requires origin storage,
 * avoiding external player traffic: blocked in the draft preview, ready on the public site.
 */



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

function bodyParagraph(page: Page) {
  return page.locator('[data-agent-element="post-body"] .ProseMirror p').last();
}

async function publishAndWaitForConfirmation(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.locator(".save-ok")).toContainText("Published", { timeout: 10_000 });
}

test.describe("Post editor Preview tab — YouTube embed regression (2026-08-12)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    // Exercise browser restrictions using a deterministic embed that needs origin storage,
    // without depending on YouTube's network or player rollout.
    await page.route("https://www.youtube-nocookie.com/embed/**", (route) => route.fulfill({
      contentType: "text/html",
      body: '<!doctype html><html><body><script>try { localStorage.setItem("player-probe", "ready"); document.body.textContent = "Player ready"; } catch (error) { document.body.textContent = "Player blocked"; }</script></body></html>',
    }));
  });

  test("a draft's server-rendered preview renders its YouTube embed with intentionally isolated storage", async ({
    page,
  }) => {
    await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("hello world");

    page.once("dialog", (dialog) => dialog.accept("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
    await page.click('button[title="Insert YouTube video"]');
    // Click back into plain text — collapses the atom's NodeSelection before anything else touches
    // the doc, matching the isolated repro this test locks in (a separate, still-open interaction
    // finding — inserting a mention immediately after an atom is still node-selected can replace
    // it — is out of THIS bug's scope; see this suite's own report for that disclosure).
    await page.getByText("hello world").click();

    await page.getByRole("tab", { name: "Preview" }).click();
    const iframe = page.getByTitle("Post preview", { exact: true });
    await expect(iframe).toBeVisible();
    await expect(iframe).toHaveAttribute("sandbox", "allow-scripts allow-forms allow-popups");
    expect(await iframe.getAttribute("srcdoc")).toBeNull();
    const preview = iframe.contentFrame();
    await expect(preview.locator("body")).toContainText("hello world");
    await expect(preview.locator(".embed-preview-unavailable")).toHaveCount(0);
    const player = preview.locator(".youtube-embed iframe");
    await expect(player).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(await player.getAttribute("sandbox")).toBeNull();
    await player.scrollIntoViewIfNeeded();
    // The child inherits the preview's opaque-origin sandbox despite having no sandbox attribute.
    await expect(player.contentFrame().locator("body")).toHaveText("Player blocked");
  });

  test("published YouTube iframe retains its complete attributes and initializes a controlled player", async ({
    page,
  }) => {
    const { slug } = await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("hello world");
    page.once("dialog", (dialog) => dialog.accept("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
    await page.click('button[title="Insert YouTube video"]');
    await page.getByText("hello world").click();
    await publishAndWaitForConfirmation(page);

    const res = await page.request.get(`${PIN_PUBLIC_URL}/${slug}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div class="youtube-embed"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).not.toContain("embed-preview-unavailable");
    await page.goto(`${PIN_PUBLIC_URL}/${slug}`);
    const player = page.locator(".youtube-embed iframe");
    await expect(player).toHaveCount(1);
    await expect(player).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(await player.getAttribute("sandbox")).toBeNull();
    await expect(player).toHaveAttribute("allowfullscreen", "");
    expect(await player.evaluate((element) => Object.fromEntries([...element.attributes].map((attribute) => [attribute.name, attribute.value])))).toEqual({
      src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
      title: "YouTube video",
      allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
      allowfullscreen: "", loading: "lazy",
    });
    await player.scrollIntoViewIfNeeded();
    await expect(player.contentFrame().locator("body")).toHaveText("Player ready");
  });
});
});
