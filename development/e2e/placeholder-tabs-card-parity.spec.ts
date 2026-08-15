import path from "node:path";
import { test, expect, type Page } from "@playwright/test";

/** Absolute so the screenshot destination doesn't depend on whatever directory Playwright happens
 *  to be invoked from — a relative path here resolves against `process.cwd()`, not `testDir`. */
const SCREENSHOT_DIR = path.resolve(__dirname, "../../ADS-memory/reports/placeholder-tabs-card-parity");

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
 *  known-good reference this suite pins parity against. */
const SECTIONS = [
  { path: "/admin/settings", kicker: "Settings", title: "Execution mode", isReference: true },
  { path: "/admin/payments", kicker: "People", title: "Home" },
  { path: "/admin/deployment", kicker: "Operations", title: "Home" },
  { path: "/admin/authentication", kicker: "People", title: "Home" },
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
    test(`${section.path}: header sits above the tab strip, inside a bordered card`, async ({ page }) => {
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

      // Card look: a real border and a non-transparent background, not the `--page-flow` variant's
      // `border: none; background: transparent`. Threshold-free by design — this only needs to
      // distinguish "no card" from "some card", not pin an exact color/width that a legitimate
      // future restyle would then have to update here too.
      const cardStyle = await dialog.evaluate((el) => {
        const computed = getComputedStyle(el);
        return { borderWidth: computed.borderTopWidth, background: computed.backgroundColor };
      });
      expect(cardStyle.borderWidth, "card must have a real border, not `border: none`").not.toBe("0px");
      expect(
        cardStyle.background,
        "card must have a real background, not `background: transparent`"
      ).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${section.path.replace(/\//g, "_")}.png`),
        fullPage: true,
      });
    });
  }

  test("Payments' Home subtitle reads 'Home is coming soon.', unchanged from the old ComingSoonNotice copy", async ({
    page,
  }) => {
    // Content-preservation check: the fix relocates the kicker/title/subtitle from the panel body
    // to the shell's own header fields, but must not change what they SAY. This is the one
    // assertion that would catch a fix that moved the header but silently reworded it.
    await gotoSection(page, "/admin/payments");
    await expect(page.locator(".jini-tabbed-dialog-subtitle")).toHaveText("Home is coming soon.");
  });

  test("Payments' tab strip still lists Home, Stripe, PayPal, each clickable", async ({ page }) => {
    // The fix touches header wiring only; the tab strip itself (already correct pre-fix, per the
    // dispatch brief) must be untouched. Clicking Stripe and reading its own header back proves the
    // per-tab title/subtitle wiring generalizes beyond the first tab, not just "home" specifically.
    await gotoSection(page, "/admin/payments");
    const nav = page.locator(".jini-tabbed-dialog-sidebar");
    await expect(nav.getByTestId("settings-dialog-nav-home")).toBeVisible();
    await expect(nav.getByTestId("settings-dialog-nav-stripe")).toBeVisible();
    await expect(nav.getByTestId("settings-dialog-nav-paypal")).toBeVisible();

    await nav.getByTestId("settings-dialog-nav-stripe").click();
    await expect(page.locator(".jini-tabbed-dialog-head h2")).toHaveText("Stripe");
    await expect(page.locator(".jini-tabbed-dialog-subtitle")).toHaveText("Stripe is coming soon.");
  });
});
