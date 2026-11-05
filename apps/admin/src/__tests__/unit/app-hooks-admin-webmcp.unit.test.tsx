import { act, renderHook, waitFor } from "@/__tests__/fetch-query-render";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerAdminWebMcpTool, useAgentPageBridge } from "../../App.hooks";
import { PUBLISH_CONTENT_CAPABILITY } from "@tovu/publish-content-ui";
import { PAGE_CAPABILITIES, type WebMcpToolRegistration } from "@jini-ai/agentic";
import type { FrontendSessionBridge } from "@jini-ai/chat/react";
import { setBrowserAgentEnabled } from "../../features/webmcp/browser-agent-settings.hooks";
import { adminFrontendTabId, subscribeToAdminPageSurfaces } from "../../lib/admin-frontend-session";
import { navigate } from "../../lib/router";

// Inject the transport factory; no module replacement or network is needed for page registration.
const createBridge = vi.fn((): FrontendSessionBridge => ({
  ready: Promise.resolve({ sessionId: "session-1", bindToken: "bind-1" }),
  rebind: async () => ({ sessionId: "session-1", bindToken: "bind-1" }),
  bindToken: () => "bind-1", close: vi.fn(),
  bridgeAccess: { subscribe: () => () => {}, respondSuccess: async () => {}, respondError: async () => {} },
}));

const documentContextDescriptor = Object.getOwnPropertyDescriptor(document, "modelContext");
const navigatorContextDescriptor = Object.getOwnPropertyDescriptor(navigator, "modelContext");

afterEach(() => {
  vi.restoreAllMocks();
  act(() => setBrowserAgentEnabled({ enabled: true }));
  createBridge.mockClear();
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
  it("a disabled browser-agent setting refuses new registrations", () => {
    act(() => setBrowserAgentEnabled({ enabled: false }));
    const registerTool = vi.fn();
    registerAdminWebMcpTool({ "admin.": vi.fn() }, new AbortController().signal, { registerTool });
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("an unattached frontend bridge logs its failure and is still closed on unmount", async () => {
    const failure = new Error("frontend session unavailable");
    const close = vi.fn();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    createBridge.mockReturnValueOnce({
      ready: Promise.reject(failure), rebind: async () => { throw failure; }, bindToken: () => "", close,
      bridgeAccess: { subscribe: () => () => {}, respondSuccess: async () => {}, respondError: async () => {} },
    });
    const { result, unmount } = renderHook(() => useAgentPageBridge({ createBridge }));
    await act(async () => result.current.setContentEl(document.createElement("main")));
    expect(error).toHaveBeenCalledWith("[admin] page control never attached", failure);
    expect(result.current.agentBridge).not.toBeNull();
    unmount();
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(["synchronous", "asynchronous"] as const)("a %s host registration failure warns without breaking the shell", async (mode) => {
    const failure = new Error("browser host refused registration");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const registerTool = () => {
      if (mode === "synchronous") throw failure;
      return Promise.reject(failure);
    };
    expect(() => registerAdminWebMcpTool({ "admin.": vi.fn() }, new AbortController().signal, { registerTool })).not.toThrow();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledExactlyOnceWith("[admin] WebMCP publish registration failed", failure);
  });

  it("a host failure after registration was aborted does not log a stale warning", async () => {
    const controller = new AbortController();
    let rejectRegistration!: (error: Error) => void;
    const registration = new Promise<void>((_, reject) => { rejectRegistration = reject; });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerAdminWebMcpTool({ "admin.": vi.fn() }, controller.signal, { registerTool: () => registration });
    controller.abort();
    rejectRegistration(new Error("closed host"));
    await Promise.resolve();
    expect(warn).not.toHaveBeenCalled();
  });

  it("a host that aborts while throwing does not log a stale warning", () => {
    const controller = new AbortController();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerAdminWebMcpTool({ "admin.": vi.fn() }, controller.signal, { registerTool: () => {
      controller.abort();
      throw new Error("closed host");
    } });
    expect(warn).not.toHaveBeenCalled();
  });

  it("an already-aborted registration never reaches the browser host", () => {
    const controller = new AbortController();
    controller.abort();
    const registerTool = vi.fn();
    registerAdminWebMcpTool({ "admin.": vi.fn() }, controller.signal, { registerTool });
    expect(registerTool).not.toHaveBeenCalled();
  });

  it("a retained publish callback refuses execution after its registration closes", async () => {
    const registerTool = vi.fn();
    const executor = vi.fn();
    const controller = new AbortController();
    registerAdminWebMcpTool({ "admin.": executor }, controller.signal, { registerTool });
    controller.abort();
    await expect(registerTool.mock.calls[0][0].execute({})).rejects.toThrow("WebMCP admin access is disabled or closed");
    expect(executor).not.toHaveBeenCalled();
  });

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
    const { result, unmount } = renderHook(() => useAgentPageBridge({ createBridge }));
    const element = document.createElement("main");
    act(() => result.current.setContentEl(element));

    expect(createBridge).toHaveBeenCalledTimes(1);
    expect(registerTool).toHaveBeenCalledTimes(1 + PAGE_CAPABILITIES.length);
    expect(registerTool.mock.calls.map(([tool]) => tool.name)).toEqual([PUBLISH_CONTENT_CAPABILITY.id, ...PAGE_CAPABILITIES.map(capability => capability.id)]);
    const [registration, options] = registerTool.mock.calls[0];
    expect(registration.name).toBe(PUBLISH_CONTENT_CAPABILITY.id);
    expect(options.signal.aborted).toBe(false);
    unmount();
    expect(options.signal.aborted).toBe(true);
  });

  it("opt-out aborts every browser tool without tearing down the assistant bridge", async () => {
    const registerTool = vi.fn();
    Object.defineProperty(document, "modelContext", { configurable: true, value: { registerTool } });
    const { result } = renderHook(() => useAgentPageBridge({ createBridge }));
    act(() => result.current.setContentEl(document.createElement("main")));
    const bridge = result.current.agentBridge!;
    const callsBeforeToggle = createBridge.mock.calls.length;
    const signals = registerTool.mock.calls.map((call) => call[1].signal as AbortSignal);
    act(() => setBrowserAgentEnabled({ enabled: false }));
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(result.current.agentBridge).toBe(bridge);
    expect(bridge.close).not.toHaveBeenCalled();
    act(() => setBrowserAgentEnabled({ enabled: true }));
    expect(registerTool).toHaveBeenCalledTimes(2 * (1 + PAGE_CAPABILITIES.length));
    expect(createBridge.mock.calls).toHaveLength(callsBeforeToggle);
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

it('sends a protected browser call through the tab-bound authenticated stream and publishes its chat card before the result', async () => {
  const registerTool = vi.fn();
  Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } });
  const onSurface = vi.fn();
  const stop = subscribeToAdminPageSurfaces(onSurface);
  const card = { channel: 'mcp-ui', payload: { resource: { uri: 'ui://page-confirmation' } } };
  const encoder = new TextEncoder();
  let complete!: () => void;
  const send = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'surface', emission: card })}\n`));
      complete = () => {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'result', result: { status: 'completed', output: { clicked: 'post-delete-confirm' } } })}\n`));
        controller.close();
      };
    },
  }), { headers: { 'content-type': 'application/x-ndjson' } }));
  const { result, unmount } = renderHook(() => useAgentPageBridge({ createBridge }));
  const content = document.createElement('main');
  const click = vi.fn();
  content.innerHTML = '<button data-agent-element="post-delete-confirm">Delete permanently</button>';
  content.querySelector('button')!.addEventListener('click', click);
  act(() => result.current.setContentEl(content));
  const registrations = registerTool.mock.calls.map(([tool]) => tool as WebMcpToolRegistration);
  const pageClick = registrations.find(tool => tool.name === 'page.click')!;
  let settled = false;
  const pending = pageClick.execute({ handle: 'post-delete-confirm' }).then(output => { settled = true; return output; });
  try {
    await waitFor(() => expect(onSurface).toHaveBeenCalledExactlyOnceWith(card));
    expect(settled).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    const [path, request] = send.mock.calls[0];
    expect(path).toBe('/api/frontend-sessions/request');
    expect(request).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'x-frontend-tab-id': adminFrontendTabId, 'content-type': 'application/json' } });
    expect(JSON.parse(request!.body as string)).toEqual({ capabilityId: 'page.click', input: { handle: 'post-delete-confirm' }, bindToken: 'bind-1' });
    expect(registrations.some(tool => tool.name === 'admin.respond_page_approval')).toBe(false);
    complete();
    expect(await pending).toEqual({ clicked: 'post-delete-confirm' });
    expect(click).not.toHaveBeenCalled();
  } finally { stop(); unmount(); }
});

it.each(['disabled', 'navigation'])("aborts a protected WebMCP request on %s while keeping the assistant bridge", async state => {
  const registerTool = vi.fn();
  Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } });
  let requestSignal: AbortSignal | undefined;
  vi.spyOn(globalThis, 'fetch').mockImplementation((_path, request) => new Promise((_, reject) => {
    requestSignal = request!.signal as AbortSignal;
    requestSignal.addEventListener('abort', () => reject(new Error('Page request cancelled')), { once: true });
  }));
  const { result, unmount } = renderHook(() => useAgentPageBridge({ createBridge }));
  act(() => result.current.setContentEl(document.createElement('main')));
  const bridge = result.current.agentBridge!;
  const pageClick = registerTool.mock.calls.map(([tool]) => tool as WebMcpToolRegistration).find(tool => tool.name === 'page.click')!;
  const pending = pageClick.execute({ handle: 'post-delete-confirm' });
  const rejected = expect(pending).rejects.toThrow('Page request cancelled');
  await waitFor(() => expect(requestSignal).toBeDefined());
  expect(requestSignal!.aborted).toBe(false);
  act(() => {
    if (state === 'disabled') setBrowserAgentEnabled({ enabled: false });
    else navigate('/webmcp-abort-navigation');
  });
  await rejected;
  expect(requestSignal!.aborted).toBe(true);
  expect(result.current.agentBridge).toBe(bridge);
  expect(bridge.close).not.toHaveBeenCalled();
  unmount();
});

it('activates a parked page service before rebinding a protected WebMCP request', async () => {
  const registerTool = vi.fn();
  Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } });
  const order: string[] = [];
  let token: string | undefined;
  const rebind = vi.fn(async () => {
    order.push('rebind');
    token = 'private-token-after-activation';
    return { sessionId: 'cold-tab', bindToken: token };
  });
  createBridge.mockReturnValueOnce({
    ready: Promise.resolve({ sessionId: 'previous-session', bindToken: 'previous-token' }),
    bindToken: () => token, rebind, close: vi.fn(),
    bridgeAccess: { subscribe: () => () => {}, respondSuccess: async () => {}, respondError: async () => {} },
  });
  const send = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
    if (path === '/api/frontend-sessions/activate') {
      order.push('activate');
      return new Response(null, { status: 204 });
    }
    order.push('action');
    return new Response(`${JSON.stringify({ type: 'result', result: { status: 'completed', output: { clicked: 'post-delete-confirm' } } })}\n`,
      { headers: { 'content-type': 'application/x-ndjson' } });
  });
  const { result, unmount } = renderHook(() => useAgentPageBridge({ createBridge }));
  const content = document.createElement('main');
  const click = vi.fn();
  content.innerHTML = '<button data-agent-element="post-delete-confirm">Delete permanently</button>';
  content.querySelector('button')!.addEventListener('click', click);
  act(() => result.current.setContentEl(content));
  try {
    const pageClick = registerTool.mock.calls.map(([tool]) => tool as WebMcpToolRegistration).find(tool => tool.name === 'page.click')!;
    expect(await pageClick.execute({ handle: 'post-delete-confirm' })).toEqual({ clicked: 'post-delete-confirm' });
    expect(order).toEqual(['activate', 'rebind', 'action']);
    expect(rebind).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]).toEqual(['/api/frontend-sessions/activate', expect.objectContaining({ method: 'POST', credentials: 'same-origin' })]);
    const [path, request] = send.mock.calls[1];
    expect(path).toBe('/api/frontend-sessions/request');
    expect(request).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'x-frontend-tab-id': adminFrontendTabId, 'content-type': 'application/json' } });
    expect(JSON.parse(request!.body as string)).toEqual({ capabilityId: 'page.click', input: { handle: 'post-delete-confirm' }, bindToken: 'private-token-after-activation' });
    expect(click).not.toHaveBeenCalled();
  } finally { unmount(); }
});
