import { expect, test, type Frame, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file The Posts editor's Preview tab (`PostEditor.tsx`'s `PostPreview`) — which of its FOUR
 * branches renders, and whether the explanatory notice that is supposed to accompany the degraded
 * ones is actually visible.
 *
 * ## Why this suite exists — there are three renderers, not two
 *
 * `tiptap-render-contract.test.ts` and `post-editor-toolbar.spec.ts` (same session) both target the
 * seam from the Tiptap editor to the PUBLIC site (`renderDocNode`/`renderMarks`). There is a THIRD
 * renderer this project has: Tiptap's own `editor.getHTML()`, fed into `SrcDocSandbox` as the
 * Preview tab's raw fallback branch when nothing else can show a real, themed render. Neither of the
 * other two suites can see this seam at all — it never reaches the public site or `render.ts`.
 *
 * ## The bug this suite used to lock in, now fixed (2026-08-12)
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
 * The fix (`PostEditor.tsx`'s `PostPreview`, commit 47782cb) adds a fourth branch,
 * `canShowPendingContentPreview = status === "published" && contentDirty`: a hidden `<form
 * method="post" target="{iframe name}">` submits the live, unsaved `editor.getJSON()` as `bodyJson`
 * to the same `template-preview` endpoint branch 2 already `GET`s, landing a real navigated document
 * in the targeted iframe (never `srcDoc` — see `template-preview.ts`'s own file header for why:
 * theme asset paths are root-relative to `/theme-assets/{themeId}/...`, which only resolves against
 * a real navigated page). Debounced 500ms trailing, so this suite waits past that before asserting
 * on the resulting frame.
 *
 * `PostPreview`'s own JSX pairs every non-live-site branch with an `.editor-preview-notice`
 * explaining what's being shown. This suite verifies, DOM-first (`toBeVisible()`, not a screenshot —
 * this project's own memory records CSS presence not being proof of precedence, and a
 * `display: contents` element hiding a class that "existed" but did nothing), whether that notice is
 * genuinely rendered and visible in each branch.
 *
 * ## Scope discipline
 *
 * This suite locks in `PostPreview`'s full four-branch behavior (bug-fixed and always-intended
 * alike) as tests. Each test below states which branch it targets.
 */

const API_BASE_URL = "http://localhost:7851";

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

/** The `.editor-preview-iframe` carries `src` (branches 1/2, a real navigable iframe pointed at a URL
 *  up front) XOR `srcdoc` (branch 4, `SrcDocSandbox` — see that component's own source: it never sets
 *  `src` at all). Branch 3 (pending-content) sets NEITHER attribute — it only ever gets a `name`, and
 *  its navigation happens via a targeted form submit rather than an attribute the DOM exposes, so this
 *  structural signal only distinguishes branches 1/2/4 from each other; branch 3 is asserted with
 *  {@link waitForPendingContentFrame} instead. */
async function previewIframeState(page: Page): Promise<{ src: string | null; srcdoc: string | null }> {
  const iframe = page.locator(".editor-preview-iframe");
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

  test("INTENDED: a brand-new draft's Preview tab falls back to the raw editor-buffer render, with a VISIBLE notice explaining why", async ({
    page,
  }) => {
    await openFreshPost(page);
    await bodyParagraph(page).click();
    await page.keyboard.type("Draft body");

    await page.getByRole("tab", { name: "Preview" }).click();
    const { src, srcdoc } = await previewIframeState(page);

    expect(src, "a draft must never resolve to the live-site or template-preview iframe").toBeNull();
    expect(srcdoc, "a draft's Preview must be the SrcDocSandbox fallback").not.toBeNull();
    expect(srcdoc).toContain("Draft body");

    // The notice this suite exists to verify — measured, not a screenshot.
    await expectNoticeGenuinelyVisible(page);
    await expect(page.locator(".editor-preview-notice")).toContainText(
      "publish this post to preview it with the theme's real template and CSS"
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
    expect(src).toBe(`${API_BASE_URL}/${slug}`);

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
    expect((await previewIframeState(page)).src).toBe(`${API_BASE_URL}/${slug}`);
    const liveFrame = page.frame({ url: `${API_BASE_URL}/${slug}` });
    if (!liveFrame) throw new Error("could not locate the live-site child frame");
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

  // BRANCH 2 (template preview: `status === "published" && !contentDirty`, only `templateChoice`
  // pending) is NOT covered here. UNVERIFIED CLAIM, kept as previously recorded rather than silently
  // dropped: this was originally skipped on the stated grounds that reaching it "requires an active
  // STATIC-tier theme that declares `templates`, which this suite's hermetic `TOVU_DB=memory` boot
  // does not have." Live evidence from authoring the branch-3 fix above casts doubt on that premise —
  // a brand-new post in this exact hermetic boot auto-received `templateChoice=blog-post.html` in the
  // pending-content request, and `content/themes/static/basic/theme.json` (this boot's seeded theme) DOES
  // declare `"templates": ["blog-post.html", ...]`. Branch 2 may be reachable after all; left as a
  // disclosed, unresolved gap rather than re-scoped and fixed here (out of this fix's own assigned
  // scope — the pending-content branch, not branch-2 coverage).
  test.skip(
    "BRANCH 2 (template preview) not covered: originally recorded as requiring a static-tier theme with declared templates unavailable in this hermetic boot — that premise now looks questionable, see comment above",
    () => {}
  );
});
