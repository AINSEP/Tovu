// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { loginAsAdmin, pinSessionHeaders } from "../support/bug-pin-auth.js";
import assert from "node:assert/strict";
import { test as base } from "../support/bug-pin-fixtures.js";
import { type Page } from "../support/bug-pin-fixtures.js";
import { IsolatedJourneySite } from "../support/isolated-journey-site.js";
import { type Locator } from "../support/bug-pin-fixtures.js";
import path from "node:path";

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

/** Select the real per-user preference for pins that exercise a visible open-state FAB.
 * The owner-approved default now hides it; reload and wait for the saved preference instead
 * of bypassing the production CSS. The isolated pin site owns this setting's cleanup. */
async function keepOpenDockFabVisible({ page }: { page: Page }, _options = {}): Promise<void> {
  const response = await page.request.put("/api/admin/v1/workspaces/workspace-local/settings/value", {
    headers: await pinSessionHeaders({ request: page.request }),
    data: { namespace: "core.interface", key: "hideChatFabWhileOpen", scope: "user", valueJson: false },
  });
  expect(response.ok()).toBe(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".admin-layout")).toBeVisible();
  await expect(page.locator(".admin-layout")).not.toHaveClass(/hides-fab-while-open/);
}

// Migrated from admin-fab-drag-onto-dock.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-fab-drag-onto-dock", () => {
/**
 * @file Regression check for a same-day-introduced bug: dragging the desktop chat FAB onto the
 * open assistant dock used to rest normally DURING the drag, then snap back out onto the page the
 * moment it was released. Reported by the operator as "I can't drag it onto the chat pane —
 * whenever I do, it just resets outside of the chat pane onto the regular page."
 *
 * Root cause, confirmed by reading (`apps/admin/src/hooks/use-fab-position.hooks.ts`): the
 * `26b70a9` commit wired `avoidRightPx` (the measured desktop dock width) into `useFabPosition` to
 * fix a real, previously-Playwright-caught bug — the FAB's DEFAULT resting spot sat on top of the
 * dock's own composer send button (`admin-fab-position.spec.ts`, "Bug 5"). But the fix gated
 * purely on `dockOpen`, with no distinction between an untouched default position and a position
 * the operator had just deliberately dragged there — so on `pointerup`, the resting-style
 * recompute unconditionally pushed ANY drop inside the dock's width back out to
 * `avoidRightPx + FAB_EDGE_MARGIN`, regardless of how far from the composer button the drop
 * actually landed.
 *
 * Fixed by adding `pinnedByUser` to the persisted position: `true` only for an actual
 * drag-and-drop, gating the dock-avoidance clamp on `!pinnedByUser` so a deliberate drop is
 * respected while the untouched default spot (and any pre-existing/migrated-legacy position,
 * conservatively) still avoids the composer button. See that field's own doc on
 * `StoredFabPosition` for the full reasoning.
 *
 * Complements `admin-fab-position.spec.ts` rather than replacing it: that spec pins "the default
 * spot must avoid the composer button"; this one pins "an explicit drop elsewhere in the dock must
 * NOT be vetoed" — the two are opposite-direction regressions of the same clamp and both need
 * their own coverage, or a fix for one can silently reintroduce the other.
 *
 * Since the owner's 2026-10-06 preference change, a visible FAB keeps its default spot inside the
 * dock and the footer reserves space for Send. Select that preference explicitly: the contract
 * remains a deliberate drop that sticks, even though starting outside the dock is now historical.
 *
 * No `waitForLoadState("networkidle")` anywhere in this file — confirmed live (project memory) that
 * it never resolves against this admin app. Every wait below is an explicit element/state or
 * rendered-geometry wait. The original ResizeObserver-driven dock-width measurement had no single
 * settle event and used a short bounded timeout; the visible-FAB path no longer depends on it.
 */

const STORAGE_KEY = "tovu-admin-fab-position";

test.describe("admin chat FAB can be dropped onto the open dock and stays there", () => {
  test("a drop well clear of the composer send button rests inside the dock, not pushed back onto the page", async ({ page }) => {
    await loginAsAdmin(page);
    await keepOpenDockFabVisible({ page });

    // Real desktop width — same viewport `admin-fab-position.spec.ts` and this config use, so this
    // exercises the DOCKED layout, not the mobile sheet. Since 2026-10-06 the visible-FAB
    // preference keeps its default spot inside the dock and reserves composer-footer room.
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");

    // Wait for rendered geometry before the drag, as in `admin-fab-position.spec.ts`. The original
    // pin waited for ResizeObserver's avoidance to push the default outside the dock; the newer
    // visible-FAB preference deliberately keeps it inside, with Send moved clear by the footer.
    const fab = page.locator("button.chat-fab.chat-fab-dock-open");
    await expect(fab).toBeVisible();
    await expect.poll(async () => {
      const dockBox = await dock.boundingBox();
      const fabBox = await fab.boundingBox();
      return dockBox && fabBox ? fabBox.x >= dockBox.x
        && fabBox.x + fabBox.width <= dockBox.x + dockBox.width : false;
    }).toBe(true);
    const dockBoxBefore = await dock.boundingBox();
    const fabBoxBefore = await fab.boundingBox();
    expect(dockBoxBefore, "dock bounding box must be measurable").not.toBeNull();
    expect(fabBoxBefore, "FAB bounding box must be measurable before the drag").not.toBeNull();
    if (!dockBoxBefore || !fabBoxBefore) throw new Error("unreachable — asserted above");

    // Sanity check on the starting assumption this test depends on: the default used to start
    // OUTSIDE the dock's band; it now starts inside. Require a real move away from that spot
    // below, or retaining an already-matching drop target would prove nothing either way.

    // Drop target: well inside the dock horizontally, and near its TOP (below the header, clear of
    // the composer's send button which sits at the dock's bottom) — the drop this bug affected was
    // never actually near the send button; the old clamp rejected ANY position inside the dock's
    // width, at any height, which is exactly what this point is chosen to demonstrate.
    const targetX = dockBoxBefore.x + dockBoxBefore.width / 2;
    const targetY = dockBoxBefore.y + 90;

    const fabCenterX = fabBoxBefore.x + fabBoxBefore.width / 2;
    const fabCenterY = fabBoxBefore.y + fabBoxBefore.height / 2;
    expect(Math.hypot(targetX - fabCenterX, targetY - fabCenterY), "drop target must require a real drag").toBeGreaterThan(5);

    await page.mouse.move(fabCenterX, fabCenterY);
    await page.mouse.down();
    // Multiple intermediate steps: `useFabPosition`'s own `DRAG_THRESHOLD_PX` (5px of net pointer
    // movement) has to be crossed via real `pointermove` events, not a single teleporting jump, to
    // match how a real drag gesture is recognized.
    await page.mouse.move((fabCenterX + targetX) / 2, (fabCenterY + targetY) / 2, { steps: 10 });
    await page.mouse.move(targetX, targetY, { steps: 10 });
    await page.mouse.up();

    // The FAB's own resting-position recompute happens synchronously in React state, but give one
    // frame for the DOM to reflect it rather than reading `boundingBox()` in the same tick as `up()`.
    const expectAtDrop = async () => {
      await expect.poll(async () => {
        const box = await fab.boundingBox();
        return box ? Math.abs(box.x + box.width / 2 - targetX) : Infinity;
      }, { message: "the FAB must retain the requested horizontal position" }).toBeLessThanOrEqual(2);
      await expect.poll(async () => {
        const box = await fab.boundingBox();
        return box ? Math.abs(box.y + box.height / 2 - targetY) : Infinity;
      }, { message: "the FAB must retain the requested vertical position" }).toBeLessThanOrEqual(2);
    };
    await expectAtDrop();

    const fabBoxAfter = await fab.boundingBox();
    expect(fabBoxAfter, "FAB bounding box must be measurable after the drop").not.toBeNull();
    if (!fabBoxAfter) throw new Error("unreachable — asserted above");

    // The regression's own failure signature: before the fix, this would equal `fabBoxBefore` (or
    // any other position left of the dock) — the drop snapping straight back out. After the fix,
    // the FAB's horizontal center must land inside the dock's horizontal span.
    const fabCenterXAfter = fabBoxAfter.x + fabBoxAfter.width / 2;
    expect(
      fabCenterXAfter,
      `FAB center (${fabCenterXAfter}) must land inside the dock's horizontal span [${dockBoxBefore.x}, ${dockBoxBefore.x + dockBoxBefore.width}] after being dropped there`
    ).toBeGreaterThanOrEqual(dockBoxBefore.x);
    expect(fabCenterXAfter).toBeLessThanOrEqual(dockBoxBefore.x + dockBoxBefore.width);

    // Direct mechanism check, not just the visible symptom: the persisted position must actually be
    // marked `pinnedByUser`, confirming deliberate persisted placement, not some unrelated
    // coincidence of pixel math. This flag also gates the hook's historical dock-avoidance clamp.
    const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
    expect(stored, "a completed drag must persist a position").not.toBeNull();
    const parsed = JSON.parse(stored ?? "{}") as { pinnedByUser?: boolean };
    expect(parsed.pinnedByUser, "a completed drag-and-drop must be marked pinnedByUser").toBe(true);

    // Closing and reopening the dock must not un-pin the drop — persisted placement, including
    // the historical clamp's `!pinnedByUser` gate, must survive a real toggle, not one render only.
    await page.locator("button.chat-fab.chat-fab-dock-open").click(); // close
    await expect(dock).toHaveAttribute("hidden", "");
    await page.locator("button.chat-fab").click(); // reopen
    await expect(dock).not.toHaveAttribute("hidden", "");
    await expectAtDrop();

    const fabBoxReopened = await page.locator("button.chat-fab.chat-fab-dock-open").boundingBox();
    expect(fabBoxReopened, "FAB bounding box must be measurable after reopening the dock").not.toBeNull();
    if (!fabBoxReopened) throw new Error("unreachable — asserted above");
    const fabCenterXReopened = fabBoxReopened.x + fabBoxReopened.width / 2;
    expect(
      fabCenterXReopened,
      "the pinned position must still be inside the dock after a close/reopen cycle"
    ).toBeGreaterThanOrEqual(dockBoxBefore.x);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".admin-layout")).not.toHaveClass(/hides-fab-while-open/);
    if (await dock.getAttribute("hidden") !== null) await page.locator("button.chat-fab").click();
    await expect(dock).not.toHaveAttribute("hidden", "");
    await expectAtDrop();
  });
});
});

// Migrated from admin-fab-position.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-fab-position", () => {
/**
 * @file Bug 5 — the desktop chat-FAB/composer-send-button overlap, browser-verified 2026-08-05.
 *
 * `button.chat-fab.chat-fab-dock-open` used to sit on top of the docked assistant panel's own send
 * button at desktop widths and swallow its clicks — `apps/admin/src/hooks/use-fab-position.hooks.ts`'s
 * `useFabPosition` only carried the OLD `.chat-fab-dock-open { right: calc(380px + 20px) }` rule's
 * vertical axis (`avoidBottomPx`) forward when it replaced that CSS rule, not its horizontal one; a
 * confidently-worded comment on the same code claimed `avoidBottomPx` "generalizes" the old rule,
 * which was wrong — different axis — and desktop always passes `avoidBottomPx: 0`, so nothing
 * displaced the FAB at all. Fixed by measuring the dock's real rendered width via `ResizeObserver`
 * (`apps/admin/src/App.tsx`'s `dockWidthPx`) and passing it through as `avoidRightPx`.
 *
 * Since the owner's 2026-10-06 preference change, the default hides the FAB while open. Explicitly
 * keep it visible here so overlap and real-click checks still catch blocked Send; the current
 * visible-FAB contract reserves footer room instead of pushing the FAB out onto the page.
 *
 * Promoted here from a one-off throwaway verification script per this project's standing rule that
 * browser tests get saved and rerunnable, not left in scratch (see
 * `ADS-memory/reports/analysis/2026-08-05-bug5-fab-browser-verification.md` for the original probe's
 * full evidence trail, including why no existing spec — `destructive-path.spec.ts` submits via
 * `Enter`, never a real click on the send button — could catch this).
 *
 * No `waitForLoadState("networkidle")` anywhere in this file: confirmed live (project memory) that it
 * never resolves against this admin app. Every wait below is an explicit element/state wait instead.
 */

const SEND_BUTTON_SELECTOR = "button.jini-composer-send";

test.describe("admin chat FAB does not intercept the composer's send button (Bug 5)", () => {
  test("at desktop width, with the dock open, the send button is fully clickable and unobstructed", async ({ page }) => {
    await loginAsAdmin(page);
    await keepOpenDockFabVisible({ page });

    // Real desktop width — well above `App.tsx`'s `isSheetMode` breakpoint (`max-width: 640px`),
    // so this exercises the DOCKED footer's FAB clearance, not the mobile sheet's footer.
    // This is also `playwright.admin-fab.config.ts`'s own configured viewport; set again explicitly
    // here so the assumption is visible at the point that depends on it, not only in the config.
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");

    // The original ResizeObserver-driven avoidance needed a bounded layout settle, never
    // networkidle (the app's Vite HMR websocket can keep that pending indefinitely). With the
    // visible-FAB preference, CSS reserves footer room directly; wait for the rendered controls
    // below rather than polling internal React state or sleeping for the old measurement.

    const fab = page.locator("button.chat-fab.chat-fab-dock-open");
    await expect(fab).toBeVisible();
    const sendButton = page.locator(SEND_BUTTON_SELECTOR);
    await expect(sendButton).toBeVisible();

    const fabBox = await fab.boundingBox();
    const sendBox = await sendButton.boundingBox();
    expect(fabBox, "FAB bounding box must be measurable").not.toBeNull();
    expect(sendBox, "send button bounding box must be measurable").not.toBeNull();
    // `expect().not.toBeNull()` above is a runtime-only check — it doesn't narrow TypeScript's
    // `BoundingBox | null` type for the reads below. These `assert()`s are redundant at runtime
    // (the `expect()`s already threw if either was null) but give the compiler the narrowing.
    assert(fabBox, "FAB bounding box must be measurable");
    assert(sendBox, "send button bounding box must be measurable");

    // --- Check 1: no rectangle overlap between the FAB and the send button. ---
    // Standard axis-aligned-bounding-box separation test: two boxes overlap only if they overlap on
    // BOTH axes, so non-overlap on either axis alone is sufficient proof of no collision.
    const noOverlap =
      fabBox.x + fabBox.width <= sendBox.x ||
      sendBox.x + sendBox.width <= fabBox.x ||
      fabBox.y + fabBox.height <= sendBox.y ||
      sendBox.y + sendBox.height <= fabBox.y;
    expect(noOverlap, `FAB box ${JSON.stringify(fabBox)} must not overlap send button box ${JSON.stringify(sendBox)}`).toBe(true);

    // --- Check 2: the send button's own visual center resolves to the send button, not the FAB. ---
    // `.closest()`, not an exact class match: the button renders a `RemixIcon` `<i>` as its topmost
    // child, so `elementFromPoint` at the visual center returns that icon, a descendant, not the
    // `<button>` element itself. The real question is whether the resolved node is the send button
    // OR nested inside it (true here) versus the FAB or one of ITS OWN children (would be true if
    // this bug had regressed).
    const centerCheck = await page.evaluate(
      ({ x, y, selector }) => {
        const el = document.elementFromPoint(x, y);
        return {
          matchesSend: el?.closest(selector) !== null,
          isFabOrChild: el?.closest(".chat-fab") !== null,
        };
      },
      { x: sendBox.x + sendBox.width / 2, y: sendBox.y + sendBox.height / 2, selector: SEND_BUTTON_SELECTOR }
    );
    expect(centerCheck.matchesSend, "the send button's own center pixel must resolve inside the send button").toBe(true);
    expect(centerCheck.isFabOrChild, "the send button's own center pixel must NOT resolve inside the FAB").toBe(false);

    // --- Check 3: a real click reaches the send button. ---
    // This is the bug's own original failure signature (`use-fab-position.hooks.ts`'s own doc
    // comment: Playwright caught it as `<button class="chat-fab chat-fab-dock-open"> intercepts
    // pointer events` while trying to send a message) — a direct, not indirect, regression check.
    // Playwright's `.click()` auto-waits on actionability (visible, stable, unobstructed, receives
    // events) and fails the test outright with that same "intercepts pointer events" error if
    // something is on top, so no manual try/catch is needed here: an interception IS a test failure.
    const composer = page.locator("textarea.jini-composer-input");
    await composer.fill("Bug 5 regression check — not actually sent to any provider");
    await sendButton.click({ timeout: 8_000 });
  });
});
});

// Migrated from admin-selection-colors.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-selection-colors", () => {
  // Preserve the retired config budget for hooks as well as the test body.
  base.describe.configure({ timeout: 120_000 });
/**
 * Selected and active accents in the admin resolve to the brand `--primary` in the REAL cascade:
 * the admin's stylesheets plus the @jini-ai/ui stylesheets the Settings route injects at runtime.
 *
 * Why computed styles: the 2026-10-06 regression ("black outline rather than the orange outline it
 * used to have") came from an upstream token remap. Jini's 2026-10-03 extraction moved every
 * `--jini-accent*` token onto `--jini-primary`, which falls back to #363636 unless the host sets
 * `--jini-theme-*-primary`. No admin CSS line changed, so a stylesheet-text test
 * (`apps/admin/src/__tests__/unit/selection-ring-css.unit.test.ts`) could not have caught it.
 * Here every colour is read from the browser and compared with `--primary` resolved on the same
 * element at runtime, never with a hard-coded value.
 * Since 055e1949e an operator-CHOSEN Dialog appearance accent repaints fills through the host's
 * `--jini-theme-*-primary` inputs; the ledger's unchosen default (Jini's neutral blue) must not, so
 * on this fresh site every fill and outline is the brand `--primary` (owner, 2026-10-08: selected
 * tabs, chips and nav were near-black on tovu.dev, and the default accent would have made the
 * fills blue). The sidebar nav and the AI Assistant page are measured too: they are the surfaces
 * in that report.
 *
 * Probes: the selected CLI card and the active provider chip depend on which CLIs this machine
 * has and on the stored execution mode. When the real element is not on screen, the test renders
 * a same-class probe inside the Settings panel. A probe goes through the same cascade (Jini's
 * injected rules, the admin's overrides, the inherited tokens), which is exactly what regressed.
 */
const test = base.extend<{ settingsPage: Page }>({
  settingsPage: async ({ page, baseURL, journeySite: site }, use) => {
    if (!site || baseURL !== site.adminURL) {
      throw new Error("admin-selection-colors needs the journeys isolated site (journeySite fixture)");
    }
    await use(page);
  },
});

interface Swatch { label: string; actual: string; primary: string }

/**
 * Reads `property` from the element matched by `selector` (or a probe of `probeClass` inside
 * `probeParent` when no such element is rendered), next to `--primary` resolved on that element.
 * A missing `--primary` fails explicitly rather than painting an inherited text colour as the
 * reference. An SVG target (the sidebar icon) is referenced from its HTML parent, since an HTML
 * span inside `<svg>` is not a rendered box.
 */
async function swatch(
  page: Page,
  { label, selector, property, pseudo }: { label: string; selector: string; property: string; pseudo?: string },
  { probeClass, probeParent, probeTag = "button" }: { probeClass?: string; probeParent?: string; probeTag?: string } = {},
): Promise<Swatch> {
  return page.evaluate(({ label, selector, property, pseudo, probeClass, probeParent, probeTag }) => {
    let element = document.querySelector<HTMLElement | SVGElement>(selector);
    let probe: HTMLElement | null = null;
    if (!element && probeClass && probeParent) {
      const parent = document.querySelector(probeParent);
      if (!parent) throw new Error(`${label}: no ${selector} and no ${probeParent} to probe in`);
      probe = document.createElement(probeTag);
      probe.className = probeClass;
      probe.textContent = "probe";
      parent.appendChild(probe);
      element = probe;
    }
    if (!element) throw new Error(`${label}: ${selector} is not rendered`);
    if (!getComputedStyle(element).getPropertyValue("--primary").trim()) {
      throw new Error(`${label}: --primary did not resolve`);
    }
    // `--primary` serialized the way computed colours are (oklch(0.55 ...), not the authored
    // oklch(55% ...)), by painting it on a throwaway child of the same element.
    const host = element instanceof SVGElement ? element.parentElement ?? element : element;
    const reference = document.createElement("span");
    reference.style.color = "var(--primary)";
    host.appendChild(reference);
    const primary = getComputedStyle(reference).color;
    reference.remove();
    const actual = getComputedStyle(element, pseudo ?? null).getPropertyValue(property);
    probe?.remove();
    return { label, actual, primary };
  }, { label, selector, property, pseudo, probeClass, probeParent, probeTag });
}

function expectPrimary(result: Swatch): void {
  expect(result.primary, `${result.label}: reference primary did not resolve`).toMatch(/^oklch\(|^rgb/);
  expect(result.actual, result.label).toBe(result.primary);
}

async function openSettings(page: Page, tab: string): Promise<void> {
  await page.goto(`/admin/settings?tab=${tab}`);
  await expect(page.locator(".settings-ui-section .jini-tabbed-dialog-nav-item.active")).toBeVisible();
}

const SETTINGS = ".settings-ui-section";

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("Settings: active tab text and underline, selected CLI card border, provider chip fill", async ({ settingsPage: page }) => {
      await openSettings(page, "execution");
      const tab = ".settings-ui-section .jini-tabbed-dialog-nav-item.active";
      expectPrimary(await swatch(page, { label: "active Settings tab text", selector: tab, property: "color" }));
      expectPrimary(await swatch(page, { label: "active Settings tab underline", selector: tab, property: "border-bottom-color" }));
      // The CLI grid renders after detection; wait for it so a real selected card is preferred.
      await expect(page.locator(".jini-agent-card").first()).toBeVisible({ timeout: 60_000 });
      expectPrimary(await swatch(
        page,
        { label: "selected CLI card border", selector: ".jini-agent-card.is-selected", property: "border-top-color" },
        { probeClass: "jini-agent-card is-selected", probeParent: SETTINGS, probeTag: "div" },
      ));
      expectPrimary(await swatch(
        page,
        { label: "active provider chip fill", selector: ".jini-provider-chip.active", property: "background-color" },
        { probeClass: "jini-provider-chip active", probeParent: SETTINGS },
      ));
    });

    test("Settings: primary button and privacy consent button fills", async ({ settingsPage: page }) => {
      await openSettings(page, "privacy");
      // A fresh site has made no consent decision, so the two consent buttons are rendered.
      await expect(page.locator(".jini-privacy-consent-action--primary")).toBeVisible();
      expectPrimary(await swatch(page, {
        label: "privacy consent primary fill", selector: ".jini-privacy-consent-action--primary", property: "background-color",
      }));
      expectPrimary(await swatch(
        page,
        { label: "Jini primary button fill", selector: `${SETTINGS} .jini-button-primary`, property: "background-color" },
        { probeClass: "jini-button jini-button-primary", probeParent: SETTINGS },
      ));
    });

    test("admin tab bar: active tab underline and text", async ({ settingsPage: page }) => {
      await page.goto("/admin/plugins");
      const active = '.tab-bar-item[aria-selected="true"]';
      await expect(page.locator(active).first()).toBeVisible();
      expectPrimary(await swatch(page, { label: "admin tab bar underline", selector: active, property: "border-bottom-color" }));
      expectPrimary(await swatch(page, { label: "admin tab bar text", selector: active, property: "color" }));
    });

    test("AI Assistant page: active tab underline and text, provider chip fill, sidebar nav rail and icon", async ({ settingsPage: page }) => {
      await page.goto("/admin/ai-assistant?tab=admin");
      const tab = ".settings-ui-section .jini-tabbed-dialog-nav-item.active";
      await expect(page.locator(tab)).toBeVisible();
      expectPrimary(await swatch(page, { label: "AI Assistant active tab text", selector: tab, property: "color" }));
      expectPrimary(await swatch(page, { label: "AI Assistant active tab underline", selector: tab, property: "border-bottom-color" }));
      expectPrimary(await swatch(
        page,
        { label: "AI Assistant provider chip fill", selector: ".jini-provider-chip.active", property: "background-color" },
        { probeClass: "jini-provider-chip active", probeParent: SETTINGS },
      ));
      // The phone layout hides the sidebar behind its drawer; the rule is the same, so desktop only.
      if (viewport.width < 768) return;
      const nav = ".cms-item.active";
      await expect(page.locator(nav).first()).toBeVisible();
      expectPrimary(await swatch(page, { label: "sidebar active rail", selector: nav, property: "background-color", pseudo: "::before" }));
      expectPrimary(await swatch(page, { label: "sidebar active icon", selector: `${nav} svg`, property: "color" }));
    });
  });
}
});

// Migrated from admin-shell-no-document-scroll.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-shell-no-document-scroll", () => {
/**
 * @file Regression test for the admin shell's phantom vertical document scroll, found live (owner
 * UI/UX pass on the Deployment panel, 2026-08-15): *"there's a scroll issue here where if I go down
 * there's a bunch of white space."*
 *
 * ## The defect
 *
 * `.admin-layout` is `height: 100vh; overflow: hidden` and `.admin-content` is the real scroller
 * (`overflow-y: auto`), so the DOCUMENT itself must never scroll — every screen in this admin is a
 * fixed-viewport shell with two independent internal scrollers (the sidebar `.cms-nav` and the
 * content `main`). It scrolled anyway: 341px of blank page below a layout that ends at the viewport
 * edge, with the sidebar's own divider visibly stopping partway up the white area.
 *
 * The cause was `.visually-hidden` (`styles.css`, ONE global rule, 22 uses across 8 components).
 * It was `position: absolute` with NO `top`/`left`, so its offsets resolved against its static
 * position — measured inside its containing block, which is whatever ancestor is positioned. For
 * `.tab-bar-item` (a plain `<button>`, `position: static`) that is the initial containing block,
 * i.e. the document. `TabBar.tsx`'s accessible ", Connected" suffix on a connected publish-target
 * tab therefore computed `top: 1049.67px` and stretched `document.scrollHeight` to 1050px.
 *
 * Critically, `.admin-content`'s `overflow-y: auto` could NOT clip it: a static ancestor is not a
 * containing block, so the span was never inside that scroll box in the first place. That is why
 * the obvious fix — locking `html`/`body` with `overflow: hidden` — was measured and does NOT work
 * here (document scroll stayed at 341px). The fix is `top: 0; left: 0` on `.visually-hidden`,
 * pinning it to its containing block's origin instead of its static position.
 *
 * ## Why the probe is injected rather than driven through the real UI
 *
 * The production trigger is a publish target with a SAVED credential — only then does `TabBar`
 * render a `dot` and its ", Connected" suffix. This config boots a hermetic `TOVU_DB=memory`
 * server, so no credential exists and no such span is ever rendered.
 *
 * That is not a detail to paper over: an earlier revision of this file asserted only
 * `maxDocumentScrollY === 0` on the real page and passed **with the fix reverted**, because the
 * element that causes the bug was not on screen at all. A green result there measured "this
 * hermetic database has no saved credentials", not "the shell contains its overflow".
 *
 * So the first test injects the exact DOM shape instead: a `.visually-hidden` span whose ancestor
 * chain is entirely `position: static`, placed at the bottom of the tall content flow. That is the
 * same geometry `.tab-bar-item` produces, it depends on no seeded state, and it is verified to fail
 * against the unfixed rule and pass against the fixed one.
 *
 * jsdom has no layout engine, so `scrollHeight`/`clientHeight` are meaningless there and no unit
 * test at any level can observe any of this. The config pins a 1440x720 viewport — SHORTER than
 * the page content — because the bug is only reachable when the content actually overflows.
 *
 * No `waitForLoadState("networkidle")` anywhere here — confirmed live (project memory) that it
 * never resolves against this admin app. Every wait is an explicit element/state wait instead.
 */

const PROBE_ID = "vh-document-scroll-probe";

/** The shell's own contract, asserted directly: `.admin-layout` is `height: 100vh; overflow:
 *  hidden`, so the document has nothing to scroll. Reads the max scroll the browser will actually
 *  honour rather than comparing `scrollHeight` to `clientHeight` — an element can report a taller
 *  scrollHeight than it lets you reach, and what the owner saw was real reachable blank space, so
 *  the assertion should measure the thing they experienced. */
async function maxDocumentScrollY(page: Page): Promise<number> {
  return page.evaluate(() => {
    const before = window.scrollY;
    window.scrollTo(0, 1_000_000);
    const max = window.scrollY;
    window.scrollTo(0, before);
    return max;
  });
}

/**
 * Appends a `.visually-hidden` span at the bottom of the content scroller, inside a wrapper that is
 * `position: static` — reproducing `.tab-bar-item`'s geometry exactly.
 *
 * Appended to `.admin-content` itself rather than nested inside a card: `.card` and several of its
 * children are `position: relative`, which would give the span a containing block INSIDE the scroll
 * box and mask the very bug under test. `.admin-content` is static, so the span's containing block
 * resolves to the initial containing block — the condition that makes it escape the scroller.
 *
 * Returns the probe's static-position offset so the caller can assert the setup actually put it
 * below the fold; a probe that lands inside the first viewport proves nothing either way.
 */
async function injectVisuallyHiddenProbe(page: Page, probeId: string): Promise<number> {
  return page.evaluate((id) => {
    const content = document.querySelector(".admin-content");
    if (!content) throw new Error(".admin-content not found — the admin shell did not render");
    // Keep the regression reachable even on a screen whose real content fits the viewport.
    const spacer = document.createElement("div");
    spacer.style.height = `${window.innerHeight + 64}px`;
    spacer.style.flexShrink = "0";
    content.appendChild(spacer);
    const host = document.createElement("div");
    host.id = id;
    const span = document.createElement("span");
    span.className = "visually-hidden";
    span.textContent = ", Connected";
    host.appendChild(span);
    content.appendChild(host);
    return Math.round(host.getBoundingClientRect().top + window.scrollY);
  }, probeId);
}

test.describe("the admin shell never scrolls the document itself", () => {
  test("a screen-reader-only span low in the content flow does not stretch the document", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/deployment?tab=static-site");
    await expect(page.locator(".admin-content .card").first()).toBeVisible();

    // Precondition: the page is genuinely taller than the viewport, so the probe's static position
    // lands below the fold and the assertion below has something real to catch.
    const viewportHeight = page.viewportSize()?.height ?? 0;
    const probeTop = await injectVisuallyHiddenProbe(page, PROBE_ID);
    expect(probeTop).toBeGreaterThan(viewportHeight);

    // The whole point: that span sits ~1900px down the content flow, and the document must still
    // refuse to scroll. Pre-fix this is the 341px of white space the owner reported.
    expect(await maxDocumentScrollY(page)).toBe(0);
  });

  test("no .visually-hidden element resolves to a position below the viewport", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/deployment?tab=static-site");
    await expect(page.locator(".admin-content .card").first()).toBeVisible();
    const probeTop = await injectVisuallyHiddenProbe(page, PROBE_ID);
    expect(probeTop).toBeGreaterThan(page.viewportSize()!.height);

    // The mechanism itself, asserted directly rather than only through its symptom: a
    // screen-reader-only box that resolves its offsets against the document can push the page
    // taller no matter which screen it appears on. Pinned to its containing block's origin, its
    // document-space bottom can never exceed the viewport.
    const worst = await page.evaluate(() => {
      const vh = document.documentElement.clientHeight;
      let max = 0;
      for (const el of document.querySelectorAll(".visually-hidden")) {
        const r = el.getBoundingClientRect();
        max = Math.max(max, r.bottom + window.scrollY);
      }
      return { max, vh };
    });
    expect(worst.max).toBeLessThanOrEqual(worst.vh);
  });

  test("the fix does not disable either real scroller", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/deployment?tab=static-site");
    await expect(page.locator(".admin-content .card").first()).toBeVisible();

    // Guards the obvious wrong fix. "Stop the document scrolling" is trivially satisfiable by
    // clamping the shell until nothing scrolls at all — which would make the sidebar's lower nav
    // items and the bottom of every long page permanently unreachable. Both internal scrollers must
    // still overflow their own boxes.
    const scrollers = await page.evaluate(() => {
      const content = document.querySelector(".admin-content");
      const nav = document.querySelector(".cms-nav");
      return {
        contentOverflows: !!content && content.scrollHeight > content.clientHeight + 1,
        navOverflows: !!nav && nav.scrollHeight > nav.clientHeight + 1,
      };
    });
    expect(scrollers.contentOverflows).toBe(true);
    expect(scrollers.navOverflows).toBe(true);
    for (const selector of [".admin-content", ".cms-nav"]) {
      const scroller = page.locator(selector);
      await scroller.evaluate((el) => {
        el.scrollTop = 0;
        const target = document.createElement("div");
        target.dataset.scrollReachProbe = "true";
        target.textContent = "Below-fold scroll target";
        target.style.flexShrink = "0";
        el.appendChild(target);
      });
      const target = scroller.locator('[data-scroll-reach-probe="true"]');
      await expect(target).not.toBeInViewport();
      await scroller.hover();
      await page.mouse.wheel(0, 100_000);
      await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      await expect(target).toBeInViewport();
      expect(await maxDocumentScrollY(page)).toBe(0);
    }
  });

  test("Themes: the shared TabBar screen holds the same contract", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/themes");
    await expect(page.locator(".admin-content").first()).toBeVisible();
    await expect(page.locator(".tab-bar").first()).toBeVisible();

    const probeTop = await injectVisuallyHiddenProbe(page, PROBE_ID);
    expect(probeTop).toBeGreaterThan(page.viewportSize()!.height);
    expect(await maxDocumentScrollY(page)).toBe(0);
  });
});
});

// Migrated from admin-visual-parity.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-visual-parity", () => {
/**
 * @file Visual-parity audit — Settings/Posts (reference idiom, per the owner) vs Workspace/Taxonomy
 * (reported "look worse"), with Media/Menus as controls. Written for the 2026-08-05 web-design pass
 * after the owner rejected an earlier code-only review ("Workspace matches the house idiom, no
 * defect found") on the grounds that they're looking at rendered pixels, not source.
 *
 * This is a capture-and-save tool, not a pass/fail regression: every "test" below just navigates to
 * one admin section and writes a full-page screenshot to `ADS-memory/reports/`, so the images can be
 * diffed by eye and rerun after a fix for a real before/after. Run against `playwright.visual-
 * parity.config.ts`'s hermetic `TOVU_DB=memory` boot — never the real `infra/content.db`.
 *
 * Categories & Tags renders empty in a fresh memory boot (`seed.ts` seeds posts/media/menus but no
 * taxonomies), which would hide the owner's actual complaint (a page with real dummy categories/tags
 * on it). The first test creates two demo taxonomies through the real "New taxonomy"/"Add term" UI
 * (not a raw API bypass) — one flat, one hierarchical with a parent/child pair — so the capture shows
 * the same shape of screen the owner is looking at.
 *
 * `SNAPSHOT_DIR` is overridable so the same spec produces `before/` and `after/` sets across a fix
 * without editing this file twice.
 */

const SNAPSHOT_DIR =
  process.env.VISUAL_PARITY_DIR ?? "ADS-memory/reports/visual-parity-taxonomy-workspace/before";

async function shoot(page: import("@playwright/test").Page, name: string) {
  await page.screenshot({ path: `${SNAPSHOT_DIR}/${name}.png`, fullPage: true });
}

async function seedParityTaxonomies(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.goto("/admin/taxonomy");
  await expect(page.getByRole("heading", { name: "Categories & Tags", exact: true })).toBeVisible({ timeout: 10_000 });

  // Flat taxonomy — "Category", matches the owner's own naming ("categories/tags").
  await page.getByRole("button", { name: "New taxonomy" }).click();
  await page.getByLabel("New taxonomy").fill("Category");
  await page.getByRole("button", { name: "Create taxonomy" }).click();
  await page.locator(".settings-namespace-group", { hasText: "Category" }).waitFor({ state: "visible", timeout: 10_000 });

  // Two flat terms.
  const categoryGroup = page.locator(".settings-namespace-group", { hasText: "Category" });
  for (const term of ["News", "Guides"]) {
    await categoryGroup.getByRole("button", { name: "+ Add term" }).click();
    await categoryGroup.getByPlaceholder("Term name").fill(term);
    await categoryGroup.getByRole("button", { name: "Add term" }).click();
    await categoryGroup.getByText(term, { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  }

  // Hierarchical taxonomy — "Topic", with one parent/child pair, to exercise the indented row.
  await page.getByRole("button", { name: "New taxonomy" }).click();
  await page.getByLabel("New taxonomy").fill("Topic");
  await page.getByRole("checkbox", { name: "Hierarchical" }).check();
  await page.getByRole("button", { name: "Create taxonomy" }).click();
  await page.locator(".settings-namespace-group", { hasText: "Topic" }).waitFor({ state: "visible", timeout: 10_000 });

  const topicGroup = page.locator(".settings-namespace-group", { hasText: "Topic" });
  await topicGroup.getByRole("button", { name: "+ Add term" }).click();
  await topicGroup.getByPlaceholder("Term name").fill("Engineering");
  await topicGroup.getByRole("button", { name: "Add term" }).click();
  await topicGroup.getByText("Engineering", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });

  await topicGroup.getByRole("button", { name: "+ Add term" }).click();
  await topicGroup.getByPlaceholder("Term name").fill("Backend");
  await topicGroup.locator('select[aria-label="Parent term"]').selectOption({ label: "Engineering" });
  await topicGroup.getByRole("button", { name: "Add term" }).click();
  await topicGroup.getByText("Backend", { exact: true }).waitFor({ state: "visible", timeout: 10_000 });
  // Keep UI creation real; the verification read must carry the same Secure session over HTTP.
  const response = await page.request.get("/api/admin/v1/taxonomy", {
    headers: await pinSessionHeaders({ request: page.request }), timeout: 10_000,
  });
  expect(response.status()).toBe(200);
  const { items } = await response.json();
  const topic = items.find((item: { taxonomy: { name: string } }) => item.taxonomy.name === "Topic");
  expect(topic).toBeDefined();
  const parent = topic.terms.find((term: { name: string }) => term.name === "Engineering");
  const child = topic.terms.find((term: { name: string }) => term.name === "Backend");
  expect(parent).toBeDefined();
  expect(child).toBeDefined();
  expect(child.parentId).toBe(parent.id);
  const parentBox = await topicGroup.getByRole("button", { name: "Engineering", exact: true }).boundingBox();
  const childBox = await topicGroup.getByRole("button", { name: "Backend, subcategory of Engineering", exact: true }).boundingBox();
  expect(parentBox).not.toBeNull();
  expect(childBox).not.toBeNull();
  expect(childBox!.x).toBeGreaterThan(parentBox!.x);
  expect(childBox!.y).toBeGreaterThanOrEqual(parentBox!.y + parentBox!.height);
}

// Each pin starts with reset data and arranges its own screen; a failed seed must not skip captures.
test.describe("admin visual parity capture", () => {
  test("seeds two demo taxonomies (flat + hierarchical) through the real UI", async ({ page }) => {
    await seedParityTaxonomies(page);
  });

  test("captures Settings (reference)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/settings");
    await page.locator(".settings-ui-section").waitFor({ state: "visible" });
    await shoot(page, "01-settings");
  });

  test("captures Posts (reference)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/posts");
    await page.locator(".page-title", { hasText: "Posts" }).waitFor({ state: "visible" });
    await page.locator("table").waitFor({ state: "visible" });
    await shoot(page, "02-posts");
  });

  test("captures Workspace (problem)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/workspace");
    // SPEC-044 moved Workspace into Settings; the legacy route redirects and omits its old h1.
    await expect(page).toHaveURL(/\/admin\/settings\?tab=workspace$/, { timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Workspace", exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
    await expect(page.locator(".workspace-page").getByLabel("Name", { exact: true })).toBeVisible({ timeout: 10_000 });
    await shoot(page, "03-workspace");
  });

  test("captures Categories & Tags (problem)", async ({ page }) => {
    // A cold site has no taxonomy from the earlier seed test. Arrange it independently.
    await seedParityTaxonomies(page);
    await page.goto("/admin/taxonomy");
    await expect(page.getByRole("heading", { name: "Categories & Tags", exact: true })).toBeVisible({ timeout: 10_000 });
    await page.locator(".settings-namespace-group", { hasText: "Topic" }).waitFor({ state: "visible", timeout: 10_000 });
    await shoot(page, "04-taxonomy");

    // Also capture the term detail panel open (the two-pane state), since that's a second layout
    // the owner would actually see, not just the list-only resting state.
    await page.getByText("Backend", { exact: true }).click();
    await page.locator(".settings-detail-panel").waitFor({ state: "visible", timeout: 10_000 });
    await shoot(page, "04b-taxonomy-detail-open");
  });

  test("captures Media (control)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/media");
    await page.locator(".page-title", { hasText: "Media" }).waitFor({ state: "visible" });
    await shoot(page, "05-media");
  });

  test("captures Menus (control)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/menus");
    await page.locator(".page-title", { hasText: "Menus" }).waitFor({ state: "visible" });
    await shoot(page, "06-menus");
  });
});
});

// Migrated from assistant-dock-preview-layout.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: assistant-dock-preview-layout", () => {
/** Checks the rendered containing block and hit testing with the production styles. */
async function expectReachable(locator: Locator) {
  await expect(locator).toBeVisible();
  expect(await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && element.contains(hit);
  })).toBe(true);
}

async function expectPreviewControlAnchored(surface: Locator) {
  const control = surface.locator(".post-preview-fab");
  await control.scrollIntoViewIfNeeded();
  await expectReachable(control);
  await expect.poll(() => surface.evaluate((element) => {
    const button = element.querySelector<HTMLElement>(".post-preview-fab")!;
    const surfaceBox = element.getBoundingClientRect();
    const buttonBox = button.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.6;
    return Math.abs(buttonBox.top - surfaceBox.top - inset) <= 1
      && Math.abs(surfaceBox.right - buttonBox.right - inset) <= 1;
  })).toBe(true);
}

test("expanded post preview leaves the chat FAB and open assistant dock accessible", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginAsAdmin(page);
  await keepOpenDockFabVisible({ page });
  await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);

  const fab = page.locator(".chat-fab");
  const dock = page.locator(".admin-chat-dock");
  if (await dock.isVisible()) await fab.click();
  await expect(dock).toBeHidden();
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expectPreviewControlAnchored(page.locator(".post-preview-surface"));
  await page.getByRole("button", { name: "Show full screen", exact: true }).click();
  const expanded = page.locator(".post-preview-expanded");
  await expect(expanded).toBeVisible();
  await expectPreviewControlAnchored(expanded.locator(".post-preview-surface"));
  // Breaking any link in the flex chain leaves a ~150px intrinsic iframe in a tall panel.
  await expect.poll(() => expanded.evaluate((element) => {
    const surface = element.querySelector(".post-preview-surface");
    const shell = element.querySelector(".editor-shell");
    const frame = element.querySelector(".page-preview-frame");
    const iframe = element.querySelector("iframe");
    if (!surface || !shell || !frame || !iframe) return false;
    const panelHeight = element.getBoundingClientRect().height;
    const surfaceHeight = surface.getBoundingClientRect().height;
    const notice = element.querySelector(".editor-preview-notice");
    const noticeStyle = notice && getComputedStyle(notice);
    const noticeHeight = notice && noticeStyle ? notice.getBoundingClientRect().height
      + parseFloat(noticeStyle.marginTop) + parseFloat(noticeStyle.marginBottom) : 0;
    const shellHeight = shell.getBoundingClientRect().height;
    const frameHeight = frame.getBoundingClientRect().height;
    const iframeHeight = iframe.getBoundingClientRect().height;
    return panelHeight > 300 && surfaceHeight >= panelHeight - 2
      && shellHeight >= surfaceHeight - noticeHeight - 2 && frameHeight >= shellHeight - 2
      && iframeHeight >= frameHeight - 2;
  })).toBe(true);
  await expectReachable(fab);
  await fab.click();
  await expectReachable(dock);
  await expectReachable(fab);

  // A changed inset/size or containing block must not spill into the dock's separate column.
  await expect.poll(async () => {
    const previewBox = await expanded.boundingBox();
    const mainBox = await page.locator(".admin-main-col").boundingBox();
    const dockBox = await dock.boundingBox();
    if (!previewBox || !mainBox || !dockBox) return false;
    const tolerance = 1;
    return previewBox.width > 0 && previewBox.height > 0
      && previewBox.x >= mainBox.x - tolerance
      && previewBox.y >= mainBox.y - tolerance
      && previewBox.x + previewBox.width <= mainBox.x + mainBox.width + tolerance
      && previewBox.y + previewBox.height <= mainBox.y + mainBox.height + tolerance
      && previewBox.x + previewBox.width <= dockBox.x + tolerance;
  }).toBe(true);
});
});

// Migrated from mobile-sheet-scroll.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: mobile-sheet-scroll", () => {
/**
 * @file Regression test for the mobile chat sheet blocking scroll to the bottom of the page
 * (owner repro, 2026-08-26): *"the bottom sheet AI agent wasn't allowing me to scroll... there's
 * CSS at the bottom that adjusts for when it's mobile size and when the agent chat appears."*
 *
 * The page underneath was never scroll-locked — `.admin-content` keeps its own `overflow-y: auto`.
 * The real bug: nothing was reserved below the last element, so it could never be scrolled clear
 * of the sheet (`.admin-chat-dock`, `styles.css`'s `max-width: 640px` block), which sits
 * `position: fixed` over the bottom 58vh (peek) or 92vh (expanded) of the viewport.
 *
 * The first fix reserved that space with `padding-bottom` on `.admin-content`. That broke at a
 * short viewport in the expanded state: padding can never shrink a box below its own value
 * (border-box's floor), so `padding-bottom: 92vh` plus the existing padding-top forced
 * `.admin-content` taller than its flex-allotted height, pushing its true bottom edge below the
 * viewport and leaving the last row still ~14px under the sheet even at max scroll. The fix is an
 * `::after` spacer instead — ordinary scrollable content, which `overflow-y: auto` clips like
 * anything else, so the box never grows past its flex-determined size. `375x667` + expanded is the
 * viewport/state pair that exposed this; it is asserted explicitly below, not just the roomier
 * `414x896` the owner's own repro used.
 *
 * jsdom has no layout engine (no real flexbox/box-model math), so none of this is unit-testable —
 * confirmed live via `content.style.paddingBottom = ...` experiments that only a real browser
 * could run.
 */

const scrollFixtureIds = new WeakMap<Page, string[]>();
test.afterEach(async ({ page }) => {
  for (const id of scrollFixtureIds.get(page) ?? []) {
    const response = await page.request.delete(`/api/admin/v1/workspaces/workspace-local/posts/${id}`, {
      headers: await pinSessionHeaders({ request: page.request }),
    });
    expect(response.ok()).toBe(true);
  }
});

/** Require a naturally overflowing list before opening the sheet, independent of its spacer. */
async function expectScrollablePostsList(page: Page): Promise<void> {
  const seededIds: string[] = [];
  scrollFixtureIds.set(page, seededIds);
  const postsPath = "/api/admin/v1/workspaces/workspace-local/posts";
  const headers = await pinSessionHeaders({ request: page.request });
  // A small in-memory seed must not turn clearance into a vacuous short-list check.
  for (let index = 0; index < 40; index++) {
    const response = await page.request.post(postsPath, { headers, data: { title: `Sheet scroll fixture ${index}` } });
    expect(response.status()).toBe(201);
    const { post } = await response.json();
    expect(typeof post.id).toBe("string");
    seededIds.push(post.id);
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".list-table tbody tr").first().waitFor({ state: "visible", timeout: 10_000 });
  const count = await page.locator(".list-table tbody tr").count();
  expect(count, "seed data must have more than one post to make a scrollable list").toBeGreaterThan(1);
  const overflows = await page.locator(".admin-content").evaluate((element) => element.scrollHeight > element.clientHeight);
  expect(overflows, "the posts list must overflow before the sheet adds any spacer").toBe(true);
}

async function openSheet(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(page.locator(".admin-chat-dock")).not.toHaveAttribute("hidden", "");
}

async function expandSheet(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Expand assistant panel" }).click();
  await expect(page.locator(".admin-chat-dock")).toHaveClass(/is-expanded/);
  // The class changes before the 200ms height transition ends. Measure the final exposed strip,
  // or the expanding sheet can cover the wheel target after its coordinates were chosen (F7.1).
  await expect.poll(() => page.locator(".admin-chat-dock").evaluate((element) =>
    element.getAnimations().some((animation) => animation.playState === "running")
  ), { timeout: 5_000 }).toBe(false);
}

/** Scrolls `.admin-content` to its max and reports whether the last table row's bottom edge
 *  cleared the sheet's top edge — the owner's own bar: "you could just scroll more up the page." */
async function lastRowClearsSheet(page: Page): Promise<{ cleared: boolean; gap: number }> {
  const region = await page.evaluate(() => {
    const content = document.querySelector(".admin-content") as HTMLElement;
    const dock = document.querySelector(".admin-chat-dock") as HTMLElement;
    const rect = content.getBoundingClientRect();
    const bottom = Math.min(rect.bottom, dock.getBoundingClientRect().top);
    // At 375x667 the expanded sheet leaves ~1px above it. Use an integer pixel inside that strip
    // so native wheel hit testing cannot round a fractional midpoint onto the topbar or sheet.
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.ceil(rect.top + (bottom - rect.top) / 2);
    return { x, y, exposed: bottom - rect.top,
      hitsContent: y < bottom && content.contains(document.elementFromPoint(x, y)),
      before: content.scrollTop, max: content.scrollHeight - content.clientHeight };
  });
  expect(region.exposed, "a visitor must have exposed content to scroll above the sheet").toBeGreaterThan(0);
  expect(region.hitsContent, "the native wheel target must hit exposed page content").toBe(true);
  expect(region.max).toBeGreaterThan(region.before);
  await page.mouse.move(region.x, region.y);
  await page.mouse.wheel(0, region.max + 1000);
  await expect.poll(() => page.locator(".admin-content").evaluate((element) => element.scrollTop), { timeout: 5_000 }).toBeGreaterThan(region.before);
  await expect.poll(() => page.locator(".admin-content").evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop), { timeout: 5_000 }).toBeLessThanOrEqual(1);
  return page.evaluate(() => {
    const content = document.querySelector(".admin-content") as HTMLElement;
    const dock = document.querySelector(".admin-chat-dock") as HTMLElement;
    const rows = content.querySelectorAll(".list-table tbody tr");
    const lastRow = rows[rows.length - 1] as HTMLElement;
    const gap = dock.getBoundingClientRect().top - lastRow.getBoundingClientRect().bottom;
    return { cleared: gap >= -1, gap }; // 1px tolerance for subpixel rounding
  });
}

test.describe("mobile chat sheet reserves scroll room instead of blocking it", () => {
  test("414x896, peek state: the last row on a long page clears the sheet", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
    await expectScrollablePostsList(page);

    await openSheet(page);
    const result = await lastRowClearsSheet(page);
    expect(result.cleared, `last row should clear the sheet, gap was ${result.gap}px`).toBe(true);
  });

  test("414x896, expanded state: the last row still clears the taller sheet", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
    await expectScrollablePostsList(page);

    await openSheet(page);
    await expandSheet(page);
    const result = await lastRowClearsSheet(page);
    expect(result.cleared, `last row should clear the sheet, gap was ${result.gap}px`).toBe(true);
  });

  test("375x667, expanded state: the padding-floor regression stays fixed", async ({ page }) => {
    await loginAsAdmin(page);
    // The exact viewport that exposed the padding-bottom box-model bug: 92vh of 667px (613.64px)
    // plus the base 16px padding-top exceeds `.admin-content`'s entire 615px flex-allotted height.
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
    await expectScrollablePostsList(page);

    await openSheet(page);
    await expandSheet(page);

    // Pins the mechanism, not just the symptom: `.admin-content`'s own rendered box must stay at
    // its flex-allotted height (never taller), which is what makes the row-clearance check above
    // meaningful rather than accidental.
    const contentHeight = await page.evaluate(() => document.querySelector(".admin-content")!.getBoundingClientRect().height);
    const viewportHeight = page.viewportSize()!.height;
    const topbarHeight = await page.evaluate(() => document.querySelector(".admin-topbar")!.getBoundingClientRect().height);
    expect(contentHeight).toBeLessThanOrEqual(viewportHeight - topbarHeight + 1);

    const result = await lastRowClearsSheet(page);
    expect(result.cleared, `last row should clear the sheet, gap was ${result.gap}px`).toBe(true);
  });

  test("closing the sheet leaves no reserved dead space to scroll into", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 414, height: 896 });
    await page.goto("/admin/posts", { waitUntil: "domcontentloaded" });
    await expectScrollablePostsList(page);

    const naturalMaxScroll = await page.evaluate(() => {
      const content = document.querySelector(".admin-content") as HTMLElement;
      return content.scrollHeight - content.clientHeight;
    });

    await openSheet(page);
    await expandSheet(page);
    await page.getByRole("button", { name: "Close assistant" }).click();
    await expect(page.locator(".admin-chat-dock")).toHaveAttribute("hidden", "");

    const closedMaxScroll = await page.evaluate(() => {
      const content = document.querySelector(".admin-content") as HTMLElement;
      return content.scrollHeight - content.clientHeight;
    });
    expect(closedMaxScroll).toBe(naturalMaxScroll);
  });
});
});

// Migrated from multi-tab-resource-soak.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: multi-tab-resource-soak", () => {
  // Preserve the retired config budget for hooks as well as the test body.
  test.describe.configure({ timeout: 100_000 });
/**
 * @file Standing, generalized regression cover for the browser-connection-pool-exhaustion bug shape
 * found and fixed 2026-08-17 (three instances that day: `settings-events.ts`'s permanent
 * `EventSource`, `useChatPaneRuntimeInventory`'s non-single-flight poll, and `reattachRun`'s dropped
 * cancellation signal — see `ADS-memory/reports/2026-08-17-resource-leak-sweep.md`).
 *
 * `themes-presentation-request-timeout.spec.ts` proved the underlying fix (`lib/api.ts`'s
 * `fetchOrThrowUnreachable` racing every request against `AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)`)
 * against exactly one screen, Themes. This suite generalizes that same mechanism — open N long-lived
 * connections against the shared origin, then confirm the app still produces a definitive outcome
 * rather than hanging forever — across MULTIPLE screens, so the check is not pinned to Themes'
 * specific fix and instead proves the shared seam every `api.*` call goes through. `Posts.tsx` and
 * `FormsList.tsx` were picked because they use the exact same
 * `error ? <div className="notice error">{error}</div> : null` idiom Themes, Database, and Comments
 * all share — confirmed via `grep -rn 'notice error' apps/admin/src` before writing this.
 *
 * ## Why simulated connections, not real extra tabs
 *
 * Real tabs works too (the brief's original wording), but N real tabs each loading the full admin
 * SPA is slow and adds noise unrelated to the mechanism itself (bundle parse time, React mount time,
 * per-tab login race) — the same reasoning `themes-presentation-request-timeout.spec.ts` already
 * documents. The actual mechanism under test is just "N long-lived connections already held against
 * this origin," reproduced directly and deterministically by opening `EXTRA_HELD_CONNECTIONS` extra
 * raw `EventSource` connections to `/settings/events` from inside the one already-logged-in tab.
 *
 * ## Not wired into a blocking CI gate
 *
 * This is a real-wall-clock suite (~80s per screen) that waits out a genuine 60s timeout rather than
 * mocking it, on purpose — mirroring `themes-presentation-request-timeout.spec.ts`'s own reasoning
 * for why a real wait is the point, not a shortcut being avoided. Per the original sweep proposal,
 * this is meant to run periodically, not as a per-commit blocker. No existing CI config in this repo
 * auto-collects new `development/e2e/*.spec.ts` files into a blocking run (each suite gets its own
 * narrowly-`testMatch`-scoped `playwright.*.config.ts`, run explicitly) — left as an explicit open
 * decision for the owner rather than assumed.
 */

const WORKSPACE_ID = "workspace-local";
const SETTINGS_EVENTS_URL = `/api/admin/v1/workspaces/${WORKSPACE_ID}/settings/events`;
/** Extra long-lived connections opened on top of the tab's own real one (`App.hooks.tsx`), enough to
 *  push the origin's total held connections past Chrome's 6-per-origin HTTP/1.1 cap regardless of
 *  exact browser accounting — same value and reasoning as
 *  `themes-presentation-request-timeout.spec.ts`. */
const EXTRA_HELD_CONNECTIONS = 6;

/** Screens exercised by this soak check. Deliberately more than one, and deliberately NOT Themes —
 *  the point of generalizing is to prove the shared `lib/api.ts` seam, not re-prove Themes' own
 *  already-covered regression. Add more screens here to widen coverage; each must render a fetch
 *  error through the shared `.notice.error` idiom. */
const SCREENS: ReadonlyArray<{ navLabel: string }> = [{ navLabel: "Posts" }, { navLabel: "Forms" }];

/** Opens `count` extra `EventSource` connections against the settings change-feed endpoint from
 *  inside `page`, simulating `count` additional long-lived tabs/pollers holding a connection open
 *  against the same origin. Mirrors `themes-presentation-request-timeout.spec.ts`'s own helper. */
async function holdExtraConnections(
  { page, count, probeUrl }: { page: Page; count: number; probeUrl: string },
  _options: Record<string, never> = {},
): Promise<void> {
  const network = await page.context().newCDPSession(page);
  try {
    await network.send("Network.enable");
    const protocols: string[] = [];
    network.on("Network.responseReceived", (event) => {
      if (new URL(event.response.url).pathname === SETTINGS_EVENTS_URL) {
        const protocol = event.response.protocol;
        if (protocol === undefined) throw new Error("Settings event stream response did not report its protocol");
        protocols.push(protocol);
      }
    });
    await page.evaluate(
      ({ url, holdCount }) => {
        const win = window as unknown as { __soakSockets?: EventSource[] };
        win.__soakSockets = Array.from({ length: holdCount }, () => new EventSource(url, { withCredentials: true }));
      },
      { url: SETTINGS_EVENTS_URL, holdCount: count }
    );
    await expect.poll(() => page.evaluate(() =>
      (window as unknown as { __soakSockets: EventSource[] }).__soakSockets.filter((socket) => socket.readyState === EventSource.OPEN).length
    ), { timeout: 15_000 }).toBeGreaterThan(0);
    expect(protocols.length).toBeGreaterThan(0);
    expect(protocols.every((protocol) => protocol === "http/1.1")).toBe(true);
    // Like Themes, prove exhaustion with this screen's real queued request: the shell now holds
    // more than one stream, so five extra streams need not fit in the origin's six sockets.
    await expect.poll(() => page.evaluate(async (url) => {
      try {
        await fetch(url, { signal: AbortSignal.timeout(2_000) });
        return "responded";
      } catch (error) { return (error as Error).name; }
    }, probeUrl), { timeout: 15_000, message: "an ordinary request must be blocked by the held streams before navigation" }).toBe("TimeoutError");
  } finally {
    // Setup assertions can fail before navigation; release the CDP listener on every path.
    await network.detach();
  }
}

test.describe("admin app survives an exhausted per-origin connection pool, across multiple screens", () => {
  test.afterEach(async ({ page }) => {
    if (page.isClosed()) return;
    // Close both OPEN and queued CONNECTING streams even when setup or the timeout assertion fails.
    await page.evaluate(() => {
      const win = window as unknown as { __soakSockets?: EventSource[] };
      for (const socket of win.__soakSockets ?? []) socket.close();
      delete win.__soakSockets;
    });
  });

  for (const screen of SCREENS) {
    test(`${screen.navLabel} fails visibly instead of hanging forever when no socket is free`, async ({ page }) => {
      await loginAsAdmin(page);
      await holdExtraConnections({ page, count: EXTRA_HELD_CONNECTIONS,
        probeUrl: `/api/admin/v1/workspaces/${WORKSPACE_ID}/${screen.navLabel.toLowerCase()}` });

      const navLink = page.locator("nav").first().getByRole("link", { name: screen.navLabel, exact: true });
      await navLink.click();

      const errorNotice = page.locator(".notice.error");
      await expect(errorNotice).toBeVisible({ timeout: 75_000 });
      await expect(errorNotice).toContainText("The Tovu API did not respond within 60s");

      // The loading copy must have been replaced, not merely coexisting with an unrelated error.
      await expect(page.getByText(`Loading ${screen.navLabel.toLowerCase()}…`, { exact: true })).toHaveCount(0);
    });
  }
});
});

// Migrated from placeholder-tabs-card-parity.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: placeholder-tabs-card-parity", () => {
/** Absolute so the screenshot destination doesn't depend on whatever directory Playwright happens
 *  to be invoked from — a relative path here resolves against `process.cwd()`, not `testDir`. */
const SCREENSHOT_DIR = path.resolve(import.meta.dirname, "../../../ADS-memory/reports/placeholder-tabs-card-parity");

/**
 * @file Pins the fix for the "Payments/Deployment/Authentication don't match Settings" bug
 * (web-design dispatch, 2026-08-05): `PlaceholderTabs.tsx` used to mount
 * `SettingsDialogShell` with the `settings-ui-section--page-flow` modifier — the variant
 * `features/ai-assistant/AiAssistant.tsx` uses because THAT screen supplies its own external
 * `.page-header` above the shell. `PlaceholderTabs` supplied no such header; instead it baked the
 * kicker/title/subtitle into `Placeholder.tsx`'s `ComingSoonNotice` and rendered that as the
 * active tab's *panel*. Combined, `--page-flow` hid the shell's own `.jini-tabbed-dialog-head`
 * and flattened its card (transparent background, no border, no shadow — see that modifier's own
 * comment in `styles.css`), so the only place left for a heading to render was inside
 * `.jini-tabbed-dialog-content`, below the tab strip. Confirmed live (Chromium screenshots,
 * `ADS-memory/reports/`) before the fix: no visible card boundary on `/admin/payments`, and
 * "PEOPLE" / "Home" / "Home is coming soon." rendered under the Home/Stripe/PayPal tab row instead
 * of above it — while `/admin/settings`, which never carried that modifier, showed the header
 * above its tabs inside a bordered card.
 *
 * The fix feeds the same three strings through the shell's own contract instead — `labels.kicker`
 * (section-level) and each tab's `title`/`subtitle` (per-tab) — so the shell renders them exactly
 * where `SettingsUi.tsx`'s real tabs do: above the tab strip, inside the card.
 *
 * Hermetic boot via `playwright.placeholder-tabs.config.ts` (`TOVU_DB=memory`, dedicated ports) —
 * see that config's own header for the port reservation. Never touches `infra/content.db`.
 */

/** The three routes `panels.tsx` wires to `PlaceholderTabs`, plus `/admin/settings` as the
 *  known-good reference this suite pins parity against. Historical route set: only Settings
 *  retains its own shell header today; Authentication and retired Payments are pinned below. */
const SECTIONS = [
  // Owner changes supersede the historical card contract above: Settings is flat (2026-09-06),
  // Authentication owns an external header, and Payments is no longer a core panel.
  { path: "/admin/settings", kicker: "Settings", title: "AI agent", isReference: true },
] as const;

/** Navigates to an admin section and waits for the settings-dialog shell to be the thing on
 *  screen, not just present in the DOM mid-transition. */
async function gotoSection(page: Page, sectionPath: string): Promise<void> {
  await page.goto(sectionPath, { waitUntil: "domcontentloaded" });
  await page.locator(".jini-tabbed-dialog").waitFor({ state: "visible", timeout: 10_000 });
}

// Login happens once in `playwright.placeholder-tabs.config.ts`'s `globalSetup`, and every test
// here inherits the resulting session via that config's `use.storageState` — see that setup
// file's own header for why the login cannot live in a `beforeAll` in this file instead.
test.describe("placeholder tabs match Settings' card chrome", () => {
  for (const section of SECTIONS) {
    test(`${section.path}: current header sits above the tab strip in the flat settings shell`, async ({ page }) => {
      await gotoSection(page, section.path);

      const dialog = page.locator(".jini-tabbed-dialog");
      const head = dialog.locator(".jini-tabbed-dialog-head");

      // The header block (kicker/title/subtitle) must actually be visible — this is exactly what
      // `--page-flow` used to hide via `display: none` for every placeholder section.
      await expect(head).toBeVisible();
      await expect(head.locator(".jini-tabbed-dialog-kicker")).toHaveText(section.kicker.toUpperCase(), {
        // `.jini-tabbed-dialog-kicker`'s CSS applies `text-transform: uppercase`; the underlying
        // text node is title-case, so match case-insensitively against the raw string instead of
        // asserting on rendered casing (a CSS concern, not a content one).
        ignoreCase: true,
      });
      await expect(head.locator("h2")).toHaveText(section.title);

      // DOM order, not just visibility: the head element must precede the tab-strip/content body
      // in source order. `compareDocumentPosition` is the direct way to assert "A comes before B"
      // rather than inferring it from bounding-box Y coordinates, which CSS could satisfy by
      // accident (e.g. `order` or absolute positioning) without the DOM actually being fixed.
      const headPrecedesBody = await head.evaluate((headEl, bodySelector) => {
        const bodyEl = headEl.parentElement?.querySelector(bodySelector);
        if (!bodyEl) return false;
        return Boolean(headEl.compareDocumentPosition(bodyEl) & Node.DOCUMENT_POSITION_FOLLOWING);
      }, ".jini-tabbed-dialog-body");
      expect(headPrecedesBody, "the header must precede the tab strip in DOM order").toBe(true);

      const layout = await dialog.evaluate((element) => {
        const card = element.getBoundingClientRect();
        const header = element.querySelector(".jini-tabbed-dialog-head")!.getBoundingClientRect();
        const tabs = element.querySelector(".jini-tabbed-dialog-sidebar")!.getBoundingClientRect();
        return {
          above: header.bottom <= tabs.top,
          inside: header.left >= card.left && header.right <= card.right && header.top >= card.top && header.bottom <= card.bottom,
        };
      });
      expect(layout).toEqual({ above: true, inside: true });

      // Card look: a real border and a non-transparent background, not the `--page-flow` variant's
      // `border: none; background: transparent`. Threshold-free by design — this only needs to
      // distinguish "no card" from "some card", not pin an exact color/width that a legitimate
      // future restyle would then have to update here too.
      const cardStyle = await dialog.evaluate((el) => {
        const computed = getComputedStyle(el);
        return { borderWidth: computed.borderTopWidth, background: computed.backgroundColor };
      });
      // The owner's later "take Settings out of the card" decision keeps the heading above the
      // strip, but explicitly removes the border/background (styles/settings.css).
      expect(cardStyle.borderWidth, "Settings must retain the owner's flat shell").toBe("0px");
      expect(
        cardStyle.background,
        "Settings must retain its transparent shell background"
      ).toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${section.path.replace(/\//g, "_")}.png`),
        fullPage: true,
      });
    });
  }

  test("Deployment's current header precedes its real tabs, and each tab opens its panel", async ({ page }) => {
    await page.goto("/admin/deployment", { waitUntil: "domcontentloaded" });
    const header = page.locator(".page-header");
    await expect(header.locator(".page-title")).toHaveText("Deployment");
    await expect(header.locator(".page-kicker")).toHaveText("Operations");
    const tabs = page.getByRole("tablist", { name: "Deployment", exact: true });
    await expect(tabs).toBeVisible();
    const headerBox = await header.boundingBox();
    const tabsBox = await tabs.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(tabsBox).not.toBeNull();
    expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(tabsBox!.y);
    for (const [label, id] of [["Static Site", "static-site"], ["Dockerfile", "dockerfile"], ["History", "history"], ["Overview", "overview"]]) {
      const tab = tabs.getByRole("tab", { name: label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await expect(page).toHaveURL(new RegExp(`tab=${id}`));
      await expect(page.locator(".deployment-tab")).toBeVisible();
      if (id === "static-site") await expect(page.getByRole("heading", { name: "What a static export gives you" })).toBeVisible();
      if (id === "dockerfile") await expect(page.locator(".deployment-dockerfile-editor")).toBeVisible();
      if (id === "history") await expect(page.getByRole("heading", { name: "No deploys yet" })).toBeVisible();
      if (id === "overview") await expect(page.getByRole("link", { name: "View Static Site details" })).toBeVisible();
    }
  });

  test("Payments' retired core route falls back to Dashboard without a placeholder card", async ({ page }) => {
    // No commerce in core: panels.tsx no longer registers Payments. A bare unmatched route uses
    // App.tsx's Dashboard fallback; it must not revive the removed Home/Stripe/PayPal shell.
    await page.goto("/admin/payments");
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
    await expect(page.locator(".jini-tabbed-dialog")).toHaveCount(0);
    await expect(page.locator("nav").first().getByRole("link", { name: "Payments", exact: true })).toHaveCount(0);
  });

  test("Authentication's external header precedes its tabs in page flow", async ({ page }) => {
    // Authentication.tsx records the owner's "take Authentication out of the UI card" request.
    // The visible heading belongs to the page now; the shell's duplicate stays hidden.
    await gotoSection(page, "/admin/authentication");
    const header = page.locator(".page-header");
    await expect(header.locator(".page-kicker")).toHaveText("People");
    await expect(header.getByRole("heading", { name: "Authentication", exact: true })).toBeVisible();
    await expect(header.locator(".page-description")).toHaveText("Review current sign-in support and future provider requirements.");
    const dialog = page.locator(".jini-tabbed-dialog");
    await expect(dialog.locator(".jini-tabbed-dialog-head")).toBeHidden();
    const tabs = dialog.locator(".jini-tabbed-dialog-sidebar");
    await expect(tabs).toBeVisible();
    expect(await header.evaluate((element) => Boolean(element.compareDocumentPosition(
      document.querySelector(".jini-tabbed-dialog-sidebar")!,
    ) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    const headerBox = await header.boundingBox();
    const tabsBox = await tabs.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(tabsBox).not.toBeNull();
    expect(headerBox!.y + headerBox!.height).toBeLessThanOrEqual(tabsBox!.y);
    expect(await dialog.evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("0px");
    await tabs.getByTestId("settings-dialog-nav-home").click();
    await expect(page.getByRole("region", { name: "Authentication overview", exact: true })).toBeVisible();
  });

  test("Payments' legacy URL reports an unknown section instead of the retired Home subtitle", async ({
    page,
  }) => {
    // Content-preservation check: the fix relocates the kicker/title/subtitle from the panel body
    // to the shell's own header fields, but must not change what they SAY. This is the one
    // assertion that would catch a fix that moved the header but silently reworded it.
    // The content-preservation requirement applied to the old placeholder only. With the owner
    // removing Payments from core, the legacy /section/:id route must name the missing section.
    await page.goto("/admin/section/payments");
    await expect(page.locator(".notice.error")).toHaveText("Unknown section: payments");
    await expect(page.getByText("Home is coming soon.", { exact: true })).toHaveCount(0);
  });

  test("Payments' retired provider deep links cannot resurrect core commerce tabs", async ({ page }) => {
    // The fix touches header wiring only; the tab strip itself (already correct pre-fix, per the
    // dispatch brief) must be untouched. Clicking Stripe and reading its own header back proves the
    // per-tab title/subtitle wiring generalizes beyond the first tab, not just "home" specifically.
    // That historical wiring is retired with Payments. Each old bookmark must follow the bare
    // route's Dashboard fallback rather than expose a built-in payment-provider configuration.
    for (const tab of ["home", "stripe", "paypal"]) {
      await page.goto(`/admin/payments?tab=${tab}`);
      await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
      await expect(page.locator(".jini-tabbed-dialog-sidebar")).toHaveCount(0);
      await expect(page.getByTestId(`settings-dialog-nav-${tab}`)).toHaveCount(0);
    }
  });
});
});

// Migrated from test-audit-browser.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: test-audit-browser", () => {
// Only the HTTP data boundary is faked; production components, CSS and native
// keyboard navigation run in Chromium. Run with playwright.test-audit-browser.config.ts.
test("package files wrap long lines and keep each gutter aligned with its source line", async ({ page }) => {
  const content = `first line\n${"x".repeat(400)}\nthird line`;
  await page.route(/\/api\/admin\/v1\/workspaces\/[^/]+\/agent-plugins$/, (route) => route.fulfill({
    json: { agentPlugins: [{ pluginId: "layout-fixture", version: "1.0.0", description: null, keywords: [], enabled: false, skills: [], mcpServerIds: [] }] },
  }));
  await page.route(/\/agent-plugins\/layout-fixture\/files$/, (route) => route.fulfill({
    json: { pluginId: "layout-fixture", truncated: false,
      limits: { maxFiles: 200, maxEntries: 1000, maxFileBytes: 100000, maxTotalBytes: 1000000 },
      files: ["SKILL.md", "plugin.json"].map((relativePath) => ({ relativePath, content, sizeBytes: content.length, omitted: null })),
    },
  }));
  await loginAsAdmin(page);
  await page.goto("/admin/agent-plugins");
  await page.getByRole("button", { name: /^Inspect package files/ }).click();
  const pane = page.locator(".agent-plugin-source-content");
  for (const file of ["SKILL.md", "plugin.json"]) {
    await page.getByRole("treeitem", { name: file, exact: true }).click();
    await expect(pane.getByRole("heading", { name: file, exact: true })).toBeVisible();
    // Constrain the real pane to guarantee the fixture wraps even on wide displays.
    await pane.evaluate((element) => { (element as HTMLElement).style.width = "240px"; });
    const viewer = pane.locator(".code-viewer--wrap");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator(".line-number")).toHaveText(["1", "2", "3"]);
    const layout = await viewer.evaluate((element) => {
      const lines = [...element.querySelectorAll<HTMLElement>(".line-content")];
      const numbers = [...element.querySelectorAll<HTMLElement>(".line-number")];
      return { overflow: element.scrollWidth - element.clientWidth,
        heights: lines.map((line) => line.getBoundingClientRect().height),
        offsets: lines.map((line, index) => line.getBoundingClientRect().top - numbers[index]!.getBoundingClientRect().top),
      };
    });
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.heights).toHaveLength(3);
    expect(layout.heights[1]!).toBeGreaterThan(layout.heights[0]! * 2);
    for (const offset of layout.offsets) expect(Math.abs(offset)).toBeLessThanOrEqual(1);
  }
});

test("MCP Remove and Tools dialogs contain native Tab navigation and Escape deletes nothing", async ({ page }) => {
  let deletions = 0;
  const server = { serverId: "focus-fixture", label: "Focus fixture", transport: "stdio", authMode: "none", enabled: true,
    command: "fixture", url: null, args: [], allowedToolNames: [], writeAllowedToolNames: [],
    writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: [],
    oauth: { providerId: null, grant: null, clientId: null, scopes: [], status: "disconnected", expiresAt: null, tokenEnvName: null, hasStoredToken: false },
  };
  await page.route(/\/api\/admin\/v1\/workspaces\/[^/]+\/mcp-servers$/, (route) => route.fulfill({ json: { servers: [server] } }));
  await page.route(/\/mcp-servers\/focus-fixture$/, (route) => {
    if (route.request().method() === "DELETE") deletions += 1;
    return route.fulfill({ json: { ok: true } });
  });
  await page.route(/\/mcp-servers\/focus-fixture\/probe$/, (route) => route.fulfill({
    json: { tools: [], probedAt: "2026-10-01T00:00:00.000Z" },
  }));
  await loginAsAdmin(page);
  await page.goto("/admin/providers?tab=external-mcp");
  const card = page.getByTestId("source-config-item-card");
  await expect(card).toHaveCount(1);
  for (const modal of ["Remove", "Tools"]) {
    if (modal === "Remove") await card.getByRole("button", { name: "Remove", exact: true }).click();
    else await page.getByRole("button", { name: /Open tool permissions for Focus fixture/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    if (modal === "Tools") {
      await expect(dialog.getByText("This server advertises no tools.", { exact: true })).toBeVisible();
      await expect(dialog.locator(".external-mcp-tool-actions button").first()).toBeEnabled();
    }
    const controls = dialog.locator("button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex='0']");
    expect(await controls.count()).toBeGreaterThanOrEqual(2);
    await controls.last().focus();
    await page.keyboard.press("Tab");
    await expect(controls.first()).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(controls.nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(card).toHaveCount(1);
    expect(deletions).toBe(0);
  }
});
});
