import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createTracker } from "@jini-ai/diagnostics/observability/node";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import express from "express";
import { InMemoryPluginActivationRepo } from "@jini-ai/plugins/host";
import type { ProductAnalyticsPort, ProductEvent } from "@jini-ai/analytics/product";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { registerContentAnalytics } from "../../runtime/composition/content-events.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerPluginSetEnabledRoute } from "../../inbound/admin-http/routes/plugins/set-enabled.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";

/**
 * @file The owner-action product events (provider wave 2): each key admin action makes ONE generic
 * `capture({ name, userId }, { properties? })` on `RouteDeps.tracker` with the signed-in
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
  const deps = { ...createRouteDeps(), tracker: createTracker({ productAnalytics: port }) };
  await registerContentAnalytics({ deps });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const principalId = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json() as { user: { id: string } }).user.id;
  const base = `/api/admin/v1/workspaces/${deps.workspaceId}/posts`;
  const created = await adminFetch(baseUrl, cookie, base, { method: "POST", body: { title: "Hello" } });
  assert.equal(created.status, 201);
  const { post: { id, version } } = await created.json() as { post: { id: string; version: number } };
  assert.deepEqual(events, [{ name: "post_created", userId: principalId, properties: {
    eventId: `${id}-content.created-${version}`, resourceKind: "post", resourceId: id, source: "admin", initialStatus: "draft",
  } }]);
  const published = await adminFetch(baseUrl, cookie, `${base}/${id}`, { method: "PUT", body: { title: "Hello", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "published", expectedVersion: version } });
  assert.equal(published.status, 200, await published.clone().text());
  const again = await adminFetch(baseUrl, cookie, `${base}/${id}`, { method: "PUT", body: { title: "Hello again", slug: "hello", bodyJson: { type: "doc", content: [] }, status: "published", expectedVersion: (await published.json() as { post: { version: number } }).post.version } });
  assert.equal(again.status, 200, await again.clone().text());
  assert.deepEqual(events.map((event) => event.name), ["post_created", "content_saved", "post_published", "content_saved"]);
  assert.deepEqual(events[2], { name: "post_published", userId: principalId, properties: {
    eventId: `${id}-entry.published-${version + 1}`, resourceKind: "post", resourceId: id, source: "admin",
  } });
});

test("assistant_chat_started on a new chat, carrying no chat text", async (t) => {
  const { port, events } = recording();
  const deps = { ...createRouteDeps(), tracker: createTracker({ productAnalytics: port }) };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const response = await adminFetch(baseUrl, cookie, "/api/assistant/chats", { method: "POST", body: { firstMessage: "my private question" } });
  assert.equal(response.status, 201);
  assert.deepEqual(events.map(({ name }) => name), ["assistant_chat_started"]);
  const { conversation } = await response.json() as { conversation: { id: string } };
  assert.deepEqual(events[0]!.properties, { chatSurface: "admin", conversationId: conversation.id, source: "admin", eventId: `assistant-chat:${conversation.id}` });
  assert.ok(!JSON.stringify(events).includes("private"));
});

test("site_publish_started when an owner starts a publish run", async (t) => {
  const { port, events } = recording();
  const publishOutputRootDir = path.join(tmpdir(), `tovu-owner-events-publish-${process.pid}`);
  t.after(() => rmSync(publishOutputRootDir, { recursive: true, force: true }));
  const base = createRouteDeps();
  // The hermetic site has consent on by default without a ready privacy page, which refuses every
  // publish (409); this test is about the event, so readiness is stubbed as passing.
  const deps = { ...base, tracker: createTracker({ productAnalytics: port }), publishOutputRootDir, siteConsent: { ...base.siteConsent!, deploymentCheck: async () => null } };
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

test("plugin_toggled identifies the plugin family and direction without settings", async (t) => {
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
    tracker: createTracker({ productAnalytics: port }),
  });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  for (const enabled of [true, false]) {
    const response = await adminFetch(baseUrl, cookie, `/api/admin/v1/workspaces/${baseDeps.workspaceId}/plugins/word-count`, { method: "PATCH", body: { enabled } });
    assert.equal(response.status, 200, await response.clone().text());
  }
  assert.deepEqual(events.map(({ name, properties }) => [name, properties]), [
    ["plugin_toggled", { enabled: true, pluginId: "word-count", pluginKind: "cms", source: "admin" }],
    ["plugin_toggled", { enabled: false, pluginId: "word-count", pluginKind: "cms", source: "admin" }],
  ]);
});
