import assert from "node:assert/strict";
import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Composer discovery/slash-menu popover overlap + dismissal, browser-verified 2026-08-21.
 *
 * Owner-reported bugs (screenshots): the "+" Add Context popover and the "/"-triggered slash
 * palette rendered in the wrong place — not as a compact card floating above the input, but
 * overlapping/covering the textarea itself and taking over the dock — with no way to dismiss
 * either one short of reloading.
 *
 * Root cause (`@jini-ai/chat`'s `packages/chat/src/react/features/chat-pane/styles.ts`): both
 * popovers anchored their `position: absolute; bottom: ...` off a small element sitting at the
 * BOTTOM of `.jini-composer` — the discovery popover off its own trigger-button wrapper
 * (`.jini-composer-discovery`, itself inside the footer), the slash popover off a flat `bottom:
 * 48px` measured from the composer's own bottom edge. Either anchor point sits right around the
 * textarea/footer seam, so a popover taller than a couple of rows grows upward straight over the
 * textarea — reproduced live via Playwright's own click failing with "intercepts pointer events"
 * on the textarea while the popover was open (same failure shape as
 * `admin-fab-position.spec.ts`'s Bug 5). Fixed by anchoring both off `.jini-composer` itself
 * (`bottom: calc(100% + 6px)`), which renders them fully above the textarea AND the footer, plus a
 * document-level outside-click handler (`Composer.tsx`) neither popover had before.
 *
 * This spec proves the fix geometrically (bounding-box non-overlap) and behaviorally (a real click
 * into the textarea succeeds and dismisses the popover) — the two things unit tests running under
 * jsdom cannot check, since jsdom performs no real CSS layout. The keyboard/ARIA/filtering side of
 * this same bug fix (Escape, `aria-describedby`, hover-title descriptions, typeahead narrowing) is
 * covered instead by `Composer.test.tsx` in the Jini repo, where jsdom + Testing Library is the
 * right tool.
 *
 * No `waitForLoadState("networkidle")` — same rationale as `admin-fab-position.spec.ts`: it never
 * resolves against this admin app's dev tooling.
 */

const TEXTAREA_SELECTOR = "textarea.jini-composer-input";

test.describe("admin composer discovery popovers float above the input, not over it", () => {
  test("the + Add Context popover does not overlap the textarea, and a real click into the textarea reaches it and dismisses the popover", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");

    await page.locator('button[aria-label="Add context"]').click();
    const menu = page.locator(".jini-composer-discovery-menu");
    await expect(menu).toBeVisible();

    const textarea = page.locator(TEXTAREA_SELECTOR);
    const menuBox = await menu.boundingBox();
    const textareaBox = await textarea.boundingBox();
    assert(menuBox, "discovery popover bounding box must be measurable");
    assert(textareaBox, "textarea bounding box must be measurable");

    // --- Check 1: no rectangle overlap between the popover and the textarea. ---
    const noOverlap =
      menuBox.x + menuBox.width <= textareaBox.x ||
      textareaBox.x + textareaBox.width <= menuBox.x ||
      menuBox.y + menuBox.height <= textareaBox.y ||
      textareaBox.y + textareaBox.height <= menuBox.y;
    expect(
      noOverlap,
      `discovery popover box ${JSON.stringify(menuBox)} must not overlap textarea box ${JSON.stringify(textareaBox)}`
    ).toBe(true);

    // --- Check 2: a real click reaches the textarea (this is the bug's own original failure
    // signature — Playwright's `.click()` fails outright with "intercepts pointer events" if
    // something still covers the target, so no manual try/catch is needed here). ---
    await textarea.click({ timeout: 8_000 });
    await textarea.type("regression check for the discovery popover overlap");

    // --- Check 3 (dismissal): that same click, being outside the popover's own wrapper, must have
    // closed it — this popover previously had no click-outside affordance at all. ---
    await expect(menu).not.toBeVisible();
  });

  test("the slash-command palette does not overlap the textarea and Escape dismisses it", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");

    const textarea = page.locator(TEXTAREA_SELECTOR);
    await textarea.click();
    await textarea.pressSequentially("/");

    const palette = page.locator("#jini-composer-slash-menu");
    await expect(palette).toBeVisible();

    const paletteBox = await palette.boundingBox();
    const textareaBox = await textarea.boundingBox();
    assert(paletteBox, "slash palette bounding box must be measurable");
    assert(textareaBox, "textarea bounding box must be measurable");

    const noOverlap =
      paletteBox.x + paletteBox.width <= textareaBox.x ||
      textareaBox.x + textareaBox.width <= paletteBox.x ||
      paletteBox.y + paletteBox.height <= textareaBox.y ||
      textareaBox.y + textareaBox.height <= paletteBox.y;
    expect(
      noOverlap,
      `slash palette box ${JSON.stringify(paletteBox)} must not overlap textarea box ${JSON.stringify(textareaBox)}`
    ).toBe(true);

    await page.keyboard.press("Escape");
    await expect(palette).not.toBeVisible();
  });
});
