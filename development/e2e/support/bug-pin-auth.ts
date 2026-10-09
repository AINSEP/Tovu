import { JOURNEY_ADMIN_USER, JOURNEY_ADMIN_PASSWORD } from "./isolated-journey-site.js";
import type { APIRequestContext, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

type SessionStorageState = Awaited<ReturnType<APIRequestContext["storageState"]>>;

/** Chromium sends Secure cookies to HTTP on 127.0.0.1; Playwright's API client does not. Reuse
 * the isolated site's real session without another login or changing its Secure attribute.
 * Reads saved state or the current request jar; throws a fixed error when a required session is
 * absent. Anonymous/auth pins explicitly allow an empty jar. Never include cookie values in errors. */
export async function pinSessionHeaders(
  source: { request: APIRequestContext } | { storageState: string | SessionStorageState | undefined },
  { requireSession = true }: { requireSession?: boolean } = {},
): Promise<Record<string, string>> {
  const state = "request" in source ? await source.request.storageState()
    : typeof source.storageState === "string" ? JSON.parse(await readFile(source.storageState, "utf8")) as SessionStorageState
    : source.storageState;
  const session = state?.cookies.find((cookie) => cookie.name === "tovu_session");
  if (!session) {
    if (requireSession) throw new Error("Pin API requests require the isolated site's admin session");
    return {};
  }
  return { Cookie: `${session.name}=${session.value}` };
}

/** Reuse the browser-session transport: APIRequestContext omits Secure cookies over HTTP
 * loopback. Native Response keeps status and JSON assertions on the real route's response.
 * Read the browser's current session for each call so login/logout changes take effect. */
export async function pinSessionRequest(
  { page, url, method = "GET", data }: { page: Page; url: string; method?: string; data?: unknown },
  { headers = {} }: { headers?: Record<string, string> } = {},
): Promise<Response> {
  const origin = new URL(page.url()).origin;
  const target = new URL(url, origin);
  if (target.origin !== origin) throw new Error("Pin API requests must stay on the browser's site origin");
  // Caller headers (e.g. a route's required `If-Match`) never replace the session cookie.
  const response = await page.request.fetch(target.href, {
    method, data, headers: { ...headers, ...await pinSessionHeaders({ request: page.request }) }, maxRedirects: 0,
  });
  try {
    return new Response([204, 205, 304].includes(response.status()) ? null : await response.text(), {
      status: response.status(), headers: response.headers(),
    });
  } finally { await response.dispose(); }
}

/**
 * @file Shared admin-login driving helpers for every E2E suite that needs an authenticated admin
 * session, first written for the SPEC/ADR-055 destructive-path reproduction (2026-08-04) but
 * intentionally generic — any suite importing this file only needs a `baseURL` that serves the
 * built admin SPA at `/admin/` and a Tovu API on the same origin.
 *
 * ## Mandate 1 finding: `dev-auth.ts` is not dev-only
 *
 * Despite its filename, `src/server/inbound/admin-http/dev-auth.ts` is the ONLY auth implementation this
 * codebase has, in every boot shape (`node --import tsx src/index.ts`, `TOVU_DB=memory`, a built
 * production boot — `src/server/modules/core.ts` registers `registerAuthRoutes` /
 * `requireAdminSession` unconditionally, with no `NODE_ENV` branch anywhere in that path). Its own
 * file header says as much: it REPLACED a prior hardcoded-credential HMAC-cookie scheme
 * (ADR-021/SPEC-006) with real argon2id password verification against the seeded `users` table and
 * a real, server-side, revocable `sessions` row. There is no separate "production" login path to
 * find — this is it. The name is legacy, not a scope marker.
 *
 * Confirmed live (curl, then this file's own Playwright run) against a `TOVU_DB=memory` boot:
 * `POST /api/admin/v1/auth/login` with the seeded owner credentials returns `200` and a `Set-Cookie:
 * tovu_session=...; HttpOnly; Path=/; SameSite=Strict; Secure`. The `Secure` attribute does NOT
 * block the cookie over plain `http://localhost` — Chromium (and every other major browser) treats
 * `localhost` as a secure context regardless of scheme, so the cookie round-trips correctly in a
 * real Playwright Chromium session hitting `http://localhost:<port>` with no TLS involved.
 *
 * ## Why this drives the real UI rather than seeding via the API
 *
 * `e2e-test-architecture`'s own guidance is "log in once via API and store `storageState`" as an
 * optimization for suites that log in dozens of times. This suite does not: `playwright.admin.config
 * .ts` (BYOK) already discovered live that concurrent logins across parallel workers trip the real
 * `LOGIN_STRICT` rate limiter, so every consuming config here should run `workers: 1` and pay the
 * UI-login cost once or twice, not per-test. Driving the real form is also itself evidence for
 * Mandate 1 ("does login even work") — an API-only fixture would prove the route works without ever
 * proving a human can actually get through the `Login.tsx` screen.
 */

/** Matches `Login.tsx`'s pre-filled default and its own on-screen hint ("local dev default: admin /
 *  tovu-dev"), and `identity/wiring.ts:96-97`'s fallback when `TOVU_ADMIN_USER`/`TOVU_ADMIN_PASSWORD`
 *  are unset — which is how every config in this directory boots (`TOVU_DB=memory`, no override). */
export const DEFAULT_ADMIN_USERNAME = JOURNEY_ADMIN_USER;
export const DEFAULT_ADMIN_PASSWORD = JOURNEY_ADMIN_PASSWORD;

/** Selector for the shell that only exists once `App.tsx` has resolved `api.me()` and mounted the
 *  authenticated layout (`App.tsx:360`, `if (!user) return <Login .../>` above it). Waiting on this
 *  rather than a URL change or a timeout is the real readiness signal — the SPA never navigates. */
const ADMIN_LAYOUT_SELECTOR = ".admin-layout";
const LOGIN_CARD_SELECTOR = ".login-card";

/**
 * Drives the real `Login.tsx` form to reach an authenticated admin session.
 *
 * Navigates to `/admin/` first (idempotent if already there), fills the two ARIA-labelled inputs,
 * submits, and waits for the authenticated shell to mount. Throws (via Playwright's own timeout) if
 * login does not succeed — callers that expect failure should use {@link attemptLoginAsAdmin}
 * instead so a failed attempt is an assertion target, not a fixture crash.
 */
export async function loginAsAdmin(
  page: Page,
  opts?: { username?: string; password?: string }
): Promise<void> {
  // Ordinary pins reuse the config session; auth pins clear storageState explicitly.
  const sessionCheck = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/admin/v1/auth/me" && response.request().method() === "GET"
  );
  await page.goto("/admin/", { waitUntil: "domcontentloaded" });
  const session = await sessionCheck;
  // The login form can briefly render while me() is pending. Choose the screen only after
  // that real session check settles, or fill() can chase a form that has already unmounted.
  if (!opts && session.ok()) {
    await page.locator(ADMIN_LAYOUT_SELECTOR).waitFor({ state: "visible", timeout: 10_000 });
    return;
  }
  await attemptLoginAsAdmin(page, opts);
  await page.locator(ADMIN_LAYOUT_SELECTOR).waitFor({ state: "visible", timeout: 10_000 });
}

/**
 * Same driving steps as {@link loginAsAdmin}, but does not assert the outcome — for specs that
 * intentionally submit bad credentials and want to assert the error state themselves.
 */
export async function attemptLoginAsAdmin(
  page: Page,
  opts?: { username?: string; password?: string }
): Promise<void> {
  const username = opts?.username ?? DEFAULT_ADMIN_USERNAME;
  const password = opts?.password ?? DEFAULT_ADMIN_PASSWORD;

  if (!page.url().includes("/admin")) {
    await page.goto("/admin/", { waitUntil: "domcontentloaded" });
  }
  await page.locator(LOGIN_CARD_SELECTOR).waitFor({ state: "visible", timeout: 10_000 });

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

/** True once the authenticated shell is showing — polled rather than asserted, so a caller can
 *  branch (e.g. "did the bad-credentials attempt correctly NOT log in"). */
export async function isLoggedIn(page: Page): Promise<boolean> {
  return page.locator(ADMIN_LAYOUT_SELECTOR).isVisible();
}

/** Clicks the sidebar footer's real log-out control (`App.tsx`'s `SidebarLogoutButton`), confirms
 *  the "Log out?" dialog it opens (9fe26647a), and waits for the login screen to return. */
export async function logoutAsAdmin(page: Page): Promise<void> {
  await page.locator(".cms-logout").click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Are you sure you want to log out?" });
  await dialog.getByRole("button", { name: "Log out", exact: true }).click();
  await page.locator(LOGIN_CARD_SELECTOR).waitFor({ state: "visible", timeout: 10_000 });
}
