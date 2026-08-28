import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Real-browser regression cover for the Themes screen's "Loading themes…" forever-hang
 * (found live 2026-08-17: `apps/admin/src/features/themes/hooks/use-themes.hooks.ts`'s mount effect
 * calling `port.getPresentation()`, which hit `GET /api/admin/v1/workspaces/:id/presentation`).
 *
 * ## Root cause (not a backend bug)
 *
 * The hang is not in `src/server/inbound/admin-http/routes/presentation/get.ts`, `dev-auth.ts`, or any repo
 * (all confirmed synchronous-under-`better-sqlite3`, single shared connection, no lock/pool to
 * exhaust — see the investigation note this fix's handoff links). It is a browser-level resource
 * exhaustion: `apps/admin/src/lib/settings-events.ts`'s `subscribeToSettingsChanges`, mounted once
 * per open admin tab by `App.hooks.tsx`, opens an `EventSource` to `.../settings/events` that is
 * "deliberately not closed" (that file's own comment) for the tab's entire lifetime. Vite's dev
 * server (and this repo's production server) speak plain HTTP/1.1, and Chrome caps concurrent
 * connections to one origin at 6. Enough long-lived tabs/streams against the same origin — verified
 * live via Playwright by opening several admin tabs against `:5173` until a brand-new tab's own
 * `domcontentloaded` never fired even after 60s — permanently claims every socket, so any OTHER
 * request to that origin (this screen's `getPresentation()` call among them) has no free connection
 * and queues in the browser forever: the server never receives it (idle CPU, matching what was
 * observed live), and nothing ever rejects it (no error, matching what was observed live).
 *
 * ## What this test reproduces, and why not literally 6 real tabs
 *
 * Six real tabs each loading the full admin SPA is slow and adds noise unrelated to the mechanism
 * itself (bundle parse time, React mount time, per-tab login race). The actual mechanism is just
 * "N long-lived connections already held against this origin" — reproduced directly and
 * deterministically by opening six extra raw `EventSource` connections to the very same
 * `/settings/events` endpoint from inside the one already-logged-in tab (which already holds a
 * seventh, the tab's own real one from `App.hooks.tsx`), then triggering the real Themes navigation
 * and observing what the real app does. This is the same origin, the same endpoint, the same
 * "never closes" connection shape as the real bug — not a mock of the mechanism, a smaller-footprint
 * instance of it.
 *
 * ## The fix (what turns this from a hang into a visible failure)
 *
 * `apps/admin/src/lib/api.ts`'s `fetchOrThrowUnreachable` — the one fetch seam every `api.*` call
 * goes through — now races every request against `AbortSignal.timeout(DEFAULT_REQUEST_TIMEOUT_MS)`
 * when the caller supplies no signal of its own, and turns a fired timeout into a normal `ApiError`
 * (`code: "REQUEST_TIMEOUT"`) rather than letting a raw `TimeoutError` escape. `useThemes`'s existing
 * `.catch((e) => setError(...))` already turns any rejection into the `error` state, and `Themes.tsx`
 * already prefers `error` over the loading copy once `settings` is still `null` (`if (!settings) return
 * error ? <error notice> : <loading notice>`) — both pre-existing, unchanged by this fix. The only
 * change is that the promise now actually settles.
 *
 * ## Why this waits out the real timeout instead of mocking `page.route`
 *
 * `admin-session-expiry-kickback.spec.ts` mocks one response because the thing under test is what the
 * app does with a response it already received. Here the thing under test is exactly the opposite:
 * what the app does with a request that receives NO response at all within its socket's queue — which
 * `page.route` cannot simulate (a fulfilled/aborted route still resolves the request; the real bug is
 * the browser never dispatching it in the first place). A real, bounded wait is therefore the actual
 * regression signal, not a shortcut being avoided — see `playwright.themes-presentation-timeout
 * .config.ts`'s own header for the resulting `timeout: 60_000`.
 *
 * Before this fix: `.notice.error` never appears (the fetch never settles), so the
 * `toBeVisible({ timeout: 75_000 })` assertion below times out and the test fails with a clear
 * Playwright timeout error — confirmed live against the pre-fix code.
 */

const WORKSPACE_ID = "workspace-local";
const SETTINGS_EVENTS_URL = `/api/admin/v1/workspaces/${WORKSPACE_ID}/settings/events`;
/** Extra long-lived connections opened on top of the tab's own real one (`App.hooks.tsx`), enough to
 *  push the origin's total held connections past Chrome's 6-per-origin HTTP/1.1 cap regardless of
 *  exact browser accounting. */
const EXTRA_HELD_CONNECTIONS = 6;

test.describe("Themes screen survives an exhausted per-origin connection pool", () => {
  test("getPresentation() fails visibly instead of hanging forever when no socket is free", async ({ page }) => {
    await loginAsAdmin(page);

    // Claim extra sockets against this same origin the same way the real bug's tabs did: long-lived
    // EventSource connections that never close. Fired from inside the page, not `page.route`, so the
    // browser's own real per-origin connection accounting is what gets exercised.
    await page.evaluate(
      ({ url, count }) => {
        const win = window as unknown as { __regressionSockets?: EventSource[] };
        win.__regressionSockets = Array.from(
          { length: count },
          () => new EventSource(url, { withCredentials: true })
        );
      },
      { url: SETTINGS_EVENTS_URL, count: EXTRA_HELD_CONNECTIONS }
    );
    // Lets the six connection attempts actually reach the browser's socket queue before the real
    // navigation below fires — without this, both could be issued in the same tick and race.
    await page.waitForTimeout(2_000);

    const themesNavLink = page.locator("nav").first().getByRole("link", { name: "Themes", exact: true });
    await themesNavLink.click();

    const errorNotice = page.locator(".notice.error");
    await expect(errorNotice).toBeVisible({ timeout: 75_000 });
    await expect(errorNotice).toContainText(/did not respond|timed out/i);

    // The loading copy must have been replaced, not merely coexisting with an unrelated error.
    await expect(page.getByText("Loading themes…")).toHaveCount(0);
  });
});
