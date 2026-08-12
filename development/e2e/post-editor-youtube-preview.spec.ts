import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file Owner-reported bug (2026-08-12): "the YouTube [embed] doesn't work" — a YouTube embed
 * rendered a solid black box in the Posts editor's Preview tab, raw draft fallback (`PostPreview`'s
 * branch 4, `PostEditor.tsx` — see that function's own file header for the branch numbering).
 *
 * Reproduced live (headless Chromium, before this fix): a brand-new/unpublished post's Preview tab
 * renders `editor.getHTML()` through `SrcDocSandbox` (`@jini-ai/ui/renderers`), whose
 * `sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"` deliberately omits
 * `allow-same-origin` (it treats the HTML as hostile by construction). YouTube's own embed player
 * needs same-origin storage access and fails to initialize there — confirmed live via two distinct
 * console errors inside that frame (a `caches` SecurityError naming the missing `allow-same-origin`
 * flag by name, and `writeEmbed is not defined`), rendering as a solid black box with no player, no
 * thumbnail, no error text an operator could act on.
 *
 * The PUBLISHED public page and the two real-navigated-iframe preview branches (2 and 3) are NOT
 * sandboxed at all and were confirmed live to render the real, playable embed correctly — this bug
 * is scoped to branch 4 only. `SrcDocSandbox`'s sandbox is shared, load-bearing security posture for
 * genuinely untrusted content elsewhere, so the fix (`rules.ts`'s
 * `degradeUnplayableEmbedsForRawPreview`) does not loosen it; it swaps the YouTube embed markup for
 * a labelled placeholder before that HTML ever reaches the sandbox, the same "degrade to a clear
 * label rather than a broken render" idiom `render.ts`'s `mediaPlaceholder` already uses on the
 * public side.
 *
 * Confirmed live (real headless Chromium, this suite's own hermetic `TOVU_DB=memory` boot) before
 * being written up as the RED state these tests started from.
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

test.describe("Post editor Preview tab — YouTube embed regression (2026-08-12)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("FIXED: a YouTube embed in a DRAFT's raw-fallback preview (branch 4) shows a labelled placeholder, not a broken black iframe", async ({
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
    const iframe = page.locator(".editor-preview-iframe");
    await expect(iframe).toHaveAttribute("sandbox", /allow-scripts/); // still branch 4 (sandboxed) — confirms this test is exercising the right branch
    const frame = await iframe.elementHandle().then((h) => h!.contentFrame());
    if (!frame) throw new Error("could not access the SrcDocSandbox content frame");

    // FIX: no nested cross-origin YouTube iframe at all (it would never fully initialize inside this
    // sandbox — see this suite's own header) — a labelled placeholder instead.
    await expect(frame.locator("iframe")).toHaveCount(0);
    const placeholder = frame.locator(".embed-preview-unavailable");
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText("YouTube video");
    await expect(placeholder).toContainText("publish this post");
    const box = await placeholder.boundingBox();
    expect(box?.width, "placeholder must have real rendered width, not a collapsed/zero-size box").toBeGreaterThan(0);
    expect(box?.height, "placeholder must have real rendered height, not a collapsed/zero-size box").toBeGreaterThan(0);
  });

  test("REGRESSION GUARD: the same YouTube embed still renders as a real, playable iframe once published (not sandboxed at all)", async ({
    page,
  }) => {
    // Guards against a fix that over-applies `degradeUnplayableEmbedsForRawPreview` somewhere it
    // shouldn't (e.g. accidentally wired into the public render path too) rather than scoping it to
    // the one sandboxed branch that actually needs it.
    const { slug } = await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("hello world");
    page.once("dialog", (dialog) => dialog.accept("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
    await page.click('button[title="Insert YouTube video"]');
    await page.getByText("hello world").click();
    await publishAndWaitForConfirmation(page);

    const res = await page.request.get(`${API_BASE_URL}/${slug}`);
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div class="youtube-embed"><iframe src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).not.toContain("embed-preview-unavailable");
  });
});
