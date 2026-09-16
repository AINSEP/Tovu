import { afterEach, describe, expect, it, vi } from "vitest";

import { ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID, buildAdminCapabilityExecutors } from "../../App.hooks";
import { resetScreenshotCapturedBus, subscribeToScreenshotCaptured } from "../../lib/agent-screenshot-bus";
import { ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID } from "../../lib/agent-screenshot";
import { resetSitePreviewBus, subscribeToSitePreview } from "../../lib/site-preview-bus";

/** A `Response`-shaped stub — the executor only reads `.status`/`.ok`, never the body, so this needs
 *  no real `fetch` Response construction. */
function fakeFetchResponse(status: number): Response {
  return { status, ok: status >= 200 && status < 300 } as Response;
}

/**
 * @file `App.hooks.tsx`'s `buildAdminCapabilityExecutors` — the `executors` map
 * `useAgentPageBridge` registers under `createFrontendSessionBridge`'s `"admin."` prefix (see that
 * hook's own doc comment, and `agent-screenshot.ts`'s module doc for the capability this answers).
 *
 * Extracted as a plain function specifically so this is testable with no `EventSource`, no
 * `createFrontendSessionBridge`, and no React render — the same "testability seam" pre-check every
 * other slice in this task followed.
 */

describe("buildAdminCapabilityExecutors", () => {
  it("registers exactly one prefix, 'admin.'", () => {
    const executors = buildAdminCapabilityExecutors(null, vi.fn());
    expect(Object.keys(executors)).toEqual(["admin."]);
  });

  it("routes admin.capture_screenshot to captureAdminScreenshotToolResult, bound to the given element", async () => {
    const element = document.createElement("main");
    document.body.appendChild(element);
    const renderElementToCanvas = vi.fn().mockResolvedValue({
      toDataURL: () => `data:image/jpeg;base64,${"A".repeat(100)}`,
    });
    const executors = buildAdminCapabilityExecutors(element, renderElementToCanvas);

    const result = (await executors["admin."]!(ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID, {})) as { content: unknown[] };

    expect(renderElementToCanvas).toHaveBeenCalledWith(element);
    expect(result.content).toHaveLength(2);
    document.body.removeChild(element);
  });

  it("rejects an unrecognized id under the 'admin.' prefix by name, rather than silently returning nothing", async () => {
    const executors = buildAdminCapabilityExecutors(null, vi.fn());

    await expect(executors["admin."]!("admin.something_else", {})).rejects.toThrow(/admin\.something_else/);
  });

  it("announces a successful capture on the screenshot-captured bus", async () => {
    resetScreenshotCapturedBus();
    const listener = vi.fn();
    subscribeToScreenshotCaptured(listener);
    const element = document.createElement("main");
    document.body.appendChild(element);
    const renderElementToCanvas = vi.fn().mockResolvedValue({
      toDataURL: () => `data:image/jpeg;base64,${"A".repeat(100)}`,
    });
    const executors = buildAdminCapabilityExecutors(element, renderElementToCanvas);

    await executors["admin."]!(ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID, {});

    expect(listener).toHaveBeenCalledTimes(1);
    document.body.removeChild(element);
    resetScreenshotCapturedBus();
  });

  it("does NOT announce on the bus when capture fails (nothing was actually seen)", async () => {
    resetScreenshotCapturedBus();
    const listener = vi.fn();
    subscribeToScreenshotCaptured(listener);
    // `element: null` -> captureAdminScreenshotToolResult's own "no admin content area" failure path.
    const executors = buildAdminCapabilityExecutors(null, vi.fn());

    await executors["admin."]!(ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID, {});

    expect(listener).not.toHaveBeenCalled();
    resetScreenshotCapturedBus();
  });
});

/**
 * `admin.show_site_page` — the executor branch this dispatch adds. `fetchSitePage` is the new test
 * seam `buildAdminCapabilityExecutors` takes (mirroring the existing `renderElementToCanvas` seam),
 * so these tests need no real `fetch`. The publish side is asserted against the REAL
 * `site-preview-bus.ts` via `subscribeToSitePreview`, the same pattern the screenshot tests above use
 * for `agent-screenshot-bus.ts` — that bus is already directly testable, so no second injectable
 * seam is needed for it.
 */
describe("buildAdminCapabilityExecutors: admin.show_site_page", () => {
  afterEach(() => {
    resetSitePreviewBus();
  });

  it("shows an accepted path unchanged, publishes it on the site-preview bus, and reports a 2xx result", async () => {
    const fetchSitePage = vi.fn().mockResolvedValue(fakeFetchResponse(200));
    const listener = vi.fn();
    subscribeToSitePreview(listener);
    const executors = buildAdminCapabilityExecutors(null, vi.fn(), fetchSitePage);

    const result = await executors["admin."]!(ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID, { path: "/blog/hello" });

    expect(fetchSitePage).toHaveBeenCalledWith("/blog/hello", { redirect: "follow" });
    expect(listener).toHaveBeenCalledWith({ path: "/blog/hello" });
    expect(result).toEqual({ path: "/blog/hello", shown: true, status: 200, ok: true });
  });

  it("still shows the page and reports it, with a note, when the operator's browser gets a non-2xx status — a 404 is a RESULT, not an error", async () => {
    const fetchSitePage = vi.fn().mockResolvedValue(fakeFetchResponse(404));
    const listener = vi.fn();
    subscribeToSitePreview(listener);
    const executors = buildAdminCapabilityExecutors(null, vi.fn(), fetchSitePage);

    const result = await executors["admin."]!(ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID, { path: "/no-such-page" });

    expect(listener).toHaveBeenCalledWith({ path: "/no-such-page" });
    expect(result).toMatchObject({ path: "/no-such-page", shown: true, status: 404, ok: false });
    expect((result as { note?: string }).note).toBeTruthy();
  });

  it("rejects '/admin' by name, before ever fetching or publishing — the §Q4 mitigation, exercised through the real wiring", async () => {
    const fetchSitePage = vi.fn();
    const listener = vi.fn();
    subscribeToSitePreview(listener);
    const executors = buildAdminCapabilityExecutors(null, vi.fn(), fetchSitePage);

    await expect(executors["admin."]!(ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID, { path: "/admin/settings" })).rejects.toThrow(
      /admin/i,
    );
    expect(fetchSitePage).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it("rejects '/api/...' by name, before ever fetching or publishing", async () => {
    const fetchSitePage = vi.fn();
    const executors = buildAdminCapabilityExecutors(null, vi.fn(), fetchSitePage);

    await expect(executors["admin."]!(ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID, { path: "/api/admin/settings" })).rejects.toThrow(
      /'\/api\/'/,
    );
    expect(fetchSitePage).not.toHaveBeenCalled();
  });

  it("rejects a missing/non-string path with a readable error, not a raw TypeError", async () => {
    const executors = buildAdminCapabilityExecutors(null, vi.fn(), vi.fn());

    await expect(executors["admin."]!(ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID, {})).rejects.toThrow(/non-empty string/);
  });

  it("turns a network failure into a readable tool error rather than a raw TypeError, and does not publish", async () => {
    const fetchSitePage = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const listener = vi.fn();
    subscribeToSitePreview(listener);
    const executors = buildAdminCapabilityExecutors(null, vi.fn(), fetchSitePage);

    await expect(executors["admin."]!(ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID, { path: "/pricing" })).rejects.toThrow(
      /pricing/,
    );
    expect(listener).not.toHaveBeenCalled();
  });

  it("an unrecognized id under the 'admin.' prefix still throws by name — the existing branch is not broken by this new one", async () => {
    const executors = buildAdminCapabilityExecutors(null, vi.fn(), vi.fn());

    await expect(executors["admin."]!("admin.something_else", {})).rejects.toThrow(/admin\.something_else/);
  });
});
