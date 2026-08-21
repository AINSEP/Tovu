import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Regression coverage for the owner-reported bug (2026-08-21): with real media loaded,
 * `MediaPickerDialog`'s Cancel button renders off-screen and unclickable. A live browser sweep
 * measured it at y=3254 against a 1400px-tall viewport at two different viewport sizes — Escape
 * still closes the dialog (so it isn't a total dead end), but the visible Cancel control does
 * nothing reachable, which is the real defect this pins.
 *
 * Root cause: `.media-picker-grid`/`.media-picker-item` (`MediaPickerDialog.tsx`) had zero CSS
 * anywhere, so each thumbnail `<img>` rendered at its raw native size, and `.settings-dialog`
 * (`styles.css`) had no `max-height`/`overflow` — the unbounded grid just pushed the fixed footer
 * (Cancel lives in `.widget-picker-footer`, after the grid) arbitrarily far down the page.
 *
 * Why this test seeds media itself: this suite's own hermetic server boots a fresh `TOVU_DB=memory`
 * DB with NO media rows at all — against that empty state the dialog renders its "No media uploaded
 * yet" notice instead of the grid, stays small, and passes against the UNFIXED code for the wrong
 * reason (no content to overflow). `seedMediaItems` below uploads ~20 real 300x200 PNGs through the
 * live upload API (`api.uploadMedia`'s own JSON+base64 shape — this repo has no multipart parser,
 * see `upload.ts`'s own header) before the dialog is ever opened, so the overflow this test measures
 * is the real one, not a hollow pass.
 *
 * The assertion measures, not looks: a clipped dialog looks completely normal in a screenshot (this
 * project's own prior mistake, per its screenshots-are-not-evidence lesson) — every check here reads
 * real numbers off `boundingBox()`/a real click, never a visual capture.
 *
 * No `waitForLoadState("networkidle")` anywhere — confirmed elsewhere in this directory
 * (`access-tokens.spec.ts`'s own header) that it never resolves against this admin's open SSE
 * settings feed. Every wait here is an explicit element/state wait instead.
 */

const WORKSPACE_ID = "workspace-local";
const API_BASE = "/api/admin/v1";
const SEED_COUNT = 20;

/** Opens a brand-new post and waits for its editor route — same shape
 *  `post-editor-image-sizing.spec.ts` already uses in this directory (duplicated, not imported,
 *  per that file's own precedent for small per-suite scenario setup). */
async function openFreshPost(page: Page): Promise<void> {
  // `domcontentloaded`, not the default `load` — same trap `access-tokens.spec.ts`'s own header
  // documents for `networkidle` turned out to also bite plain `load` here (measured live: a bare
  // `page.goto("/admin/posts")` timed out at 30s against this admin's open SSE settings feed).
  await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
}

/**
 * Uploads `count` real, distinctly-colored 300x200 PNGs through the authenticated admin upload API,
 * entirely in-browser (canvas -> `toDataURL` -> the same base64 JSON shape `api.uploadMedia` sends —
 * no binary fixture checked into the repo). Real pixel dimensions matter: a 1x1 placeholder would
 * not reproduce the overflow this test exists to catch, since an unconstrained native-sized `<img>`
 * is the whole mechanism of the bug.
 */
async function seedMediaItems(page: Page, count: number): Promise<void> {
  await page.evaluate(
    async ({ count, apiBase, workspaceId }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 300;
      canvas.height = 200;
      const ctx = canvas.getContext("2d")!;
      for (let i = 0; i < count; i++) {
        ctx.fillStyle = `hsl(${(i * 37) % 360}, 60%, 55%)`;
        ctx.fillRect(0, 0, 300, 200);
        const dataUrl = canvas.toDataURL("image/png");
        const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const res = await fetch(`${apiBase}/workspaces/${workspaceId}/media`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // Deliberately NOT "media-picker-cancel-seed-N": the button's own accessible name
            // includes this filename (via `title`), and `getByRole(..., { name: "Cancel" })`
            // below does a case-insensitive SUBSTRING match by default — an earlier draft of this
            // seed named the fixture "...-cancel-..." and it matched all 20 thumbnail buttons too,
            // a self-inflicted strict-mode violation, not the product bug. Kept `exact: true` on
            // that locator as well (see below) so this can't silently regress the same way twice.
            filename: `media-picker-item-seed-${i}.png`,
            contentType: "image/png",
            dataBase64,
            alt: `Seed media ${i}`,
          }),
        });
        if (!res.ok) {
          throw new Error(`seed upload ${i} failed: ${res.status} ${await res.text()}`);
        }
      }
    },
    { count, apiBase: API_BASE, workspaceId: WORKSPACE_ID }
  );
}

test.describe("Media Picker — Cancel button reachability", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await seedMediaItems(page, SEED_COUNT);
  });

  test("Cancel stays fully inside the viewport and closes the dialog when clicked, with real media loaded", async ({ page }) => {
    await openFreshPost(page);

    await page.getByRole("button", { name: "Embed" }).click();
    await page.getByRole("menuitem", { name: "Media" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Confirms the seed actually landed content in the grid — a "No media uploaded yet" notice
    // (the empty-DB state this test exists to avoid) would leave this at 0.
    await expect(page.locator(".media-picker-item")).toHaveCount(SEED_COUNT);

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("page reported no viewport size");

    // The mechanism, not just the symptom — same idiom `post-editor-image-sizing.spec.ts`'s own
    // `measureImage` helper uses in this directory (read `getComputedStyle` directly rather than
    // trust that a rule with the right property exists somewhere in the cascade; this project's own
    // prior lesson, per `field-attrs-dialog`'s own header comment, is that CSS presence is not proof
    // of precedence). `.media-picker-dialog` is a bare single-class selector declared AFTER
    // `.settings-dialog` in `styles.css`, so it only wins on same-file source order — this locks that
    // in as an observed fact, not an assumption.
    //
    // `85vh` is asserted against the page's OWN reported viewport height, not a literal pixel
    // number: this config's top-level `use.viewport: { height: 900 }` reads like the effective
    // size, but `projects[].use: { ...devices["Desktop Chrome"] }` (below, same as every sibling
    // config in this directory) spreads that device preset's OWN `viewport` (1280x720) back over
    // it, since project-level `use` wins the merge — measured live: the real height here is 720,
    // not 900. Deriving the expectation from `page.viewportSize()` keeps this correct regardless of
    // which of the two numbers is actually winning, rather than re-encoding that same trap as a
    // second hardcoded guess.
    const dialogStyle = await dialog.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { maxHeight: cs.maxHeight, width: cs.width };
    });
    const expectedMaxHeight = Math.round(viewport.height * 0.85);
    expect(dialogStyle.maxHeight).toBe(`${expectedMaxHeight}px`);
    expect(dialogStyle.width).toBe("512px"); // 32rem — binding, not clamped to the old 26rem default
    const bodyOverflow = await page.locator(".media-picker-body").evaluate((el) => getComputedStyle(el).overflowY);
    expect(bodyOverflow).toBe("auto");

    const cancelButton = dialog.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancelButton).toBeVisible();

    const box = await cancelButton.boundingBox();
    if (!box) throw new Error("Cancel button did not report a bounding box");

    // The regression, measured directly: pre-fix this box's y (and y+height) sits far past the
    // viewport's own height — the live sweep that found this bug measured y=3254 against a 1400px
    // viewport. Post-fix the whole box must sit inside [0, viewport] on both axes.
    expect(box.y, "Cancel's top edge is above the viewport").toBeGreaterThanOrEqual(0);
    expect(box.x, "Cancel's left edge is left of the viewport").toBeGreaterThanOrEqual(0);
    expect(box.y + box.height, "Cancel's bottom edge is past the viewport height").toBeLessThanOrEqual(viewport.height);
    expect(box.x + box.width, "Cancel's right edge is past the viewport width").toBeLessThanOrEqual(viewport.width);

    // Not just positioned correctly — actually clickable, and it does its job.
    await cancelButton.click();
    await expect(page.locator(".media-picker-dialog")).toHaveCount(0);
  });
});
