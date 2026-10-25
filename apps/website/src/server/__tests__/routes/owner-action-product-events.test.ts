import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import type { ProductAnalyticsPort, ProductEvent } from "@jini-ai/analytics/product";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerPluginSetEnabledRoute } from "../../inbound/admin-http/routes/plugins/set-enabled.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";

/**
 * @file The owner-action product events (provider wave 2): each key admin action makes ONE generic
 * `capture({ name, userId, properties? })` on `RouteDeps.productAnalytics` with the signed-in
 * principal's opaque id and no content. A recording fake stands in for the port; consent and PII
 * rules are the port's own (`withProductAnalyticsGuards`, tested with the provider selection).
 */

function recording(): { port: ProductAnalyticsPort; events: ProductEvent[] } {
  const events: ProductEvent[] = [];
  return { events, port: { capture: (event) => { events.push(event); }, identify: () => {} } };
}

async function adminFetch(baseUrl: string, cookie: string, url: string, init: { method: string; body?: unknown }) {
  return fetch(`${baseUrl}${url}`, { method: init.method, headers: { cookie, "content-type": "application/json" }, ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
}

test("post_created, then post_published once on the draft → published transition only", async (t) => {
  const { port, events } = recording();
  const deps = { ...createRouteDeps(), productAnalytics: port };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const principalId = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json() as { user: { id: string } }).user.id;
  const base = `/api/admin/v1/workspaces/${deps.workspaceId}/posts`;
  const created = await adminFetch(baseUrl, cookie, base, { method: "POST", body: { title: "Hello" } });
  assert.equal(created.status, 201);
  const { post: { id, version } } = await created.json() as { post: { id: string; version: number } };
  assert.deepEqual(events, [{ name: "post_created", userId: principalId }]);
  const published = await adminFetch(baseUrl, cookie, `${base}/${id}`, { method: "PUT", body: { title: "Hello", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "published", expectedVersion: version } });
  assert.equal(published.status, 200, await published.clone().text());
  const again = await adminFetch(baseUrl, cookie, `${base}/${id}`, { method: "PUT", body: { title: "Hello again", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "published", expectedVersion: (await published.json() as { post: { version: number } }).post.version } });
  assert.equal(again.status, 200, await again.clone().text());
  assert.deepEqual(events.map((event) => event.name), ["post_created", "post_published"]);
  assert.deepEqual(events[1], { name: "post_published", userId: principalId });
});

test("assistant_chat_started on a new chat, carrying no chat text", async (t) => {
  const { port, events } = recording();
  const deps = { ...createRouteDeps(), productAnalytics: port };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const response = await adminFetch(baseUrl, cookie, "/api/assistant/chats", { method: "POST", body: { firstMessage: "my private question" } });
  assert.equal(response.status, 201);
  assert.deepEqual(events.map(({ name }) => name), ["assistant_chat_started"]);
  assert.equal(events[0]!.properties, undefined);
  assert.ok(!JSON.stringify(events).includes("private"));
});

test("site_publish_started when an owner starts a publish run", async (t) => {
  const { port, events } = recording();
  const publishOutputRootDir = path.join(tmpdir(), `tovu-owner-events-publish-${process.pid}`);
  t.after(() => rmSync(publishOutputRootDir, { recursive: true, force: true }));
  const base = createRouteDeps();
  // The hermetic site has consent on by default without a ready privacy page, which refuses every
  // publish (409); this test is about the event, so readiness is stubbed as passing.
  const deps = { ...base, productAnalytics: port, publishOutputRootDir, siteConsent: { ...base.siteConsent!, deploymentCheck: async () => null } };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const trigger = await adminFetch(baseUrl, cookie, `/api/admin/v1/workspaces/${deps.workspaceId}/system/publish`, { method: "POST", body: { target: "github-pages", owner: "octo", repo: "demo-repo", projectName: "demo" } });
  assert.equal(trigger.status, 202);
  assert.deepEqual(events.map(({ name }) => name), ["site_publish_started"]);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const poll = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/publish`, { headers: { cookie } });
    if ((await poll.json() as { status: string }).status !== "running") break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
});

test("plugin_toggled with only the direction, never the plugin id", async (t) => {
  const { port, events } = recording();
  const baseDeps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerPluginSetEnabledRoute(app, {
    workspaceId: baseDeps.workspaceId, authorize: baseDeps.authorize, clock: baseDeps.clock, idGen: baseDeps.idGen,
    changeSets: baseDeps.changeSets, outbox: baseDeps.outbox, pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: async () => [{ id: "word-count", name: "Word Count", version: "1.0.0", source: "built-in", tier: "tier-3", status: "valid", errors: [] }],
    onPluginEnabled: async () => {}, onPluginDisabled: () => {}, removePlugin: baseDeps.removePlugin,
    readPluginPackageFiles: baseDeps.readPluginPackageFiles, previewPluginBeforeSave: baseDeps.previewPluginBeforeSave,
    productAnalytics: port,
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  for (const enabled of [true, false]) {
    const response = await adminFetch(baseUrl, cookie, `/api/admin/v1/workspaces/${baseDeps.workspaceId}/plugins/word-count`, { method: "PATCH", body: { enabled } });
    assert.equal(response.status, 200, await response.clone().text());
  }
  assert.deepEqual(events.map(({ name, properties }) => [name, properties]), [["plugin_toggled", { enabled: true }], ["plugin_toggled", { enabled: false }]]);
  assert.ok(!JSON.stringify(events).includes("word-count"));
});
