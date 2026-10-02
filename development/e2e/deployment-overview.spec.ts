import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

const WARNING = "Still the default — set TOVU_ADMIN_PASSWORD";
const EPS = 1; // Allow subpixel rounding when comparing containment edges.
const snapshot = {
  mode: "local",
  productionReadinessGate: { applicable: false, passed: false },
  defaultOwnerPasswordUnsafe: true,
  daemonKnownFailed: false,
  dbPath: "/tmp/tovu-deployment-overview/content.db",
  uploadsDir: "/tmp/tovu-deployment-overview/uploads",
  envVars: [{ name: "TOVU_ADMIN_PASSWORD", set: true }],
};

// jsdom cannot observe this overflow. Mock only the diagnostic response so the real
// Overview component and stylesheet always render the long default-password warning.
test("Overview fact badges fit their cells and keep the full password warning visible", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("tovu-admin-sidebar-rail-collapsed", "false");
  });
  await page.route("**/api/admin/v1/workspaces/*/system/deployment-overview", async (route) => {
    await route.fulfill({ json: snapshot });
  });
  await loginAsAdmin(page);
  await page.goto("/admin/deployment?tab=overview", { waitUntil: "domcontentloaded" });

  const card = page.locator(".card").filter({
    has: page.getByRole("heading", { name: "How this instance is running", exact: true }),
  });
  const badges = card.locator(".deployment-fact .status");
  const warning = badges.filter({ hasText: WARNING });
  await expect(badges).toHaveCount(4);
  await expect(warning).toHaveText(WARNING);
  await page.evaluate(() => document.fonts.ready);

  // One login avoids the real login rate limiter; resizing retains the same rendered facts.
  for (const width of [390, 1024, 1440, 1600]) {
    await test.step(`${width}px`, async () => {
      await page.setViewportSize({ width, height: 900 });
      await warning.scrollIntoViewIfNeeded();
      await expect(warning).toBeVisible();

      const boxes = await badges.evaluateAll((elements) => elements.map((badge) => {
        const cell = badge.parentElement;
        if (!cell?.matches(".deployment-fact-value")) throw new Error("Missing fact value cell");
        const rect = badge.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        return {
          text: badge.textContent?.trim(),
          badge: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          cell: { left: cellRect.left, top: cellRect.top, right: cellRect.right, bottom: cellRect.bottom },
        };
      }));
      for (const { text, badge, cell } of boxes) {
        expect(badge.left, `${text}: left edge`).toBeGreaterThanOrEqual(cell.left - EPS);
        expect(badge.top, `${text}: top edge`).toBeGreaterThanOrEqual(cell.top - EPS);
        expect(badge.right, `${text}: right edge`).toBeLessThanOrEqual(cell.right + EPS);
        expect(badge.bottom, `${text}: bottom edge`).toBeLessThanOrEqual(cell.bottom + EPS);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i].badge;
          const b = boxes[j].badge;
          const intersects = Math.min(a.right, b.right) > Math.max(a.left, b.left)
            && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
          expect(intersects, `${boxes[i].text} overlaps ${boxes[j].text}`).toBe(false);
        }
      }

      // DOM visibility alone permits clipped text. Check every rendered text fragment
      // against the badge, content scroller, and viewport after scrolling it into view.
      const textGeometry = await warning.evaluate((badge) => {
        const rect = badge.getBoundingClientRect();
        const content = badge.closest(".admin-content");
        if (!content) throw new Error("Missing admin content scroller");
        const contentRect = content.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(badge);
        return {
          fragments: Array.from(range.getClientRects(), (fragment) => ({
            left: fragment.left, top: fragment.top, right: fragment.right, bottom: fragment.bottom,
          })),
          visible: {
            left: Math.max(0, rect.left, contentRect.left),
            top: Math.max(0, rect.top, contentRect.top),
            right: Math.min(innerWidth, rect.right, contentRect.right),
            bottom: Math.min(innerHeight, rect.bottom, contentRect.bottom),
          },
          overflowX: badge.scrollWidth - badge.clientWidth,
          overflowY: badge.scrollHeight - badge.clientHeight,
        };
      });
      expect(textGeometry.fragments.length).toBeGreaterThan(0);
      expect(textGeometry.overflowX).toBeLessThanOrEqual(EPS);
      expect(textGeometry.overflowY).toBeLessThanOrEqual(EPS);
      for (const fragment of textGeometry.fragments) {
        expect(fragment.left).toBeGreaterThanOrEqual(textGeometry.visible.left - EPS);
        expect(fragment.top).toBeGreaterThanOrEqual(textGeometry.visible.top - EPS);
        expect(fragment.right).toBeLessThanOrEqual(textGeometry.visible.right + EPS);
        expect(fragment.bottom).toBeLessThanOrEqual(textGeometry.visible.bottom + EPS);
      }
    });
  }
});
