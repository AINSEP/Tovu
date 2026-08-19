import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

/**
 * @file Real-browser (renderer #2) cover for the session-expiry kickback fix (2026-08-17). The
 * companion unit test, `apps/admin/src/__tests__/unit/app-session-unauthenticated-kickback.unit
 * .test.tsx`, proves the same mechanism against jsdom + a mocked `fetch`; this suite proves it
 * against a real Chromium session, a real Vite dev server, and a real Tovu API (`page.route()`
 * forces the one response that needs to be an expired session, everything else is genuine).
 *
 * ## The bug and the fix (already committed — this file only proves it)
 *
 * `useAdminSession` (`App.hooks.tsx`) used to check auth ONCE, at boot. A session that went invalid
 * mid-tab left `user` stuck non-null forever, so `App.tsx`'s `if (!user) return <Login .../>` gate
 * never re-fired — every other screen's own `request()` call just 401ed silently instead, forever.
 * The fix: `lib/api.ts`'s `request()` notifies a shared `onUnauthenticated` listener set on any real
 * 401 (never 403 — that means authenticated-but-forbidden, a per-action condition that must not kick
 * the operator out), and `useAdminSession` subscribes to clear `user` on notification.
 *
 * ## Why a sidebar click, not `page.goto`
 *
 * Every other spec in this directory that needs the Posts screen reaches it with a plain
 * `page.goto("/admin/posts")` — fine for them, since they don't care how they got there. This suite
 * does: `page.goto` is a real browser navigation, which would trigger `App`'s OWN boot-time
 * `api.me()` check and reach the login screen for a completely different reason (a fresh mount
 * finding no valid session) than the one this fix adds (a live tab's session going stale mid-use).
 * Clicking the sidebar's real `<a href="/admin/posts">` instead goes through
 * `installInternalLinkInterceptor` (`@jini-ai/admin/browser`), which calls `preventDefault()` and
 * pushes history state — no navigation, no reload, no remount. The first test below also tracks
 * `page.on("load")` directly as a second, independent confirmation that no full navigation occurred.
 *
 * ## Why intercept `listPosts`'s response rather than actually expiring the session
 *
 * Arranging a real server-side expiry (waiting out a TTL, or a second process revoking the session)
 * is slow and flaky to set up for a single test. `page.route()` forcing one specific, already-
 * in-flight request to 401 is deterministic and exercises the exact code path a real expiry would:
 * `request()` in `lib/api.ts` sees a real HTTP 401 and does not care why the server sent it.
 */

const POSTS_ENDPOINT_GLOB = "**/api/admin/v1/workspaces/workspace-local/posts";

/** The sidebar's "Posts" row (`panels.tsx`'s `label: "Posts"`) — a real `<a>` inside the `<nav
 *  aria-label="Admin">` landmark (`@jini-ai/admin/react`'s `Sidebar`), same `page.locator("nav")`
 *  scoping `admin-locale-after-login.spec.ts` already uses for this sidebar. */
function postsNavLink(page: Page) {
  return page.locator("nav").first().getByRole("link", { name: "Posts", exact: true });
}

test.describe("admin session-expiry login kickback", () => {
  test("a 401 from a screen's own API call re-shows the login screen without a full page reload", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    // Counted from here, not from the start of the test — the initial login IS a real navigation,
    // and that is expected. Nothing after this point should cause another one.
    let loadEvents = 0;
    page.on("load", () => {
      loadEvents += 1;
    });

    await page.route(POSTS_ENDPOINT_GLOB, (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "unauthenticated", code: "UNAUTHENTICATED" }),
      })
    );

    await postsNavLink(page).click();

    await expect(page.locator(".login-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".admin-layout")).toHaveCount(0);
    expect(loadEvents, "the kickback must be client-side state, not a page reload/navigation").toBe(0);
  });

  test("a 403 (authenticated but forbidden) does NOT re-show the login screen", async ({ page }) => {
    await loginAsAdmin(page);

    await page.route(POSTS_ENDPOINT_GLOB, (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "forbidden", code: "FORBIDDEN" }),
      })
    );

    // Asserts the actual status too, not just that a matching response arrived — a matching-URL-only
    // predicate would keep passing for the wrong reason if the route/glob ever drifted apart, since
    // nothing would force the real request to actually receive a 403.
    const response = page.waitForResponse(
      (res) => res.url().includes("/workspaces/workspace-local/posts") && res.request().method() === "GET" && res.status() === 403
    );
    await postsNavLink(page).click();
    await response;

    // No `waitFor`/`toBeVisible` race here on purpose — asserting a NEGATIVE (nothing changed) needs
    // a settled read after the intercepted response has landed, not a race against whatever the
    // kickback would have done if it (wrongly) fired on 403. Same reasoning the companion unit
    // test's 403 case documents.
    await page.waitForTimeout(500);
    await expect(page.locator(".admin-layout")).toBeVisible();
    await expect(page.locator(".login-card")).toHaveCount(0);
  });
});
