import { afterEach, describe, expect, it, vi } from "vitest";

import { publishSitePreview, resetSitePreviewBus, subscribeToSitePreview } from "../site-preview-bus";

/**
 * @file `site-preview-bus.ts` — modeled directly on `agent-screenshot-bus.ts`'s fire-and-forget
 * shape, with one deliberate difference this suite exists to pin: THIS bus carries a payload
 * (`{ path }`), because `SitePreviewOverlay` renders whatever path it was just told to show, unlike
 * the screenshot toast, which renders one fixed, already-translated string.
 */

afterEach(() => {
  resetSitePreviewBus();
  vi.restoreAllMocks();
});

describe("subscribeToSitePreview / publishSitePreview", () => {
  it("notifies a subscribed listener with the published path", () => {
    const listener = vi.fn();
    subscribeToSitePreview(listener);

    publishSitePreview({ path: "/blog/hello" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ path: "/blog/hello" });
  });

  it("the disposer returned by subscribeToSitePreview stops future notifications", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSitePreview(listener);
    unsubscribe();

    publishSitePreview({ path: "/" });

    expect(listener).not.toHaveBeenCalled();
  });

  it("is a safe no-op when nothing is listening", () => {
    expect(() => publishSitePreview({ path: "/" })).not.toThrow();
  });

  it("a throwing listener is caught and logged, and does not stop the remaining listeners from running", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();
    subscribeToSitePreview(throwing);
    subscribeToSitePreview(healthy);

    publishSitePreview({ path: "/pricing" });

    expect(healthy).toHaveBeenCalledWith({ path: "/pricing" });
    expect(errorSpy).toHaveBeenCalledWith("[admin] site-preview listener failed", expect.any(Error));
  });

  it("publishing a new path re-notifies with the new value — the overlay must re-render on a second show", () => {
    const listener = vi.fn();
    subscribeToSitePreview(listener);

    publishSitePreview({ path: "/a" });
    publishSitePreview({ path: "/b" });

    expect(listener).toHaveBeenNthCalledWith(1, { path: "/a" });
    expect(listener).toHaveBeenNthCalledWith(2, { path: "/b" });
  });
});

describe("resetSitePreviewBus", () => {
  it("clears every listener", () => {
    const listener = vi.fn();
    subscribeToSitePreview(listener);

    resetSitePreviewBus();
    publishSitePreview({ path: "/" });

    expect(listener).not.toHaveBeenCalled();
  });
});
