import { describe, expect, it, vi } from "vitest";

import { registerAdminWebMcpTool } from "../../App.hooks";
import { PUBLISH_CONTENT_CAPABILITY } from "@tovu/publish-content-ui";

/**
 * @file `App.hooks.tsx`'s `registerAdminWebMcpTool` — publish-criteria plan §4 S5 ("WebMCP on"),
 * the owner's 09-22 decision that WebMCP stays on now that P0 (plan §3 item 2) has removed the
 * Publish button's agent handle.
 *
 * Extracted as a plain function for the same reason `buildAdminCapabilityExecutors` (tested in
 * `app-hooks-admin-capability-executors.unit.test.tsx`) is: testable with no `EventSource`, no
 * `document.modelContext`/`navigator.modelContext` browser globals, and no React render. The real
 * `useAgentPageBridge` effect calls this with its own `executors` (from
 * `buildAdminCapabilityExecutors`) and an `AbortController` it aborts on cleanup — this file drives
 * that same contract directly.
 */

describe("registerAdminWebMcpTool", () => {
  it("registers exactly one WebMCP tool, named admin.publish_content, when a model context is given", () => {
    const registerTool = vi.fn();
    const executors = { "admin.": vi.fn() };
    const controller = new AbortController();

    registerAdminWebMcpTool(executors, controller.signal, { registerTool });

    expect(registerTool).toHaveBeenCalledTimes(1);
    const [registration] = registerTool.mock.calls[0]!;
    expect(registration.name).toBe(PUBLISH_CONTENT_CAPABILITY.id);
  });

  it("calling its execute forwards to the SAME admin. executor buildAdminCapabilityExecutors builds — one implementation behind both doors", async () => {
    const registerTool = vi.fn();
    const adminExecutor = vi.fn().mockResolvedValue("planned");
    const executors = { "admin.": adminExecutor };
    const controller = new AbortController();

    registerAdminWebMcpTool(executors, controller.signal, { registerTool });
    const [registration] = registerTool.mock.calls[0]!;
    const result = await registration.execute({ types: ["page"] });

    expect(adminExecutor).toHaveBeenCalledWith(PUBLISH_CONTENT_CAPABILITY.id, { types: ["page"] });
    expect(result).toBe("planned");
  });

  it("unmount aborts the signal — the caller's AbortController is what unregisters the tool (WebMCP's only mechanism)", () => {
    const registerTool = vi.fn();
    const executors = { "admin.": vi.fn() };
    const controller = new AbortController();

    registerAdminWebMcpTool(executors, controller.signal, { registerTool });

    const [, registerOptions] = registerTool.mock.calls[0]!;
    expect(registerOptions.signal).toBe(controller.signal);
    expect(registerOptions.signal.aborted).toBe(false);

    // What `useAgentPageBridge`'s effect cleanup does on unmount/re-run.
    controller.abort();

    expect(registerOptions.signal.aborted).toBe(true);
  });

  it("no modelContext means no throw — most browsers have no WebMCP host today", () => {
    const executors = { "admin.": vi.fn() };
    const controller = new AbortController();

    expect(() => registerAdminWebMcpTool(executors, controller.signal, undefined)).not.toThrow();
  });
});
