import { createContext, runInContext } from "node:vm";

import { UI_MESSAGE_RECEIVED, UI_MESSAGE_RESPONSE, type UIActionResult, type UIResource } from "#src/assistant/mcp-ui";

/**
 * @file A fake MCP-UI host — the client side of the confirmation protocol, standing in for a real
 * one (Claude, VS Code Copilot, Goose, MCPJam …), none of which is available in this sandbox.
 *
 * It is deliberately NOT a stub that returns a canned action. It takes the ACTUAL HTML the tool
 * returned, executes the dialog's inline script in a sandboxed `node:vm` context against a minimal
 * DOM, dispatches a real click, and captures the `postMessage` the script emits. So a test using it
 * exercises the same code path a real host would: if the dialog stopped posting a well-formed
 * mcp-ui `UIActionResult`, or stopped carrying the confirmation token, these tests fail.
 *
 * What it models, faithfully to mcp-ui's documented client behavior:
 * - renders `resource.text` in a sandboxed frame (here: a `vm` context — no network, no `require`),
 * - listens for the iframe's `window.parent.postMessage`,
 * - answers a message carrying a `messageId` with `ui-message-received`, then `ui-message-response`,
 * - turns a `type: "tool"` action into a follow-up MCP tool call.
 *
 * What it deliberately does NOT model: showing the HTML to the model. That is the point — a real
 * host renders UI for the human only, which is what keeps the confirmation token out of the agent's
 * reach, so a fake that leaked it into the transcript would be testing the wrong protocol.
 */

/** The minimal DOM surface the confirmation dialog's script uses. */
interface FakeElement {
  id: string;
  textContent: string;
  disabled: boolean;
  listeners: Record<string, Array<(event: unknown) => void>>;
  addEventListener(type: string, fn: (event: unknown) => void): void;
}

export interface RenderedDialog {
  /** The raw HTML the host was given (what a human would see rendered). */
  html: string;
  /** Simulates a human clicking a button, returning the mcp-ui action the dialog posted. */
  click(buttonId: "confirm" | "cancel"): UIActionResult;
  /** Reads an element's current text — how the dialog reports progress/outcome to the human. */
  textOf(elementId: string): string;
  /** Delivers a host→iframe message (`ui-message-received` / `ui-message-response`). */
  deliver(message: { type: string; messageId?: string; payload?: unknown }): void;
}

function makeElement(id: string): FakeElement {
  return {
    id,
    textContent: "",
    disabled: false,
    listeners: {},
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

/**
 * Renders a UI resource: extracts its inline script and runs it against a fake DOM.
 *
 * @param resource - The `EmbeddedResource` the tool returned.
 * @throws {Error} If the resource is not a well-formed MCP-UI HTML resource, or carries no script.
 */
export function renderUIResource(resource: UIResource): RenderedDialog {
  if (resource.type !== "resource") throw new Error(`not an embedded resource: ${String(resource.type)}`);
  if (!resource.resource.uri.startsWith("ui://")) {
    throw new Error(`a host only renders ui:// resources, got '${resource.resource.uri}'`);
  }
  if (!resource.resource.mimeType.startsWith("text/html")) {
    throw new Error(`a host only renders HTML resources, got '${resource.resource.mimeType}'`);
  }

  const html = resource.resource.text;
  const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!scriptMatch) throw new Error("the UI resource carries no inline script — it could never post an action back");

  const elements = new Map<string, FakeElement>();
  const elementFor = (id: string): FakeElement => {
    const existing = elements.get(id);
    if (existing) return existing;
    const created = makeElement(id);
    elements.set(id, created);
    return created;
  };

  const posted: UIActionResult[] = [];
  const windowListeners: Array<(event: unknown) => void> = [];

  const sandbox = {
    document: {
      getElementById: (id: string) => elementFor(id),
    },
    window: {
      parent: {
        postMessage: (message: UIActionResult) => {
          posted.push(message);
        },
      },
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        if (type === "message") windowListeners.push(fn);
      },
    },
    String,
    JSON,
    console: { log: () => {}, error: () => {} },
  };

  runInContext(scriptMatch[1], createContext(sandbox), { timeout: 2000 });

  return {
    html,
    click(buttonId) {
      const button = elements.get(buttonId);
      if (!button) throw new Error(`the dialog has no '${buttonId}' button`);
      const handlers = button.listeners.click ?? [];
      if (handlers.length === 0) throw new Error(`'${buttonId}' has no click handler`);
      const before = posted.length;
      for (const handler of handlers) handler({});
      const action = posted[before];
      if (!action) throw new Error(`clicking '${buttonId}' posted no message to the host`);
      return action;
    },
    textOf(elementId) {
      return elements.get(elementId)?.textContent ?? "";
    },
    deliver(message) {
      for (const listener of windowListeners) listener({ data: message });
    },
  };
}

/** Signature of the tool handler the fake host calls back into. */
export type ToolCaller = (toolId: string, input: Record<string, unknown>) => Promise<unknown>;

/**
 * The host's `onUIAction`: turns a `type: "tool"` action into a real follow-up tool call and, since
 * the action carried a `messageId`, answers the iframe with `ui-message-received` then
 * `ui-message-response` — exactly the sequence mcp-ui's client documents.
 *
 * @returns The follow-up call's result, plus the params it was made with (so a test can assert what
 * actually crossed the boundary).
 */
export async function handleUIAction(
  action: UIActionResult,
  dialog: RenderedDialog,
  call: ToolCaller
): Promise<{ result?: unknown; error?: string; params: Record<string, unknown> }> {
  if (action.type !== "tool") {
    throw new Error(`this host only routes 'tool' actions, got '${action.type}'`);
  }

  if (action.messageId) dialog.deliver({ type: UI_MESSAGE_RECEIVED, messageId: action.messageId });

  const params = action.payload.params;
  try {
    const result = await call(action.payload.toolName, params);
    if (action.messageId) dialog.deliver({ type: UI_MESSAGE_RESPONSE, messageId: action.messageId, payload: { response: result } });
    return { result, params };
  } catch (error) {
    const message = (error as Error).message;
    if (action.messageId) dialog.deliver({ type: UI_MESSAGE_RESPONSE, messageId: action.messageId, payload: { error: message } });
    return { error: message, params };
  }
}
