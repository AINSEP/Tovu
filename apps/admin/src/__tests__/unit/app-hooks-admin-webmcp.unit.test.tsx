import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerAdminWebMcpTool, useAgentPageBridge } from "../../App.hooks";
import { PUBLISH_CONTENT_CAPABILITY } from "@tovu/publish-content-ui";
import { PAGE_CAPABILITIES } from "@jini-ai/agentic";
import { setBrowserAgentEnabled } from "../../features/webmcp/browser-agent-settings.hooks";

vi.mock("@jini-ai/chat/react", () => ({
  createFrontendSessionBridge: vi.fn(() => ({ ready: Promise.resolve(), close: vi.fn() })),
}));
vi.mock("../../hooks/use-admin-locale.hooks", () => ({ useWiredAdminLocale: () => "en" }));

const documentContextDescriptor = Object.getOwnPropertyDescriptor(document, "modelContext");
const navigatorContextDescriptor = Object.getOwnPropertyDescriptor(navigator, "modelContext");

afterEach(() => {
  act(() => setBrowserAgentEnabled({ enabled: true }));
  for (const [target, descriptor] of [[document, documentContextDescriptor], [navigator, navigatorContextDescriptor]] as const) {
    if (descriptor) Object.defineProperty(target, "modelContext", descriptor);
    else Reflect.deleteProperty(target, "modelContext");
  }
});

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
    expect(registration.inputSchema).toEqual(PUBLISH_CONTENT_CAPABILITY.inputSchema);
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

  it("forwards the caller's abort signal to the host", () => {
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

  it("resolves document.modelContext before navigator.modelContext on the default path", () => {
    const documentHost = { registerTool: vi.fn() };
    const navigatorHost = { registerTool: vi.fn() };
    Object.defineProperty(document, "modelContext", { configurable: true, value: documentHost });
    Object.defineProperty(navigator, "modelContext", { configurable: true, value: navigatorHost });

    registerAdminWebMcpTool({ "admin.": vi.fn() }, new AbortController().signal);

    expect(documentHost.registerTool).toHaveBeenCalledTimes(1);
    expect(navigatorHost.registerTool).not.toHaveBeenCalled();
  });

  it("falls back to navigator.modelContext when document has no host", () => {
    const navigatorHost = { registerTool: vi.fn() };
    Object.defineProperty(document, "modelContext", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "modelContext", { configurable: true, value: navigatorHost });

    registerAdminWebMcpTool({ "admin.": vi.fn() }, new AbortController().signal);

    expect(navigatorHost.registerTool).toHaveBeenCalledTimes(1);
    expect(navigatorHost.registerTool.mock.calls[0][0].name).toBe(PUBLISH_CONTENT_CAPABILITY.id);
  });

  it("the real bridge registers on mount and aborts its registered signal on unmount", () => {
    const registerTool = vi.fn();
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool } });
    const { result, unmount } = renderHook(() => useAgentPageBridge());
    const element = document.createElement("main");
    act(() => result.current.setContentEl(element));

    expect(registerTool).toHaveBeenCalledTimes(1 + PAGE_CAPABILITIES.length);
    const [registration, options] = registerTool.mock.calls[0];
    expect(registration.name).toBe(PUBLISH_CONTENT_CAPABILITY.id);
    expect(options.signal.aborted).toBe(false);
    unmount();
    expect(options.signal.aborted).toBe(true);
  });

  it("opt-out aborts every browser tool without tearing down the assistant bridge", async () => {
    const { createFrontendSessionBridge } = await import("@jini-ai/chat/react");
    const registerTool = vi.fn();
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool } });
    const { result } = renderHook(() => useAgentPageBridge());
    act(() => result.current.setContentEl(document.createElement("main")));
    const bridge = result.current.agentBridge!;
    const callsBeforeToggle = vi.mocked(createFrontendSessionBridge).mock.calls.length;
    const signals = registerTool.mock.calls.map((call) => call[1].signal as AbortSignal);
    act(() => setBrowserAgentEnabled({ enabled: false }));
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(result.current.agentBridge).toBe(bridge);
    expect(bridge.close).not.toHaveBeenCalled();
    act(() => setBrowserAgentEnabled({ enabled: true }));
    expect(registerTool).toHaveBeenCalledTimes(2 * (1 + PAGE_CAPABILITIES.length));
    expect(vi.mocked(createFrontendSessionBridge).mock.calls).toHaveLength(callsBeforeToggle);
  });

  it("stale publish callbacks cannot bypass an opt-out", async () => {
    const registerTool = vi.fn();
    const executor = vi.fn();
    registerAdminWebMcpTool({ "admin.": executor }, new AbortController().signal, { registerTool });
    act(() => setBrowserAgentEnabled({ enabled: false }));
    await expect(registerTool.mock.calls[0][0].execute({})).rejects.toThrow(/disabled/);
    expect(executor).not.toHaveBeenCalled();
  });
});
