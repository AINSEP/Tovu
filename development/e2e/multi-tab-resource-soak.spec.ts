import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

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
async function holdExtraConnections(page: Page, count: number): Promise<void> {
  await page.evaluate(
    ({ url, holdCount }) => {
      const win = window as unknown as { __soakSockets?: EventSource[] };
      win.__soakSockets = Array.from({ length: holdCount }, () => new EventSource(url, { withCredentials: true }));
    },
    { url: SETTINGS_EVENTS_URL, holdCount: count }
  );
  // Lets the extra connection attempts actually reach the browser's socket queue before the real
  // navigation below fires — without this, both could be issued in the same tick and race.
  await page.waitForTimeout(2_000);
}

test.describe("admin app survives an exhausted per-origin connection pool, across multiple screens", () => {
  for (const screen of SCREENS) {
    test(`${screen.navLabel} fails visibly instead of hanging forever when no socket is free`, async ({ page }) => {
      await loginAsAdmin(page);
      await holdExtraConnections(page, EXTRA_HELD_CONNECTIONS);

      const navLink = page.locator("nav").first().getByRole("link", { name: screen.navLabel, exact: true });
      await navLink.click();

      const errorNotice = page.locator(".notice.error");
      await expect(errorNotice).toBeVisible({ timeout: 75_000 });
      await expect(errorNotice).toContainText(/did not respond|timed out/i);

      // The loading copy must have been replaced, not merely coexisting with an unrelated error.
      await expect(page.getByText(/Loading (posts|forms)…/i)).toHaveCount(0);
    });
  }
});
