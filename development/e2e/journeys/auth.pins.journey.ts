// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { type Page } from "../support/bug-pin-fixtures.js";
import { loginAsAdmin } from "../support/bug-pin-auth.js";
import { attemptLoginAsAdmin } from "../support/bug-pin-auth.js";
import { DEFAULT_ADMIN_PASSWORD } from "../support/bug-pin-auth.js";
import { DEFAULT_ADMIN_USERNAME } from "../support/bug-pin-auth.js";
import { logoutAsAdmin } from "../support/bug-pin-auth.js";

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

// Migrated from admin-locale-after-login.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-locale-after-login", () => {
/**
 * @file Regression cover for "I changed the admin language and nothing happened" — reported
 * 2026-08-09 after asking the admin assistant to "change the language to portuguese", traced to a
 * read-side race that had nothing to do with the assistant.
 *
 * ## The bug
 *
 * `App.tsx` calls `useAdminLocale()` unconditionally, but only returns `<Login>` further down, so
 * the hook mounts while the login screen is still showing. Its one-shot fetch of
 * `core.language.locale` therefore resolves against a `401` (no session yet), and the hook
 * swallows a failed fetch to `DEFAULT_LOCALE` by design — a screen mounted without a stubbed
 * settings endpoint should degrade to English, not break. The effect's dependency list is empty,
 * and nothing in it changes at login, so it never retried: the sidebar stayed English for the rest
 * of the session no matter what the ledger said.
 *
 * That made a stored preference look like it had been ignored, which is what the assistant report
 * actually was. The assistant's own write was never the problem — `settings_set_ui_preference`
 * lands on the same `core.language.locale` row this test writes, so §1 covers that path's
 * UI-reflection half without needing a live LLM in the loop.
 *
 * ## Why a fresh browser context is load-bearing in §1
 *
 * The race only exists on the interactive-login path. A reload that already carries a
 * `tovu_session` cookie authenticates the mount-time fetch, so it returns the stored locale and
 * the bug is invisible — which is exactly why this survived manual testing. §1 must therefore
 * arrive with no cookie and go through the real form.
 *
 * §2 covers the other half (a write that lands mid-session, from another process — the shape an
 * agent-daemon write actually has) so a future fix to §1 cannot be made by breaking the change
 * feed that §2 depends on.
 */

const WORKSPACE_ID = "workspace-local";
const SETTINGS_VALUE_URL = `/api/admin/v1/workspaces/${WORKSPACE_ID}/settings/value`;

/** `Overview`'s pt-BR nav translation (`apps/admin/src/lib/admin-nav-i18n.ts`). Asserting a
 *  rendered STRING rather than the fetched setting is the point: the ledger already held the right
 *  value while the UI showed English. */
const PT_BR_OVERVIEW = "Visão geral";
const EN_OVERVIEW = "Overview";

/** Writes `core.language.locale` through the same authorized route the admin UI itself uses.
 *  `credentials: "same-origin"` picks up the real session cookie — not a backdoor. */
async function setLocale(page: Page, locale: string): Promise<void> {
  const status = await page.evaluate(
    async ({ url, locale }) => {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ namespace: "core.language", key: "locale", scope: "user", valueJson: locale }),
      });
      return res.status;
    },
    { url: SETTINGS_VALUE_URL, locale },
  );
  expect(status, `expected the settings write for '${locale}' to be accepted`).toBe(200);
}

/** The sidebar's first nav item, which is `Overview` in English and {@link PT_BR_OVERVIEW} in
 *  pt-BR. Scoped to `nav` so a page heading with the same text cannot satisfy it by accident. */
function overviewNavItem(page: Page) {
  return page.locator("nav").first().getByText(new RegExp(`^(${PT_BR_OVERVIEW}|${EN_OVERVIEW})$`));
}

test.describe("admin locale survives an interactive login", () => {
  test.afterEach(async ({ page }) => {
    await setLocale(page, "en");
  });
  test("a stored non-English locale renders in the sidebar on a fresh form login", async ({ page, browser, baseURL }) => {
    // Arrange: store pt-BR as this operator's preference, in a session that is then discarded.
    await loginAsAdmin(page);
    await setLocale(page, "pt-BR");

    // Act: a genuinely fresh context — no `tovu_session` cookie — logging in through the real form.
    // This is the arrangement the bug needs; a reload with a cookie would pass either way.
    // browser.newContext does not inherit the test's baseURL or storageState.
    const freshContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const freshPage = await freshContext.newPage();
      await loginAsAdmin(freshPage);

      // Assert: the sidebar reflects the stored preference, without a reload.
      await expect(overviewNavItem(freshPage)).toHaveText(PT_BR_OVERVIEW, { timeout: 15_000 });

    } finally { await freshContext.close(); }
  });

  test("a locale written mid-session by another process reaches an open tab", async ({ page, browser, baseURL }) => {
    // Baseline the ledger to English and open a tab that has already rendered.
    await loginAsAdmin(page);
    await setLocale(page, "en");

    const viewerContext = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    try {
      const viewerPage = await viewerContext.newPage();
      await loginAsAdmin(viewerPage);
      await expect(overviewNavItem(viewerPage)).toHaveText(EN_OVERVIEW, { timeout: 15_000 });

      // The agent-daemon shape: the write happens somewhere other than the tab that must reflect it.
      // `settings/events` polls the shared revision ledger, so the open tab learns about it without
      // any in-process coupling to the writer.
      await setLocale(page, "pt-BR");

      await expect(overviewNavItem(viewerPage)).toHaveText(PT_BR_OVERVIEW, { timeout: 20_000 });

    } finally { await viewerContext.close(); }
  });
});
});

// Migrated from admin-logout-cancel.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-logout-cancel", () => {
test("logout initially focuses Cancel and real Escape keeps the session authenticated", async ({ page }) => {
  await loginAsAdmin(page);
  const logout = page.locator(".cms-logout");
  await logout.click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Are you sure you want to log out?" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(logout).toBeFocused();
  await expect(page.locator(".admin-layout")).toBeVisible();
  await expect(page.locator(".login-card")).toHaveCount(0);
  // Reload checks the surviving server session as well as the current SPA's UI state.
  await page.reload();
  await expect(page.locator(".admin-layout")).toBeVisible();
});
});

// Migrated from admin-session-expiry-kickback.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-session-expiry-kickback", () => {
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

    // Wait for the screen to consume the rejected request before asserting shell state.
    await expect(page.locator(".notice.error")).toHaveText("forbidden");
    await expect(page.locator(".admin-layout")).toBeVisible();
    await expect(page.locator(".login-card")).toHaveCount(0);
  });
});
});

// Migrated from login-api-down.spec.ts; original pin intent and why comments follow.
// A deliberately absent API is a boot shape, not database state that a warm reset can reproduce.
test.describe("Bug pin: login-api-down", { tag: "@isolated-site" }, () => {
  test.use({ storageState: { cookies: [], origins: [] }, pinApi: false });
/**
 * @file Reproduction for "the repo owner cannot log in to the admin UI" (QA/E2E dispatch,
 * 2026-08-06). See `../playwright.login-api-down.config.ts`'s header for the full investigation
 * write-up and why this fixture shape (Vite up, API deliberately unreachable) was chosen over the
 * alternatives that were tried and ruled out live: a fresh `npm run dev` boot and a standalone
 * `tsx watch src/index.ts` boot (serving the possibly-stale `apps/admin/dist` build) both logged in
 * successfully via curl and a real headless Chromium session — login itself has no bug. The only
 * reproducible failure is the API being unreachable, which is what this file asserts against.
 */

test.describe("admin login when the API is unreachable (symptom reproduction)", () => {
  test("login attempt fails with a message that names the real cause", async ({ page }) => {
    // STALE PIN UPDATED 2026-10-07 (journeys consolidation): 741c5e76e (2026-10-05, "a server
    // restart no longer fails the admin, login included") changed this on purpose. The dev proxy
    // now answers a refused upstream with a marked 503, and `request()` (`apps/admin/src/lib/
    // server-reconnect.ts`) retries reads behind a "Server restarting…" banner for 60s before it
    // reports the server unreachable. The boot session read is retried too, so the login card no
    // longer appears while the API is down; the banner is now what names the real cause.
    test.setTimeout(150_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    // Background reads can restart the reconnect poll right after it gives up, so record every
    // banner text instead of hoping a poll lands inside a short "unreachable" window.
    await page.addInitScript(() => {
      const seen: string[] = [];
      (window as unknown as { __bannerTexts: string[] }).__bannerTexts = seen;
      new MutationObserver(() => {
        const text = document.querySelector(".server-restarting-banner")?.textContent ?? "";
        if (text && seen.at(-1) !== text) seen.push(text);
      }).observe(document, { subtree: true, childList: true, characterData: true });
    });
    await page.goto("/admin/", { waitUntil: "domcontentloaded" });
    const banner = page.locator(".server-restarting-banner");
    await expect(banner).toHaveText("Server restarting… reconnecting. Nothing you typed is lost.");

    // The failure IS visible — this is not a silent hang. Originally the on-screen text was the
    // generic `request failed (${status})` fallback, because Vite's dev proxy answers an unreachable
    // upstream with a bare 500 and no JSON body for `request()` to read a real message from — a
    // string that reads as "the server crashed" rather than "no server is listening at all", which
    // is why "start the server" wasn't the obvious next action for a human reading it. `request()`
    // now detects that shape (unparseable body + 5xx) and says so. The status is kept in the copy
    // because an unparseable 5xx is also what a genuine server-side crash looks like on the wire;
    // see `apps/admin/src/lib/api.ts`'s `request()` header for why it cannot distinguish them.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __bannerTexts: string[] }).__bannerTexts),
      { timeout: 90_000 }).toContain("Can't reach the Tovu server. It will retry when you try again.");

    // Never reaches the authenticated shell, and stays on the login screen rather than redirecting
    // anywhere or leaving a blank page.
    await expect(page.locator(".admin-layout")).toHaveCount(0);

    // The 500 is real and observable in devtools — an operator who opens the console (rather than
    // just reading the on-page text) does get a signal, just not one that says "process not
    // running."
    // Since 741c5e76e the proxy's refused-upstream answer is a marked 503 instead of Vite's 500.
    expect(consoleErrors.some((line) => line.includes("503"))).toBe(true);
  });
});
});

// Migrated from login.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
/**
 * @file MANDATE 1 ("does login even work?") — answered here, against a real browser hitting a real
 * `TOVU_DB=memory` boot through `playwright.destructive.config.ts`. See `auth-fixtures.ts`'s file
 * header for the write-up of what this proves about `dev-auth.ts` not being dev-only, and this
 * config's own header for a one-time, NOT reliably reproducible React crash found and investigated
 * while answering this mandate (9/9 later attempts passed clean — recorded, not worked around).
 *
 * Every test in this file fails loudly on any uncaught page error (see `beforeEach`/`afterEach`
 * below), specifically so that if that crash recurs it shows up as a clear assertion failure naming
 * the error, instead of the `.admin-layout` wait silently timing out with no explanation.
 *
 * These are ordinary specs (not ADR-055-gated) — login is orthogonal to the destructive-path bug
 * this dispatch's second mandate reproduces.
 */

test.describe("admin login (Mandate 1)", () => {
  let pageErrors: string[];

  test.beforeEach(({ page }) => {
    pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(`${err.message}\n${err.stack ?? ""}`));
  });

  test.afterEach(() => {
    expect(pageErrors, "no uncaught page error during this test").toEqual([]);
  });

  test("valid credentials reach the authenticated admin shell", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator(".admin-layout")).toBeVisible();
    // The session cookie itself: HttpOnly (unreadable from page JS, so this is a network-level
    // assertion, not a DOM one), Secure, and scoped to the whole origin.
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find((c) => c.name === "tovu_session");
    expect(sessionCookie, "tovu_session cookie must be set after login").toBeTruthy();
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.secure).toBe(true);
  });

  test("wrong password shows an error and never reaches the admin shell", async ({ page }) => {
    const response = page.waitForResponse((res) => res.url().endsWith("/api/admin/v1/auth/login") && res.request().method() === "POST");
    await attemptLoginAsAdmin(page, { username: DEFAULT_ADMIN_USERNAME, password: "definitely-not-the-password" });
    expect((await response).status()).toBe(401);
    expect(await (await response).json()).toEqual({ error: "invalid username or password", code: "UNAUTHENTICATED" });
    await expect(page.locator(".login-error")).toBeVisible();
    await expect(page.locator(".login-error")).toHaveText("invalid username or password");
    await expect(page.locator(".admin-layout")).toHaveCount(0);
    // Still on the login form, not silently redirected anywhere.
    await expect(page.locator(".login-card")).toBeVisible();
  });

  test("unknown username shows an error rather than a different failure mode", async ({ page }) => {
    const response = page.waitForResponse((res) => res.url().endsWith("/api/admin/v1/auth/login") && res.request().method() === "POST");
    await attemptLoginAsAdmin(page, { username: "not-a-real-user", password: DEFAULT_ADMIN_PASSWORD });
    expect((await response).status()).toBe(401);
    expect(await (await response).json()).toEqual({ error: "invalid username or password", code: "UNAUTHENTICATED" });
    await expect(page.locator(".login-error")).toBeVisible();
    await expect(page.locator(".login-error")).toHaveText("invalid username or password");
    await expect(page.locator(".admin-layout")).toHaveCount(0);
  });

  test("session survives a full page reload", async ({ page }) => {
    await loginAsAdmin(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    // `App.tsx` re-runs `api.me()` on mount; the cookie set by login must still authenticate it.
    await expect(page.locator(".admin-layout")).toBeVisible({ timeout: 10_000 });
  });

  test("logout returns to the login screen and the session cookie stops authenticating", async ({ page }) => {
    await loginAsAdmin(page);
    const session = (await page.context().cookies()).find((cookie) => cookie.name === "tovu_session");
    expect(session).toBeTruthy();
    const headers = { Cookie: `tovu_session=${session!.value}` };
    expect((await page.request.get("/api/admin/v1/auth/me", { headers })).status()).toBe(200);
    await logoutAsAdmin(page);
    await expect(page.locator(".login-card")).toBeVisible();

    const replay = await page.request.get("/api/admin/v1/auth/me", { headers });
    expect(replay.status()).toBe(401);
    expect((await replay.json()).code).toBe("UNAUTHENTICATED");

    // Reload also checks that App.tsx's next boot check keeps the browser signed out.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".login-card")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".admin-layout")).toHaveCount(0);
  });

  test("direct API call with no session cookie is rejected (REQ-06 fail-closed)", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/admin/v1/auth/me`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHENTICATED");
  });
});
});
