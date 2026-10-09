// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { type Page } from "../support/bug-pin-fixtures.js";
import { loginAsAdmin } from "../support/bug-pin-auth.js";

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

// Migrated from media-picker-cancel.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: media-picker-cancel", () => {
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

test("Media's Order by label and dropdown share a row with visible spacing", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/media", { waitUntil: "domcontentloaded" });
  const control = page.locator(".media-order-control");
  await expect(control).toBeVisible();

  // Measure the served page so an unloaded stylesheet or a later override fails this guard.
  const spacing = await control.evaluate((element) => {
    const label = element.querySelector("label")!.getBoundingClientRect();
    const dropdown = element.querySelector("select")!.getBoundingClientRect();
    return {
      gap: dropdown.left - label.right,
      verticalOverlap: Math.min(label.bottom, dropdown.bottom) - Math.max(label.top, dropdown.top),
    };
  });
  expect(spacing.gap).toBeGreaterThan(0);
  expect(spacing.verticalOverlap).toBeGreaterThan(0);
});

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

    const dialog = page.getByRole("dialog", { name: "Choose media", exact: true });
    await expect(dialog).toBeVisible();

    // Confirms the seed actually landed content in the grid — a "No media uploaded yet" notice
    // (the empty-DB state this test exists to avoid) would leave this at 0.
    await expect(dialog.locator('[data-jini-part="media.card"]')).toHaveCount(SEED_COUNT);

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
    // Since 2026-10-05 the editor mounts Jini's native picker: 52rem wide, with the grid
    // itself scrolling. The legacy CSS rationale above records the original regression.
    expect(await dialog.evaluate((el) => el.matches(":modal"))).toBe(true);
    const dialogStyle = await dialog.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { maxHeight: cs.maxHeight, width: cs.width };
    });
    const expectedMaxHeight = Math.round(viewport.height * 0.85);
    expect(dialogStyle.maxHeight).toBe(`${expectedMaxHeight}px`);
    // Retired picker: 32rem — binding, not clamped to the old 26rem default.
    expect(dialogStyle.width).toBe("832px"); // Current picker: 52rem at this desktop viewport.
    const bodyOverflow = await dialog.locator('[data-jini-part="media.grid"]').evaluate((el) => getComputedStyle(el).overflowY);
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
    await expect(dialog).toHaveCount(0);
  });
});

test("Media lightbox enters modal focus, routes real arrow keys, and restores focus on Escape", async ({ page }) => {
  await loginAsAdmin(page);
  // Keep the asset list deterministic; focus and keyboard routing use the real browser dialog.
  const media = ["First photo", "Second photo"].map((title, index) => ({
    id: `lightbox-${index}`,
    workspaceId: WORKSPACE_ID,
    title,
    slug: `lightbox-${index}`,
    alt: title,
    caption: "",
    credit: "",
    sha256: `lightbox-sha-${index}`,
    contentType: "image/png",
    status: "active",
    createdAt: `2026-07-0${2 - index}T09:00:00.000Z`,
    updatedAt: `2026-07-0${2 - index}T09:00:00.000Z`,
    version: 1,
    width: null,
    height: null,
    cssClass: null,
    htmlAttributes: null,
    publicUrl: null,
  }));
  await page.route(`**${API_BASE}/workspaces/${WORKSPACE_ID}/media`, (route) =>
    route.fulfill({ json: { media } })
  );
  await page.route(`**${API_BASE}/workspaces/${WORKSPACE_ID}/media/*/original`, (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
    })
  );
  await page.goto("/admin/media", { waitUntil: "domcontentloaded" });
  const expand = page.getByRole("button", { name: 'View "First photo" larger', exact: true });
  await expand.click();
  const dialog = page.locator("dialog.media-lightbox");
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  expect(await dialog.evaluate((el) => el.matches(":modal"))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Next asset", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("heading")).toHaveText("Second photo");
  await expect(dialog.locator(".media-lightbox-counter")).toHaveText("2 / 2");
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByRole("heading")).toHaveText("Second photo");
  await expect(dialog.locator(".media-lightbox-counter")).toHaveText("2 / 2");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("heading")).toHaveText("First photo");
  await expect(dialog.locator(".media-lightbox-counter")).toHaveText("1 / 2");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog.getByRole("heading")).toHaveText("First photo");
  await expect(dialog.locator(".media-lightbox-counter")).toHaveText("1 / 2");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(expand).toBeFocused();
});
});

// Migrated from media-providers-credentials.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: media-providers-credentials", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
/**
 * @file Media → "Media providers" credential persistence, driven through the REAL admin SPA against
 * the REAL Tovu API (`../playwright.media-providers.config.ts`'s hermetic two-server harness). No
 * route stubbing anywhere in this file — every assertion below is the actual browser talking to the
 * actual server and the actual sealed credential store.
 *
 * This tab used to render `@jini-ai/ui`'s component against an in-memory fake, so nothing typed
 * survived a reload. These tests exist to keep that from silently coming back.
 *
 * What each test pins:
 * - The catalogue is the ENGINE's roster, not `@jini-ai/ui`'s curated sample — checked by the
 *   presence of vendors only the engine catalogue has, since a regression here would otherwise
 *   surface much later as credentials stored under ids the dispatch engine cannot resolve.
 * - A typed key survives a full page reload, coming back as a masked marker.
 * - The key itself never comes back to the browser, in any form.
 * - Clear really deletes server-side, not just locally.
 *
 * No real provider keys anywhere in this file — every value is an obvious dummy.
 */

const ADMIN_PATH = "/admin/";
const DUMMY_KEY = "sk-E2E-DUMMY-NOT-A-REAL-KEY-4242";

async function login(page: Page): Promise<void> {
  await page.goto(ADMIN_PATH, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".login-card", { timeout: 20_000 });
  await page.fill('.login-card label:has-text("Username") input', "admin");
  await page.fill('.login-card label:has-text("Password") input', PIN_PASSWORD);
  await page.click('.login-card button:has-text("Sign in")');
  await page.waitForSelector(".login-card", { state: "detached", timeout: 20_000 });
}

async function gotoMediaProviders(page: Page): Promise<void> {
  await page.goto(`${ADMIN_PATH}media`, { waitUntil: "domcontentloaded" });
  // The roster count is part of the tab's accessible name; its published handle is stable.
  const tab = page.getByRole("tab").and(page.locator('[data-agent-element="media-tab-external-providers"]'));
  await expect(tab).toContainText("External Providers");
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".media-providers-panel")).toBeVisible();
  await page.waitForSelector(".jini-media-provider-card", { timeout: 20_000 });
}

/** The OpenAI card — first in the catalogue, and the one every test here edits. */
function openaiCard(page: Page) {
  return page.locator(".jini-media-provider-card").filter({ hasText: "OpenAI" }).first();
}

test("the tab renders the engine's vendor roster, not @jini-ai/ui's curated sample", async ({ page }) => {
  await login(page);
  await gotoMediaProviders(page);

  const labels = await page.locator(".jini-media-provider-card-head strong").allInnerTexts();

  // Present only in `@jini-ai/integrations/media-providers`' `MEDIA_PROVIDERS`.
  expect(labels).toContain("Black Forest Labs");
  expect(labels).toContain("Replicate");
  expect(labels).toContain("ComfyUI");
  // Excluded on purpose: no credential surface / test-only placeholder.
  expect(labels).not.toContain("HyperFrames");
  expect(labels).not.toContain("Stub (placeholder)");
  // Materially larger than the 15-entry curated sample.
  expect(labels.length).toBeGreaterThan(15);
});

test("a typed key survives a full page reload as a masked marker, and never comes back in plaintext", async ({
  page,
}) => {
  await login(page);
  await gotoMediaProviders(page);

  const card = openaiCard(page);
  await card.locator('input[type="password"], input[type="text"]').first().fill(DUMMY_KEY);
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(card.locator(".jini-field-status-badge-success")).toHaveText(/Saved \(••••4242\)/, {
    timeout: 15_000,
  });

  // The whole point: a full reload, not a re-render.
  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoMediaProviders(page);

  await expect(openaiCard(page).locator(".jini-field-status-badge-success")).toHaveText(/Saved \(••••4242\)/, {
    timeout: 15_000,
  });
  expect(await page.content()).not.toContain(DUMMY_KEY);
});

test("the stored key is never delivered to the browser — the field stays empty", async ({ page }) => {
  await login(page);
  await gotoMediaProviders(page);

  const card = openaiCard(page);
  await card.locator('input[type="password"], input[type="text"]').first().fill(DUMMY_KEY);
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(card.locator(".jini-field-status-badge-success")).toBeVisible({ timeout: 15_000 });

  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoMediaProviders(page);

  // A stored key comes back as a marker only; the input itself holds nothing re-sendable.
  const value = await openaiCard(page).locator('input[type="password"], input[type="text"]').first().inputValue();
  expect(value).toBe("");
});

test("Clear removes the credential server-side, so a reload does not bring it back", async ({ page }) => {
  await login(page);
  await gotoMediaProviders(page);

  const card = openaiCard(page);
  await card.locator('input[type="password"], input[type="text"]').first().fill(DUMMY_KEY);
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(card.locator(".jini-field-status-badge-success")).toBeVisible({ timeout: 15_000 });

  await openaiCard(page).getByRole("button", { name: "Clear" }).click();
  await expect(openaiCard(page).locator(".jini-field-status-badge-success")).toHaveCount(0, { timeout: 15_000 });

  // A local-only clear would reappear here; a server-side delete does not.
  await page.reload({ waitUntil: "domcontentloaded" });
  await gotoMediaProviders(page);
  await expect(openaiCard(page).locator(".jini-field-status-badge-success")).toHaveCount(0, { timeout: 15_000 });
});
});
