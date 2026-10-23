import { buildAgentPluginAccessTokenForm } from "../../connect-card-ui.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import path from "node:path";

import { buildAgentPluginConnectCard } from "../../connect-card-ui.js";

// DOM tooling is installed with the admin app, where these cards are hosted.
const { JSDOM } = createRequire(path.resolve(import.meta.dirname, "../../../../../../../apps/admin/package.json"))("jsdom");

/**
 * @file Regression: the connect card's sign-in button did nothing. The card's bridge posted
 * `ui/open-link` as a JSON-RPC NOTIFICATION (no `id`), but `@mcp-ui/client`'s AppBridge registers
 * `ui/open-link` with `setRequestHandler`, so an id-less message reaches no handler and is dropped
 * silently — the admin's `onOpenLink` never fires. This runs the card's REAL inline scripts against
 * a DOM, clicks the actual button, and asserts what reaches the Host is a request it will answer.
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
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://card.example" });
  const host = new JSDOM("", { url: "https://host.example" });
  host.window.postMessage = (message: Posted) => posted.push(JSON.parse(JSON.stringify(message)));
  Object.defineProperty(dom.window, "parent", { value: host.window });
  try {
    for (const source of inlineScripts(html)) dom.window.eval(source);
    const buttons = dom.window.document.querySelectorAll('button[data-mcpui-action="open-link"]');
    assert.equal(buttons.length, 1, "the rendered card must have one sign-in button");
    const button = buttons[0];
    assert.equal(button.textContent.trim(), "Sign in to Supabase");
    const initialize = posted.find((message) => message.method === "ui/initialize");
    assert.ok(initialize?.id, "the bridge must start a handshake");
    button.click();
    assert.equal(posted.filter((message) => message.method === "ui/open-link").length, 0, "a pre-handshake click must wait for the Host");
    dom.window.dispatchEvent(new dom.window.MessageEvent("message", { source: host.window, origin: "https://host.example", data: { jsonrpc: "2.0", id: initialize.id, result: {} } }));
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(posted.filter((message) => message.method === "ui/open-link").length, 1, "the held click must be delivered once after the handshake");
    return posted.find((message) => message.method === "ui/open-link");
  } finally {
    dom.window.close();
    host.window.close();
  }
}

const SIGN_IN = "https://api.supabase.com/v1/oauth/authorize?client_id=x";

test("the generic connect card's sign-in button sends ui/open-link as a request the Host answers", async () => {
  const card = buildAgentPluginConnectCard({ pluginId: "supabase", pluginDisplayName: "Supabase", state: "waiting", signInUrl: SIGN_IN });
  const open = await clickOpenLink(card.resource.text as string);
  assert.deepEqual(open, { jsonrpc: "2.0", id: open?.id, method: "ui/open-link", params: { url: SIGN_IN } });
  assert.equal(typeof open?.id, "string", "an id-less ui/open-link is a notification AppBridge drops silently");
});

test('the sign-in card uses the plugin declaration to explain the connection and permissions', () => {
  const resource = buildAgentPluginConnectCard({ pluginId: 'example', pluginDisplayName: 'Example', state: 'waiting', signInUrl: 'https://example.com/authorize', credentialCard: {
    providerId: 'example', label: 'Example', category: 'general', baseUrl: 'https://example.com', title: 'Connect your media account', intro: 'Create media for this site.', permissions: 'Generation needs a separate write grant.', saveKind: 'oauth',
  } });
  const html = resource.resource.text;
  assert.match(html, /Connect your media account/);
  assert.match(html, /Create media for this site/);
  assert.match(html, /Generation needs a separate write grant/);
  assert.ok(!html.includes("It's free and takes about two minutes."));
});

test('plugin token decoration preserves the token app, cancel action and submission fields', () => {
  const original = buildAgentPluginAccessTokenForm({ pluginDisplayName: 'Example', helpUrl: 'https://example.com/tokens' });
  const decorated = buildAgentPluginAccessTokenForm({ pluginDisplayName: 'Example', helpUrl: 'https://example.com/tokens', credentialCard: { pluginId: 'example', providerId: 'example', label: 'Account', category: 'ops', baseUrl: 'https://example.com', title: 'Plugin account', keyHint: 'Scoped key only', saveKind: 'agent-plugin-token' } });
  assert.deepEqual(decorated.app, original.app);
  assert.equal(decorated.cancelLabel, original.cancelLabel);
  assert.equal(decorated.submitLabel, original.submitLabel);
  assert.deepEqual(decorated.fields.map(field => field.name), ['token']);
  assert.equal(decorated.fields[0].hint, 'Scoped key only');
});
