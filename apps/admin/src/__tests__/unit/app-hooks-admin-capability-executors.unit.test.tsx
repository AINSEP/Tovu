import { describe, expect, it, vi } from "vitest";

import { buildAdminCapabilityExecutors } from "../../App.hooks";
import { resetScreenshotCapturedBus, subscribeToScreenshotCaptured } from "../../lib/agent-screenshot-bus";
import { ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID } from "../../lib/agent-screenshot";

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
