// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { test as base, expect, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Shared constants and helpers for every `*.journey.ts` file (minimal stand-in for SCOPE.md's
 * E2E-H1 `journeys/_fixtures.ts`; H1 should absorb this file, not sit beside it).
 *
 * Origins: the admin SPA is the Vite dev server (`baseURL`, proxies `/api` to the site server); the
 * public site is the site server itself. Ports mirror `playwright.journeys.config.ts`.
 */
export const JOURNEY_ADMIN_USER = "admin";
export const JOURNEY_ADMIN_PASSWORD = "tovu-journeys";
export const PUBLIC_URL = "http://localhost:9101";
export const ADMIN_URL = "http://localhost:9102";
export const WS = "workspace-local";
export const API = "/api/admin/v1";
export const WS_API = `${API}/workspaces/${WS}`;

/** Hosts a journey must never reach: every model call is stubbed (SCOPE.md §2.1, zero live quota). */
const VENDOR_HOSTS = /(^|\.)(api\.anthropic\.com|generativelanguage\.googleapis\.com|api\.openai\.com|openai\.azure\.com|openrouter\.ai)$/;

/** 1x1 transparent PNG, inline so the suite needs no binary fixture file. */
export const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** A name unique per run, so journeys never depend on each other's rows or on run order. */
export function uniq(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Same as {@link uniq} but safe as a URL slug. */
export function uniqSlug(prefix: string): string {
  return uniq(prefix).toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

/** Fails loudly with the response body instead of a bare status mismatch. */
export async function expectStatus(response: { status(): number; text(): Promise<string> }, status: number, what: string): Promise<void> {
  expect(response.status(), `${what}: ${await response.text().catch(() => "")}`).toBe(status);
}

export async function createPublishedPageWithHtml(
  request: APIRequestContext,
  { title, slug, html }: { title: string; slug: string; html: string },
): Promise<{ id: string; slug: string }> {
  const created = await request.post(`${WS_API}/pages`, { data: { title, slug, status: "published" } });
  await expectStatus(created, 201, "page create");
  const page = (await created.json()).post as { id: string; slug: string };
  const written = await request.put(`${WS_API}/pages/${page.id}/html`, { data: { html } });
  await expectStatus(written, 200, "page html write");
  return page;
}

/** Reads a public route from the site origin (not the admin proxy) and returns status + HTML. */
export async function fetchPublic(request: APIRequestContext, pathname: string): Promise<{ status: number; html: string; contentType: string }> {
  const res = await request.get(`${PUBLIC_URL}${pathname}`, { maxRedirects: 0 });
  return { status: res.status(), html: await res.text(), contentType: res.headers()["content-type"] ?? "" };
}

/** True when the document is wider than the viewport, i.e. the page scrolls sideways. */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

interface JourneyFixtures {
  /** Uncaught page errors seen during the test; asserted empty after every test. */
  pageErrors: string[];
}

/**
 * `test` for every journey: an auto fixture aborts any request to a model vendor (and fails the
 * test), and fails the test on any uncaught page error. A journey that legitimately expects a page
 * error must clear `pageErrors` itself and say why.
 */
export const test = base.extend<JourneyFixtures>({
  pageErrors: [
    async ({ page, context }, use) => {
      const errors: string[] = [];
      const egress: string[] = [];
      await context.route(
        (url) => VENDOR_HOSTS.test(url.hostname),
        async (route) => {
          egress.push(route.request().url());
          await route.abort("blockedbyclient");
        },
      );
      page.on("pageerror", (error) => errors.push(error.message));
      await use(errors);
      expect(egress, "a journey reached a model vendor; every model call must be stubbed").toEqual([]);
      expect(errors, "uncaught page errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
