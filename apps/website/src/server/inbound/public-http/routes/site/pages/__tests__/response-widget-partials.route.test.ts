import "../../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import { CACHE_CONTROL_PUBLIC_PAGE } from "../request-policy.js";
import { sendPublicPage } from "../response.js";

/**
 * @file A public page with plugin widget-partial markers is finished by the real `sendPublicPage`:
 * each named marker is expanded with the enabled plugin's validated server fragment, through the
 * marker reader, validator and partial expander `response.ts` wires (not a test copy of them).
 */

const marker = (config: Record<string, string>) => `<div data-embed-config='${JSON.stringify(config)}'></div>`;
const PAGE = `<html><head></head><body><main>${marker({ type: "partial", id: "promo-banner" })}${marker({ type: "partial" })}</main></body></html>`;
const WORKSPACE = "ws-widgets";

/** One plugin contributing the `promo-banner` widget; activation and widget output are per test. */
function widgetDeps({ enabled, widgetHtml }: { enabled: boolean; widgetHtml: string }, _options = {}) {
  const renderCalls: { pluginId: string; workspaceId: string }[] = [];
  const activationLookups: { workspaceId: string; pluginId: string }[] = [];
  const snapshot = {
    pluginId: "promo-plugin", sdk: {},
    widgets: [{ name: "promo-banner", render: ({ pluginId, auth }: { pluginId: string; auth: { workspaceId: string } }) => { renderCalls.push({ pluginId, workspaceId: auth.workspaceId }); return widgetHtml; } }],
  };
  const deps = portFake<RouteDeps>({
    workspaceId: WORKSPACE,
    clock: { nowMs: () => 1_764_000_000_000 },
    pluginContributions: { list: () => [snapshot] },
    pluginActivationRepo: { getActivation: async (args: { workspaceId: string; pluginId: string }) => { activationLookups.push(args); return { enabled }; } },
  });
  return { deps, renderCalls, activationLookups };
}

async function servePage(t: test.TestContext, deps: RouteDeps, _options = {}) {
  const app = express();
  app.get("/", (req, res, next) => { sendPublicPage({ req, res, deps, html: PAGE, perVisitor: { cacheControl: CACHE_CONTROL_PUBLIC_PAGE, result: undefined } }).catch(next); });
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
  return { status: res.status, body: await res.text() };
}

test("an enabled plugin's widget fragment replaces its named partial marker in the sent page", async (t) => {
  const { deps, renderCalls, activationLookups } = widgetDeps({ enabled: true, widgetHtml: "<p class=\"promo\"><strong>Winter sale</strong></p>" });
  const { status, body } = await servePage(t, deps);
  assert.equal(status, 200);
  assert.match(body, /<main><p class="promo"><strong>Winter sale<\/strong><\/p>/);
  assert.doesNotMatch(body, /"id":"promo-banner"/, "the named marker is consumed by the expansion");
  // The widget ran once for this workspace, after its activation was checked in that workspace.
  assert.deepEqual(renderCalls, [{ pluginId: "promo-plugin", workspaceId: WORKSPACE }]);
  assert.deepEqual(activationLookups[0], { workspaceId: WORKSPACE, pluginId: "promo-plugin" });
});

test("a disabled plugin's widget never renders into the page", async (t) => {
  const { deps, renderCalls } = widgetDeps({ enabled: false, widgetHtml: "<strong>Winter sale</strong>" });
  const { status, body } = await servePage(t, deps);
  assert.equal(status, 200);
  assert.deepEqual(renderCalls, []);
  assert.doesNotMatch(body, /Winter sale/);
});

test("a widget fragment the server validator rejects (a script) is rendered empty, not sent", async (t) => {
  const warnings: unknown[][] = [];
  t.mock.method(console, "warn", (...args: unknown[]) => { warnings.push(args); });
  const { deps, renderCalls } = widgetDeps({ enabled: true, widgetHtml: "<script>steal()</script><strong>Winter sale</strong>" });
  const { status, body } = await servePage(t, deps);
  assert.equal(status, 200);
  assert.equal(renderCalls.length, 1);
  assert.doesNotMatch(body, /steal\(\)|Winter sale/);
  assert.equal(warnings.length, 1);
  assert.match(String(warnings[0]?.[0]), /promo-plugin.*promo-banner/);
});
