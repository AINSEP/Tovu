import type { Page } from "@playwright/test";

/**
 * @file Shared admin-login driving helpers for every E2E suite that needs an authenticated admin
 * session, first written for the SPEC/ADR-055 destructive-path reproduction (2026-08-04) but
 * intentionally generic — any suite importing this file only needs a `baseURL` that serves the
 * built admin SPA at `/admin/` and a Tovu API on the same origin.
 *
 * ## Mandate 1 finding: `dev-auth.ts` is not dev-only
 *
 * Despite its filename, `src/server/middleware/dev-auth.ts` is the ONLY auth implementation this
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
export const DEFAULT_ADMIN_USERNAME = process.env.TOVU_ADMIN_USER ?? "admin";
export const DEFAULT_ADMIN_PASSWORD = process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev";

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

/** Clicks the sidebar footer's real log-out control (`App.tsx`'s `SidebarLogoutButton`) and waits
 *  for the login screen to return. */
export async function logoutAsAdmin(page: Page): Promise<void> {
  await page.locator(".cms-logout").click();
  await page.locator(LOGIN_CARD_SELECTOR).waitFor({ state: "visible", timeout: 10_000 });
}
