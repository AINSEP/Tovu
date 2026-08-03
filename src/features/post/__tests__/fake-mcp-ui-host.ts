import { createContext, runInContext } from "node:vm";

import {
  createJsonRpcError,
  createJsonRpcResult,
  isJsonRpcRequest,
  JSON_RPC_ERROR_CODES,
  MCP_UI_PROTOCOL_VERSION,
  MCP_UI_VIEW_METHODS,
  MCP_UI_VIEW_NOTIFICATIONS,
  type JsonRpcMessage,
  type JsonRpcRequest,
} from "@jini-ai/ui/mcp-ui/surfaces";

import type { UIResource } from "#src/assistant/mcp-ui";

/**
 * @file A fake MCP-UI Host — the client side of the confirmation protocol, standing in for a real
 * one (`useMcpUiHost`, or a real MCP client embedding it), neither of which is available in this
 * sandbox.
 *
 * ## 2026-08-03: rewritten to speak the real protocol
 *
 * This file used to simulate the legacy `@mcp-ui/client` community-SDK dialect — a bare
 * `window.postMessage({type:'tool', messageId, payload})`, answered with `ui-message-received`/
 * `ui-message-response`. That dialect is what `delete-confirmation-ui.ts` emitted before ADR-053
 * Decision 2 (2026-08-03), and it is NOT what it emits now. That earlier rewrite moved
 * `delete-confirmation-ui.ts` onto `@jini-ai/ui/mcp-ui/surfaces`'s `buildConfirmationSurface`, whose
 * generated document speaks the real MCP Apps handshake (`bridge.ts`'s `renderBridgeScript`: a View
 * sends `ui/initialize`, a Host answers it, the View confirms with `ui/notifications/initialized`,
 * and only THEN does a click's `tools/call` request get sent) — the exact handshake
 * `useMcpUiHost.ts` implements. This file was never updated for that, so it silently broke every
 * test that used it: `document.getElementById('confirm')` found nothing, because the new HTML
 * identifies its buttons by a `data-mcpui-action="confirm"` attribute instead of an `id`, and a bare
 * `postMessage` action is not what the new bridge sends at all. Found and reported during a
 * 2026-08-03 dispatch on an unrelated feature (MCP-UI confirmation redemption); fixed here, on
 * request, because a broken protocol double meant this suite's SECURITY assertions (e.g. "a denied
 * principal cannot complete the delete even holding a valid token") had not actually been exercised
 * since that rewrite landed.
 *
 * It is still deliberately NOT a stub that returns a canned action: it takes the ACTUAL HTML the tool
 * returned, runs its two inline scripts (the protocol bridge, then the surface's own script) in a
 * sandboxed `node:vm` context against a minimal DOM, and drives a REAL `ui/initialize` →
 * `ui/notifications/initialized` → `tools/call` JSON-RPC exchange — the same message shapes
 * `useMcpUiHost.ts` sends and expects, built with the SAME helpers (`createJsonRpcResult`,
 * `createJsonRpcError`, `isJsonRpcRequest`, the `MCP_UI_VIEW_METHODS`/`MCP_UI_VIEW_NOTIFICATIONS`/
 * `JSON_RPC_ERROR_CODES` vocabulary), imported from `@jini-ai/ui/mcp-ui/surfaces` rather than
 * hand-rolled, so this fake cannot silently drift from what the real Host actually sends.
 *
 * ## How closely this matches `useMcpUiHost.ts`, and where it still diverges
 *
 * Matches:
 * - The state machine and its two request-refusal branches: a request before `ui/initialize` is
 *   answered gets `invalidRequest` ("Handshake has not started..."); one after that but before
 *   `ui/notifications/initialized` gets `invalidRequest` ("Handshake not complete...") — same
 *   messages, same error code, same ordering as `useMcpUiHost.ts`'s `handleRequest`.
 * - `ui/initialize`'s response shape: `{protocolVersion, hostInfo, hostContext, hostCapabilities: {}}`,
 *   matching `answerInitialize`'s exact fields (values differ — a fake `hostInfo`/`hostContext` — but
 *   the View never asserts specific values, only that the fields exist).
 * - `tools/call` handling: extracts `{name, arguments}`, calls the supplied executor, and answers
 *   with `createJsonRpcResult`/`createJsonRpcError(..., JSON_RPC_ERROR_CODES.internalError, ...)` —
 *   the identical pair `handleToolCall` uses, including the SAME error code for a rejected call.
 * - Any other method not implemented by this fake falls through to `methodNotFound`, matching the
 *   real Host's default; lifecycle notifications (`size-changed`, `request-teardown`) are accepted
 *   and observed rather than causing a crash, matching how a real Host tolerates them even when it
 *   does nothing interesting with the value.
 *
 * Diverges, disclosed rather than silently assumed equivalent:
 * - **No `event.source` identity check.** `useMcpUiHost.ts` authenticates an inbound message by
 *   comparing `event.source` against its own iframe's `contentWindow` — there is exactly one "frame"
 *   in this sandbox and no way to forge a second one, so that check has nothing to prove here. A
 *   real browser's `postMessage` targeting/identity behavior is NOT exercised by this fake.
 *   `MCP_UI_VIEW_SANDBOX`'s `allow-scripts`-only iframe sandbox (opaque origin, no storage, no
 *   same-origin DOM access) is likewise not exercised — this is `node:vm`, not a browser sandbox.
 * - **No teardown request/response cycle, no timeouts.** `requestTeardown`/`DEFAULT_TEARDOWN_TIMEOUT_MS`/
 *   `DEFAULT_INITIALIZED_TIMEOUT_MS` are real Host behavior this fake does not implement — a stuck
 *   handshake here fails fast with a clear "never became ready" error instead of a 4s timeout, and a
 *   View's own `ui/notifications/request-teardown` (sent after every successful click, per the
 *   generated script) is accepted and ignored rather than causing the frame to be removed.
 * - **`ui/notifications/size-changed` is observed but not asserted.** `document.documentElement` in
 *   this fake DOM has no real layout, so the reported size is always `{width:0, height:0}` — harmless
 *   (the real Host's `onSizeChanged` guards on `typeof === 'number'`, which this satisfies) but not a
 *   meaningful signal.
 * - **Single View, single Host, in-process.** No `srcdoc` iframe, no cross-realm boundary, no actual
 *   postMessage serialization — messages are passed as live JS object references. A real
 *   `structuredClone`-style serialization boundary (which would reject a function or a class
 *   instance riding along in `params`) is not exercised.
 *
 * None of these divergences touch the property this suite actually certifies — that the confirmation
 * token travels only through the rendered UI and that the two-step redemption is genuinely gated —
 * but they are why a passing run here is strong evidence for, not proof of, the browser path working
 * identically.
 */

/** The minimal DOM surface the confirmation dialog's two scripts touch: `getElementById`,
 * `querySelectorAll("[attr]")`, attribute get/set, `textContent`, `disabled`, and click listeners. */
interface FakeElement {
  attributes: Map<string, string>;
  textContent: string;
  disabled: boolean;
  scrollWidth: number;
  scrollHeight: number;
  listeners: Record<string, Array<(event: unknown) => void>>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  addEventListener(type: string, fn: (event: unknown) => void): void;
}

function makeElement(): FakeElement {
  return {
    attributes: new Map(),
    textContent: "",
    disabled: false,
    scrollWidth: 0,
    scrollHeight: 0,
    listeners: {},
    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name)! : null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
    addEventListener(type, fn) {
      const existing = this.listeners[type];
      if (existing) {
        existing.push(fn);
        return;
      }
      this.listeners[type] = [fn];
    },
  };
}

/** One captured, not-yet-answered `tools/call` request — what a click actually sent to the Host. */
export interface DialogAction {
  /** The JSON-RPC request id, needed to correlate a later answer back to this exact call. */
  requestId: string;
  toolName: string;
  params: Record<string, unknown>;
}

export interface RenderedDialog {
  /** The raw HTML the host was given (what a human would see rendered). */
  html: string;
  /**
   * Simulates a human clicking a button. Genuinely drives the click through the real bridge script,
   * up to and including the `tools/call` request it sends — synchronous, because everything up to
   * that point (the handshake having already completed in {@link renderUIResource}, and `api.callTool`
   * posting immediately once `ready`) resolves within the same call stack.
   *
   * Deliberately does NOT execute the tool or answer the request — see {@link handleUIAction} for
   * that. This split is what lets a test (like the replay/binding-mismatch cases) read the params a
   * click WOULD send, including the real token, without the click itself performing the action.
   *
   * @throws {Error} If no button declares `data-mcpui-action="<buttonId>"`, or clicking it produced
   * no `tools/call` (e.g. a bare-dismiss cancel button with no tool action — not exercised by any
   * current caller, so not supported here).
   */
  click(buttonId: "confirm" | "cancel"): DialogAction;
  /** Reads an element's current text — how the dialog reports progress/outcome to the human. */
  textOf(elementId: string): string;
  /**
   * Delivers the Host's answer to a captured `tools/call` request, exactly as
   * `useMcpUiHost.ts`'s `handleToolCall` would (`createJsonRpcResult`/`createJsonRpcError` with
   * `JSON_RPC_ERROR_CODES.internalError`). Framework-internal — {@link handleUIAction} is the
   * intended caller; a test driving the protocol directly may still reach for it.
   */
  respondToToolCall(requestId: string, outcome: { result: unknown } | { error: string }): void;
}

/** One microtask-queue drain — enough for a chain of `.then()`s resolved synchronously earlier
 * (e.g. by {@link RenderedDialog.respondToToolCall}) to actually run and update the DOM. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

type HostState = "awaiting-initialize" | "awaiting-initialized" | "ready";

/**
 * The Host half of the handshake — see this file's header for exactly which parts of
 * `useMcpUiHost.ts` this mirrors and which it does not.
 */
function createFakeHost(deliverToView: (message: JsonRpcMessage) => void) {
  let state: HostState = "awaiting-initialize";
  let resolveReady!: () => void;
  const readyPromise = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  const capturedCalls: JsonRpcRequest[] = [];

  function respondError(id: string, code: number, message: string): void {
    deliverToView(createJsonRpcError(id, code, message));
  }

  function handleRequest(request: JsonRpcRequest): void {
    if (state === "awaiting-initialize") {
      if (request.method !== MCP_UI_VIEW_METHODS.initialize) {
        respondError(String(request.id), JSON_RPC_ERROR_CODES.invalidRequest, "Handshake has not started; call ui/initialize first.");
        return;
      }
      deliverToView(
        createJsonRpcResult(request.id, {
          protocolVersion: MCP_UI_PROTOCOL_VERSION,
          hostInfo: { name: "fake-mcp-ui-host", version: "1" },
          hostContext: { theme: "light", displayMode: "inline" },
          hostCapabilities: {},
        }),
      );
      state = "awaiting-initialized";
      return;
    }

    if (state !== "ready") {
      respondError(String(request.id), JSON_RPC_ERROR_CODES.invalidRequest, `Handshake not complete (state=${state}).`);
      return;
    }

    if (request.method === MCP_UI_VIEW_METHODS.callTool) {
      capturedCalls.push(request);
      // Left pending on purpose — see `RenderedDialog.click`'s doc.
      return;
    }

    respondError(String(request.id), JSON_RPC_ERROR_CODES.methodNotFound, `Host does not implement ${request.method}.`);
  }

  return {
    readyPromise,
    capturedCalls,
    handleMessage(message: JsonRpcMessage): void {
      if (isJsonRpcRequest(message)) {
        handleRequest(message);
        return;
      }
      const method = (message as { method?: unknown }).method;
      if (method === MCP_UI_VIEW_NOTIFICATIONS.initialized) {
        // Mirrors `useMcpUiHost.ts`'s own guard: ignored outside `awaiting-initialized` rather than
        // treated as an error, matching "arrived in state X — ignored" there.
        if (state !== "awaiting-initialized") return;
        state = "ready";
        resolveReady();
        return;
      }
      // `ui/notifications/size-changed` / `ui/notifications/request-teardown` / anything else:
      // observed and ignored — see this file's header on what this fake does not implement.
    },
    respondToToolCall(requestId: string, outcome: { result: unknown } | { error: string }): void {
      if ("error" in outcome) {
        deliverToView(createJsonRpcError(requestId, JSON_RPC_ERROR_CODES.internalError, outcome.error));
        return;
      }
      deliverToView(createJsonRpcResult(requestId, outcome.result));
    },
  };
}

/**
 * Renders a UI resource: runs its bridge + surface scripts against a fake DOM, and drives the real
 * MCP Apps handshake to completion before returning.
 *
 * @param resource - The `EmbeddedResource` the tool returned.
 * @throws {Error} If the resource is not a well-formed MCP-UI HTML resource, carries no scripts, or
 * the handshake never reaches `ready` within 2 seconds (a real protocol failure, not a fixture bug —
 * see this file's header for exactly what "ready" requires).
 */
export async function renderUIResource(resource: UIResource): Promise<RenderedDialog> {
  if (resource.type !== "resource") throw new Error(`not an embedded resource: ${String(resource.type)}`);
  if (!resource.resource.uri.startsWith("ui://")) {
    throw new Error(`a host only renders ui:// resources, got '${resource.resource.uri}'`);
  }
  if (!resource.resource.mimeType.startsWith("text/html")) {
    throw new Error(`a host only renders HTML resources, got '${resource.resource.mimeType}'`);
  }

  const html = resource.resource.text;
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (scripts.length === 0) {
    throw new Error("the UI resource carries no inline script — it could never speak the MCP-UI handshake");
  }

  // Buttons are discovered from the raw markup, not looked up on demand: the new surfaces identify
  // them by `data-mcpui-action="<id>"`, which `document.querySelectorAll("[data-mcpui-action]")`
  // (`SURFACE_SCRIPT_PRELUDE`) reads as a static NodeList at script-load time, before any click.
  const actionIds = [...html.matchAll(/data-mcpui-action="([^"]*)"/g)].map((m) => m[1]);
  const actionButtons = new Map<string, FakeElement>();
  for (const id of actionIds) {
    const element = makeElement();
    element.setAttribute("data-mcpui-action", id);
    actionButtons.set(id, element);
  }

  const idElements = new Map<string, FakeElement>();
  const elementForId = (id: string): FakeElement => {
    const existing = idElements.get(id);
    if (existing) return existing;
    const created = makeElement();
    idElements.set(id, created);
    return created;
  };

  const documentElement = makeElement();

  const windowListeners: Array<(event: unknown) => void> = [];
  function deliverToView(message: JsonRpcMessage): void {
    for (const listener of windowListeners) listener({ data: message });
  }

  const host = createFakeHost(deliverToView);

  const ATTRIBUTE_SELECTOR = /^\[([a-zA-Z-]+)\]$/;
  const sandbox = {
    document: {
      getElementById: (id: string) => elementForId(id),
      querySelectorAll: (selector: string) => {
        // This fake DOM only ever needs to support the one selector shape
        // `SURFACE_SCRIPT_PRELUDE` uses. A different selector is a sign the generated surface
        // changed in a way this fake needs to be taught, not something to silently no-op on.
        const match = ATTRIBUTE_SELECTOR.exec(selector);
        if (!match || match[1] !== "data-mcpui-action") {
          throw new Error(`this fake DOM only supports querySelectorAll("[data-mcpui-action]"), got "${selector}"`);
        }
        return [...actionButtons.values()];
      },
      documentElement,
    },
    window: {
      parent: {
        postMessage: (message: JsonRpcMessage, _targetOrigin: string) => host.handleMessage(message),
      },
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        if (type === "message") windowListeners.push(fn);
      },
    },
    String,
    JSON,
    console: { log: () => {}, error: () => {} },
  };

  runInContext(scripts.join("\n"), createContext(sandbox), { timeout: 2000 });

  const timeout = new Promise<never>((_resolve, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(
            "the MCP-UI handshake never reached 'ready' within 2000ms — either ui/initialize was never " +
              "answered, or ui/notifications/initialized was never sent back",
          ),
        ),
      2000,
    );
  });
  await Promise.race([host.readyPromise, timeout]);

  return {
    html,
    click(buttonId) {
      const button = actionButtons.get(buttonId);
      if (!button) {
        throw new Error(`the dialog has no '${buttonId}' button (no element declares data-mcpui-action="${buttonId}")`);
      }
      const handlers = button.listeners.click ?? [];
      if (handlers.length === 0) throw new Error(`'${buttonId}' has no click handler`);
      const before = host.capturedCalls.length;
      for (const handler of handlers) handler({ currentTarget: button });
      const request = host.capturedCalls[before];
      if (!request) {
        throw new Error(
          `clicking '${buttonId}' sent no tools/call request to the host — a bare-dismiss action with no ` +
            `tool (a PLAN step of null) is not supported by this fake, since no current caller needs it`,
        );
      }
      const params = request.params as { name: string; arguments: Record<string, unknown> };
      return { requestId: String(request.id), toolName: params.name, params: params.arguments };
    },
    textOf(elementId) {
      return idElements.get(elementId)?.textContent ?? "";
    },
    respondToToolCall(requestId, outcome) {
      host.respondToToolCall(requestId, outcome);
    },
  };
}

/** Signature of the tool handler the fake host calls back into. */
export type ToolCaller = (toolId: string, input: Record<string, unknown>) => Promise<unknown>;

/**
 * Answers a captured {@link DialogAction} by actually calling `call`, then delivers the outcome back
 * into the rendered dialog exactly as a real Host's `handleToolCall` would — so the dialog's own
 * status text (`setStatus`) genuinely updates, the same way `useMcpUiHost.ts` driving a real
 * `onToolCall` would leave it.
 *
 * @returns The follow-up call's result, plus the params it was made with (so a test can assert what
 * actually crossed the boundary).
 */
export async function handleUIAction(
  action: DialogAction,
  dialog: RenderedDialog,
  call: ToolCaller,
): Promise<{ result?: unknown; error?: string; params: Record<string, unknown> }> {
  try {
    const result = await call(action.toolName, action.params);
    dialog.respondToToolCall(action.requestId, { result });
    await flushMicrotasks();
    return { result, params: action.params };
  } catch (error) {
    const message = (error as Error).message;
    dialog.respondToToolCall(action.requestId, { error: message });
    await flushMicrotasks();
    return { error: message, params: action.params };
  }
}
