import { afterEach, expect, test, vi } from "vitest";

import { API_UNREACHABLE_CODE, ApiError, api } from "../api";

/**
 * @file `request()`'s translation of a `fetch` rejection that happens BECAUSE the page is navigating
 * away — not because the API is down.
 *
 * Live-reproduced 2026-09-13 in headless Chromium (o12): a `fetch` still in flight when the page
 * navigates rejects with `TypeError: Failed to fetch` — the exact type and text of a refused
 * connection — and it does so AFTER `pagehide` has fired. Without the page-lifecycle check, every
 * request cut off by an ordinary full-page navigation was relabeled "cannot reach the Tovu API — is
 * the server running?" (the AssistantDock's mount loads logged it on SEO → Sitemap, AI Assistant, …
 * while the API was answering 200 throughout).
 */

afterEach(() => {
  // Back to a live page for the next test: `pageshow` is also what a bfcache restore fires.
  window.dispatchEvent(new Event("pageshow"));
  vi.unstubAllGlobals();
});

function stubRejectedFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
}

test("a fetch cut off by the page unloading rejects as a cancellation, not as an unreachable API", async () => {
  stubRejectedFetch();
  window.dispatchEvent(new Event("pagehide"));

  const error = await api.me().catch((e: unknown) => e);

  expect(error).not.toBeInstanceOf(ApiError);
  expect((error as { name?: string }).name).toBe("AbortError");
  expect((error as Error).message).toBe("request cancelled: the page is unloading");
});

test("a page restored from the back/forward cache reports a rejected fetch as unreachable again", async () => {
  stubRejectedFetch();
  window.dispatchEvent(new Event("pagehide"));
  window.dispatchEvent(new Event("pageshow"));

  const error = (await api.me().catch((e: unknown) => e)) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  expect(error.code).toBe(API_UNREACHABLE_CODE);
  expect(error.message).toBe("cannot reach the Tovu API — is the server running?");
});
