import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentPluginConnectCard } from "../../connect-card-ui.js";

/**
 * @file Regression: the connect card's sign-in button did nothing. The card's bridge posted
 * `ui/open-link` as a JSON-RPC NOTIFICATION (no `id`), but `@mcp-ui/client`'s AppBridge registers
 * `ui/open-link` with `setRequestHandler`, so an id-less message reaches no handler and is dropped
 * silently — the admin's `onOpenLink` never fires. This runs the card's REAL inline scripts against
 * a fake window, clicks the button, and asserts what reaches the Host is a request it will answer.
 */

interface Posted {
  readonly jsonrpc?: string;
  readonly id?: unknown;
  readonly method?: string;
  readonly params?: unknown;
}

function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
}

/** Mounts a surface's scripts, completes the handshake, clicks the one action button, and returns what was posted. */
async function clickOpenLink(html: string): Promise<Posted | undefined> {
  const posted: Posted[] = [];
  const listeners: ((event: { data: unknown; source: unknown; origin: string }) => void)[] = [];
  const clicks: (() => void)[] = [];
  const button = { disabled: false, addEventListener: (_type: string, fn: () => void) => clicks.push(fn) };
  const fakeWindow: Record<string, unknown> = {
    parent: { postMessage: (message: Posted) => posted.push(message) },
    addEventListener: (_type: string, fn: (event: { data: unknown; source: unknown; origin: string }) => void) => listeners.push(fn),
  };
  const fakeDocument = {
    documentElement: { scrollWidth: 320, scrollHeight: 200, setAttribute: () => {} },
    getElementById: () => ({ textContent: "", setAttribute: () => {} }),
    querySelectorAll: (selector: string) => selector === "[data-mcpui-action]" && /<button[^>]*data-mcpui-action="open-link"/.test(html) ? [button] : [],
  };
  for (const source of inlineScripts(html)) {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    new Function("window", "document", "ResizeObserver", source)(fakeWindow, fakeDocument, undefined);
  }
  const initialize = posted.find((message) => message.method === "ui/initialize");
  assert.ok(initialize?.id, "the bridge must start a handshake");
  assert.equal(clicks.length, 1, "the card must wire exactly one open-link button");
  clicks[0]!();
  assert.equal(posted.filter((message) => message.method === "ui/open-link").length, 0, "a pre-handshake click must wait for the Host");
  for (const fn of listeners) fn({ source: fakeWindow.parent, origin: "https://host.example", data: { jsonrpc: "2.0", id: initialize.id, result: {} } });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(clicks.length, 1, "the card must wire exactly one open-link button");
  assert.equal(posted.filter((message) => message.method === "ui/open-link").length, 1, "the held click must be delivered once after the handshake");
  return posted.find((message) => message.method === "ui/open-link");
}

const SIGN_IN = "https://api.supabase.com/v1/oauth/authorize?client_id=x";

test("the generic connect card's sign-in button sends ui/open-link as a request the Host answers", async () => {
  const card = buildAgentPluginConnectCard({ pluginId: "supabase", pluginDisplayName: "Supabase", state: "waiting", signInUrl: SIGN_IN });
  const open = await clickOpenLink(card.resource.text as string);
  assert.deepEqual(open, { jsonrpc: "2.0", id: open?.id, method: "ui/open-link", params: { url: SIGN_IN } });
  assert.equal(typeof open?.id, "string", "an id-less ui/open-link is a notification AppBridge drops silently");
});
