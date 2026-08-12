import { expect, test, type Frame, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

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

const API_BASE_URL = "http://localhost:7851";

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

    // Reference background, from the CLEAN published post's own live-site branch (never sandboxed,
    // never proxied — ground truth for "the theme is really applied") — same comparison
    // `post-editor-preview-branches.spec.ts`'s own "theme CSS parity" test already uses, reused here
    // to prove `siteUrl(...)` wrapping `templatePreviewUrl` didn't break `/theme-assets/...`
    // resolution in the process of fixing the mention link (this suite's own header explains why
    // that path was never broken pre-fix — Vite's dev proxy already allowlists it — and must stay
    // that way).
    await page.getByRole("tab", { name: "Preview" }).click();
    const liveFrame = page.frame({ url: `${API_BASE_URL}/${sourceSlug}` });
    if (!liveFrame) throw new Error("could not locate the live-site child frame");
    await liveFrame.locator("body").waitFor({ state: "attached" });
    const liveBodyBackground = await liveFrame.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);

    await page.getByRole("tab", { name: "Editor" }).click();
    await bodyParagraph(page).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" plus edit");
    await page.getByLabel("Mention a post").selectOption({ label: "Mention Target" });

    await page.getByRole("tab", { name: "Preview" }).click();
    const pendingFrame = await waitForPendingContentFrame(page);

    // FIX target: the frame's OWN url must be the real API/site origin, not the admin SPA's — this
    // is the actual mechanism the bug hinged on (see this suite's own header).
    expect(pendingFrame.url().startsWith(API_BASE_URL), `pending-content frame must load from the site origin (${API_BASE_URL}), not the admin SPA's own origin — was: ${pendingFrame.url()}`).toBe(true);

    const pendingBodyBackground = await pendingFrame.locator("body").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(pendingBodyBackground, "theme CSS (incl. /theme-assets/... resolution) must still apply after the fix").toBe(liveBodyBackground);

    const mention = pendingFrame.locator("a.post-mention");
    await expect(mention).toBeVisible();
    await expect(mention).toHaveAttribute("href", `/${targetSlug}`);

    await mention.click();
    // FIX: lands on the real published target post at the SITE origin — not a Vite dev-server error
    // page, and not left on the admin app's own current URL/origin.
    await expect
      .poll(() => page.frames().some((f) => f.url() === `${API_BASE_URL}/${targetSlug}`), { timeout: 10_000 })
      .toBe(true);
    const landed = page.frames().find((f) => f.url() === `${API_BASE_URL}/${targetSlug}`)!;
    await expect(landed.locator("body")).toContainText("Mention Target");

    // Negative half of the regression: the admin app's own top-level URL must be untouched — a
    // pre-fix run would still show the editor shell around a broken iframe, but a plausible WORSE
    // fix (e.g. `target="_top"` somewhere) could have navigated the whole admin tab away instead.
    expect(page.url()).toContain(`/admin/posts/`);
  });
});
