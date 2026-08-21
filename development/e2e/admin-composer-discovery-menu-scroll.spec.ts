import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Composer discovery/slash-menu phantom-scroll regression, browser-verified 2026-08-21.
 *
 * Owner-reported bug (screenshot): a popover near/over its own 280px cap, scrolled to the end,
 * showed the last few real rows followed by a large block of empty white space filling the rest of
 * the box — as if the menu had a fixed/minimum height instead of sizing to its content. Reproduced
 * live against the exact three trailing tool-catalog rows from the owner's screenshot
 * (`forms_create_definition`, `forms_update_definition`, `taxonomy_assign_terms`) before this fix
 * landed; screenshots retained outside this repo (session scratchpad, not committed).
 *
 * Root cause (`@jini-ai/chat`'s `packages/chat/src/react/features/chat-pane/styles.ts`):
 * `.jini-composer-discovery-description` (the per-row hover tooltip added in Jini commit
 * `12f35dff`) is `position: absolute; top: 100%` on a row that is `position: relative`
 * (`.jini-composer-discovery-item`). At rest it was hidden only by `opacity: 0` — the box kept its
 * FULL natural size (routinely 50-260px tall for a real description), just invisible. An
 * absolutely-positioned descendant still counts toward its scrolling ancestor's scrollable overflow
 * region even while invisible, so every row silently taxed the popover with its own tooltip-height
 * of scrollable NOTHING below it (measured live: `scrollHeight` 501px against a 242px
 * `clientHeight` for one 6-row list) — scrolling to the end of an overflowing list landed on that
 * phantom space instead of the last real row. Fixed by collapsing the tooltip itself at rest
 * (`max-height: 0; overflow: hidden;` plus zeroed padding/border, restored only on
 * `:hover`/`:focus-visible`) rather than only hiding it visually — the node stays in the DOM with
 * real text at all times, so `aria-describedby` is unaffected either way.
 *
 * This spec proves the fix geometrically, using ONLY today's product-decided bundled catalog (no
 * re-wiring of the unwired tool-catalog source needed): the "+" Add Context menu's six bundled
 * groups (Files, Plugins, Agent Plugins, Skills, MCP, Tools) already need more than 280px of real
 * vertical space, so the popover already hits its `max-height` cap and scrolls on every run — the
 * exact overflow condition the bug lived in. jsdom cannot check this: it performs no real CSS
 * layout, so `scrollHeight`/`getBoundingClientRect` are meaningless there. The keyboard/ARIA side of
 * this same row (`aria-describedby` resolving regardless of hover state) is unaffected by this fix
 * and stays covered by `Composer.test.tsx` in the Jini repo.
 *
 * No `waitForLoadState("networkidle")` — same rationale as the sibling
 * `admin-composer-discovery-menu-overlap.spec.ts`: it never resolves against this admin app's dev
 * tooling.
 */

test.describe("admin composer discovery popover has no phantom scroll space from hidden hover-tooltip descriptions", () => {
  test("scrolling the + Add Context popover to its end reveals the last real row flush with the box's own bottom edge, not a blank block", async ({ page }) => {
    await loginAsAdmin(page);

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");

    await page.locator('button[aria-label="Add context"]').click();
    const menu = page.locator(".jini-composer-discovery-menu");
    await expect(menu).toBeVisible();

    const result = await menu.evaluate((el) => {
      const overflows = el.scrollHeight > el.clientHeight;
      el.scrollTop = el.scrollHeight; // scroll all the way to the end
      const rows = Array.from(el.querySelectorAll(".jini-composer-discovery-item"));
      const lastRow = rows[rows.length - 1] as HTMLElement | undefined;
      if (!lastRow) return { overflows, rowCount: 0, gapBelowLastRow: null };
      const menuBottom = el.getBoundingClientRect().bottom;
      const lastRowBottom = lastRow.getBoundingClientRect().bottom;
      return { overflows, rowCount: rows.length, gapBelowLastRow: menuBottom - lastRowBottom };
    });

    // Sanity check on the test's own premise: if today's bundled catalog ever shrinks below 280px
    // of real content, this spec would pass trivially (no scrolling occurs) without exercising the
    // bug's own overflow condition at all. Failing loudly here means a shrunk catalog needs a
    // different fixture, not a silently-weakened assertion below.
    expect(result.rowCount, "expected at least one discovery row").toBeGreaterThan(0);
    expect(
      result.overflows,
      "the bundled discovery catalog no longer exceeds the popover's 280px cap — this spec's premise (a real, overflowing list) no longer holds; see this file's own header",
    ).toBe(true);

    // The load-bearing assertion. Before the fix this gap was well over 100px of pure phantom
    // scroll space (an invisible hover-tooltip's own full natural height, stacked per row) — the
    // owner's exact "blank block" screenshot. A few pixels of padding/subpixel rounding around the
    // last row is fine; anything approaching even one row's own height is the bug back.
    expect(result.gapBelowLastRow).not.toBeNull();
    expect(result.gapBelowLastRow as number).toBeLessThan(20);
  });
});
