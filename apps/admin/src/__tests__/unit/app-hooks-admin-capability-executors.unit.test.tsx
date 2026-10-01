import { describe, expect, it, vi } from "vitest";

import { buildAdminCapabilityExecutors } from "../../App.hooks";
import { resetScreenshotCapturedBus, subscribeToScreenshotCaptured } from "../../lib/agent-screenshot-bus";
import { ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID } from "../../lib/agent-screenshot";
import { PUBLISH_CONTENT_CAPABILITY, type PublishRequestResult } from "@tovu/publish-content-ui";

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
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.content[1]).toEqual({ type: "image", mimeType: "image/jpeg", data: "A".repeat(100) });
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

  // Plan §4 S3 — the chat/WebMCP relay's only door to the Publish dialog. `requestPublish` is
  // injected the same way `renderElementToCanvas` is above, so this needs no store/module mock.
  it("admin.publish_content opens the Publish dialog with the criteria and returns the plan summary", async () => {
    const planned: PublishRequestResult = {
      opened: true,
      planned: true,
      site: "tovu-com",
      willPublish: ["About"],
      willOverwrite: [],
      leftAlone: [],
      unmatchedItems: [],
      unknownTypes: [],
      nextStep: "Check the list in the Publish dialog, then click Publish.",
    };
    const requestPublish = vi.fn().mockResolvedValue(planned);
    const executors = buildAdminCapabilityExecutors(null, vi.fn(), requestPublish);

    const result = await executors["admin."]!(PUBLISH_CONTENT_CAPABILITY.id, { types: ["page"], overwrite: true });

    expect(requestPublish).toHaveBeenCalledWith({ types: ["page"], overwrite: true });
    expect(result).toEqual(planned);
  });

  it("admin.publish_content rejects a bad input", async () => {
    const requestPublish = vi.fn();
    const executors = buildAdminCapabilityExecutors(null, vi.fn(), requestPublish);

    await expect(executors["admin."]!(PUBLISH_CONTENT_CAPABILITY.id, { types: "page" })).rejects.toThrow(
      "admin.publish_content: 'types' must be an array of strings"
    );
    expect(requestPublish).not.toHaveBeenCalled();
  });

  it("answers still-working after 20 seconds when the first plan stays pending", async () => {
    vi.useFakeTimers();
    try {
      const requestPublish = vi.fn(() => new Promise<PublishRequestResult>(() => {}));
      const executors = buildAdminCapabilityExecutors(null, vi.fn(), requestPublish);
      const settled = vi.fn();
      const result = executors["admin."]!(PUBLISH_CONTENT_CAPABILITY.id, { types: ["page"] });
      void result.then(settled);
      await vi.advanceTimersByTimeAsync(19_999);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledTimes(1);
      await expect(result).resolves.toEqual({
        opened: true,
        planned: false,
        site: null,
        willPublish: [],
        willOverwrite: [],
        leftAlone: [],
        unmatchedItems: [],
        unknownTypes: [],
        nextStep: "Still working out what would change; the dialog will show it.",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the timeout when the first plan settles early", async () => {
    vi.useFakeTimers();
    try {
      const planned = { opened: true, planned: true };
      const executors = buildAdminCapabilityExecutors(null, vi.fn(), vi.fn().mockResolvedValue(planned));
      await expect(executors["admin."]!(PUBLISH_CONTENT_CAPABILITY.id, {})).resolves.toEqual(planned);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
