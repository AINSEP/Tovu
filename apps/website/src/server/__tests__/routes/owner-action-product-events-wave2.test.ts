import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createFormsModule } from "../../runtime/composition/modules/forms.js";
import { createTracker } from "@jini-ai/diagnostics/observability/node";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import express from "express";
import type { ProductAnalyticsPort, ProductEvent } from "@jini-ai/analytics/product";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "@jini-ai/cms/forms";
import type { PluginInstallPreview } from "@jini-ai/plugins/host/node";

import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { createRateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { FORMS_SUBMIT_PROFILE } from "#src/features/forms/rate-limit-profile";
import { createSitePluginPolicy } from "#src/features/plugin-runtime/install";
import type { SiteImportBackend } from "#src/features/site-backup/import-backend";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { registerContentAnalytics } from "../../runtime/composition/content-events.js";
import { withToolUseEvents } from "../../runtime/composition/tool-use-events.js";
import { registerPluginInstallRoutes } from "../../inbound/admin-http/routes/plugins/install.js";
import { registerAdminSiteImportRoutes } from "../../inbound/admin-http/routes/system/site-imports.js";
import { registerFormsSubmitRoute } from "../../inbound/public-http/routes/site/forms-submit.js";
import { bootAuthenticated, startTestServer } from "../helpers/http-test-server.js";

/**
 * @file The second wave of owner-action product events (provider wave 2): each is ONE generic
 * `capture({ name, userId, properties? })` with an opaque id and small fixed properties. Every
 * request below also carries a secret-looking header and value, which must never reach an event.
 * Consent and PII rules are the port's own (`withProductAnalyticsGuards`); a recording fake stands in.
 */

function recording(): { port: ProductAnalyticsPort; events: ProductEvent[] } {
  const events: ProductEvent[] = [];
  return { events, port: { capture: (event) => { events.push(event); }, identify: () => {} } };
}

// Built at runtime so no secret-shaped literal sits in the repo.
const secret = ["sk", "live", "W".repeat(12) + "x".repeat(12)].join("_");
const assertNoSecret = (events: readonly ProductEvent[]) => assert.ok(!JSON.stringify(events).includes(secret), "an event carries the secret");

function adminFetch(baseUrl: string, cookie: string, url: string, init: { method: string; body?: unknown }) {
  return fetch(`${baseUrl}${url}`, { method: init.method, headers: { cookie, "content-type": "application/json", authorization: `Bearer ${secret}` },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }) });
}

async function bootApp(t: TestContext, extra: Partial<ReturnType<typeof createRouteDeps>> = {}) {
  const { port, events } = recording();
  const base = createRouteDeps();
  const deps = { ...base, tracker: createTracker({ productAnalytics: port }), ...extra };
  await registerContentAnalytics({ deps });
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const principalId = (await (await fetch(`${baseUrl}/api/admin/v1/auth/me`, { headers: { cookie } })).json() as { user: { id: string } }).user.id;
  return { deps, events, baseUrl, cookie, principalId, ws: `/api/admin/v1/workspaces/${deps.workspaceId}` };
}

async function pollUntilSettled(baseUrl: string, cookie: string, url: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if ((await (await fetch(`${baseUrl}${url}`, { headers: { cookie } })).json() as { status: string }).status !== "running") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

test("page_created, then page_published once on the draft → published transition only", async (t) => {
  const { events, baseUrl, cookie, principalId, ws } = await bootApp(t);
  const created = await adminFetch(baseUrl, cookie, `${ws}/pages`, { method: "POST", body: { title: `About ${secret}` } });
  assert.equal(created.status, 201, await created.clone().text());
  const { post: { id, version } } = await created.json() as { post: { id: string; version: number } };
  const publish = (expectedVersion: number) => adminFetch(baseUrl, cookie, `${ws}/pages/${id}`, { method: "PUT",
    body: { title: "About", slug: "about-events-wave2", bodyJson: { type: "doc", content: [] }, status: "published", expectedVersion } });
  const published = await publish(version);
  assert.equal(published.status, 200, await published.clone().text());
  assert.equal((await publish((await published.json() as { post: { version: number } }).post.version)).status, 200);
  assert.deepEqual(events, [
    { name: "page_created", userId: principalId, properties: { eventId: `${id}-content.created-${version}`, resourceKind: "page", resourceId: id, source: "admin", initialStatus: "draft" } },
    { name: "content_saved", userId: principalId, properties: { eventId: `${id}-content.saved-${version + 1}`, resourceKind: "page", resourceId: id, source: "admin", initialStatus: "published" } },
    { name: "page_published", userId: principalId, properties: { eventId: `${id}-entry.published-${version + 1}`, resourceKind: "page", resourceId: id, source: "admin" } },
  ]);
  assertNoSecret(events);
});

test("media_uploaded carries the media family and a size bucket, never the name or bytes", async (t) => {
  const { events, baseUrl, cookie, principalId, ws } = await bootApp(t);
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const response = await adminFetch(baseUrl, cookie, `${ws}/media`, { method: "POST", body: { filename: `${secret}.png`, contentType: "image/png", dataBase64: png, alt: secret } });
  assert.equal(response.status, 201, await response.clone().text());
  assert.deepEqual(events, [{ name: "media_uploaded", userId: principalId, properties: { kind: "image", bytesBucket: "<100KB", source: "admin" } }]);
  assertNoSecret(events);
});

test("theme_changed carries the newly active theme id", async (t) => {
  const { events, baseUrl, cookie, principalId, ws } = await bootApp(t);
  const { availableThemeIds } = await (await adminFetch(baseUrl, cookie, `${ws}/presentation`, { method: "GET" })).json() as { availableThemeIds: string[] };
  const themeId = availableThemeIds[0]!;
  const response = await adminFetch(baseUrl, cookie, `${ws}/presentation`, { method: "PATCH", body: { activeThemeId: themeId } });
  assert.equal(response.status, 200, await response.clone().text());
  assert.deepEqual(events, [{ name: "theme_changed", userId: principalId, properties: { themeId, source: "admin" } }]);
  assertNoSecret(events);
});

test("site_exported once the export run settles, with its outcome", async (t) => {
  const exportOutputRootDir = path.join(tmpdir(), `tovu-owner-events-export-${process.pid}`);
  t.after(() => rmSync(exportOutputRootDir, { recursive: true, force: true }));
  const { events, baseUrl, cookie, principalId, ws } = await bootApp(t, { exportOutputRootDir });
  assert.equal((await adminFetch(baseUrl, cookie, `${ws}/system/export`, { method: "POST", body: {} })).status, 202);
  await pollUntilSettled(baseUrl, cookie, `${ws}/system/export`);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.name, "site_exported");
  assert.equal(events[0]!.userId, principalId);
  assert.ok(["completed", "errored"].includes(String(events[0]!.properties?.outcome)));
});

test("deploy_finished once the publish run settles, with its target and outcome", async (t) => {
  const publishOutputRootDir = path.join(tmpdir(), `tovu-owner-events-deploy-${process.pid}`);
  t.after(() => rmSync(publishOutputRootDir, { recursive: true, force: true }));
  const base = createRouteDeps();
  // Consent readiness stubbed as passing, as in the first wave's publish test.
  const { events, baseUrl, cookie, ws } = await bootApp(t, { publishOutputRootDir, siteConsent: { ...base.siteConsent!, deploymentCheck: async () => null } });
  const trigger = await adminFetch(baseUrl, cookie, `${ws}/system/publish`, { method: "POST", body: { target: "github-pages", owner: "octo", repo: "demo-repo", projectName: "demo" } });
  assert.equal(trigger.status, 202);
  await pollUntilSettled(baseUrl, cookie, `${ws}/system/publish`);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events.map(({ name }) => name), ["site_publish_started", "deploy_finished"]);
  assert.equal(events[1]!.properties?.target, "github-pages");
  assert.ok(["completed", "errored"].includes(String(events[1]!.properties?.outcome)));
});

test("form_submitted on a consented public submission: committed ids under a request-local visitor id", async (t) => {
  const { port, events } = recording();
  const definitionRepo = new InMemoryFormDefinitionRepo();
  const now = "2026-10-25T00:00:00.000Z";
  await definitionRepo.create({ id: "def-1", workspaceId: "ws", name: "Contact", slug: "contact", fields: [{ id: "name", label: "Name", type: "text", required: true }],
    notify: { enabled: false, recipients: [] }, status: "active", createdAt: now, updatedAt: now, version: 1 });
  const clock = { nowMs: () => Date.parse(now), nowIso: () => now };
  let counter = 0;
  const app = express();
  app.use(express.json());
  const bus = new InMemoryEventBus();
  const submissionRepo = new InMemoryFormSubmissionRepo();
  const tracker = createTracker({ productAnalytics: port });
  const consentProof = { receiptId: "receipt-1", policyVersion: "policy-1" };
  const visitorAnalyticsDeliveryAllowed = async ({ proof }: { proof: typeof consentProof }) => { assert.deepEqual(proof, consentProof); return true; };
  createFormsModule({ bus, tracker, visitorAnalyticsDeliveryAllowed, formDefinitionRepo: definitionRepo,
    formSubmissionRepo: submissionRepo, mailer: { capabilities: () => ({ driver: "memory", supportsIdempotencyKey: false,
      supportsWebhookFeedback: false, maxBatchSize: 1, supportsAttachments: false }), send: async () => { throw new Error("notifications disabled"); }, sendBatch: async () => { throw new Error("notifications disabled"); } },
  }).start?.();
  registerFormsSubmitRoute(app, { workspaceId: "ws", tracker, idGen: { newId: () => "request-1" },
    visitorAnalyticsProof: async () => consentProof, visitorAnalyticsDeliveryAllowed, submitForm: {
    definitionRepo, submissionRepo, outbox: new InMemoryOutbox(), bus, clock,
    idGen: { newId: () => `id-${++counter}` }, rateLimiter: createRateLimiter({ profile: FORMS_SUBMIT_PROFILE, clock }),
  } });
  const baseUrl = await startTestServer(app, t);
  const response = await fetch(`${baseUrl}/forms/contact/submit`, { method: "POST", headers: { "content-type": "application/json", cookie: `session=${secret}` }, body: JSON.stringify({ name: secret }) });
  assert.equal(response.status, 201);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, [{ name: "form_submitted", userId: "visitor:request-1", properties: { eventId: "id-2", formId: "def-1", deliveryMode: "live" } }]);
  assertNoSecret(events);
});

test("plugin_installed on an install (never a preview), with the plugin id", async (t) => {
  const { port, events } = recording();
  const previous = process.env.TOVU_PLUGIN_LOCAL_INSTALL;
  process.env.TOVU_PLUGIN_LOCAL_INSTALL = "1";
  t.after(() => { if (previous === undefined) delete process.env.TOVU_PLUGIN_LOCAL_INSTALL; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = previous; });
  const digest = `sha256-${"a".repeat(64)}`;
  const plugin: PluginInstallPreview = { id: "acme-forms", name: "Acme", version: "1.0.0", tier: "tier-3", capabilities: [], hooks: [], hasCode: true, digest, contentTypes: [], conflicts: [] };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner-1" }; next(); });
  app.use(express.json());
  registerPluginInstallRoutes(app, { workspaceId: "ws", tracker: createTracker({ productAnalytics: port }), authorize: async () => ({ allowed: true, reason: "ok" }),
    pluginSourcePolicy: createSitePluginPolicy({ env: { NODE_ENV: "production", TOVU_PLUGIN_LOCAL_INSTALL: "1" } }),
    pluginInstaller: { preview: async () => plugin, install: async () => plugin } });
  const baseUrl = await startTestServer(app, t);
  const post = (suffix: string, body: unknown) => fetch(`${baseUrl}/api/admin/v1/workspaces/ws/plugins/install${suffix}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${secret}` }, body: JSON.stringify(body) });
  assert.equal((await post("/preview", { source: { kind: "folder", path: `/srv/${secret}` } })).status, 200);
  assert.equal((await post("", { source: { kind: "folder", path: `/srv/${secret}` }, expectedDigest: digest })).status, 201);
  assert.deepEqual(events, [{ name: "plugin_installed", userId: "owner-1", properties: { pluginId: "acme-forms", pluginKind: "cms", source: "admin" } }]);
});

test("staging a backup that needs an owner emits no site_imported event before the site commits", async (t) => {
  const { port, events } = recording();
  const view = { importId: "00000000-0000-4000-8000-000000000001", source: { url: `https://share.example/site.zip?token=${secret}` }, newSiteId: null, newSiteName: null, state: "needs-owner" as const, status: "needs-owner" as const, createdAt: "2026-10-25", instructions: "Choose an owner password" };
  const backend = { importBackup: async () => view } as unknown as SiteImportBackend;
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "recipient" }; res.locals.authCredentialKind = "session"; next(); });
  registerAdminSiteImportRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }), siteImportBackend: backend, tracker: createTracker({ productAnalytics: port }) } });
  const origin = await startTestServer(app, t);
  const response = await fetch(`${origin}/api/admin/v1/workspaces/ws/site-imports`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(view.source) });
  assert.equal(response.status, 200, await response.clone().text());
  // The shared import backend owns capture after completeOwner commits; the route cannot announce staging.
  assert.deepEqual(await response.json(), view);
  assert.deepEqual(events, []);
});

test("assistant_tool_used once per settled tool attempt: tool id and outcome only; an invented tool is 'unknown'", async () => {
  const { port, events } = recording();
  const appended: string[] = [];
  const sink = withToolUseEvents({ tracker: createTracker({ productAnalytics: port }), sink: {
    append: async (required) => { appended.push(required.phase); },
    appendCommitted: async (required) => { appended.push(required.phase); return true; },
  } });
  const attempt = { attemptId: "a", executionId: null, workspaceId: "ws", runId: "r", principalId: "owner-1", at: "2026-10-25T00:00:00.000Z" };
  await sink.append({ ...attempt, toolId: "posts_create", phase: "requested" });
  await sink.append({ ...attempt, toolId: "posts_create", phase: "completed" }, { detail: `keys:${secret}` });
  await sink.append({ ...attempt, attemptId: "unknown-attempt", toolId: `made_up_${secret}`, phase: "unknown-tool" });
  assert.deepEqual(appended, ["requested", "completed", "unknown-tool"], "the audit trail itself is unchanged");
  assert.deepEqual(events, [
    { name: "assistant_tool_used", userId: "owner-1", properties: { toolId: "posts_create", outcome: "completed", chatSurface: "admin", attemptId: "a", eventId: "assistant-tool:a" } },
    { name: "assistant_tool_used", userId: "owner-1", properties: { toolId: "unknown", outcome: "unknown-tool", chatSurface: "admin", attemptId: "unknown-attempt", eventId: "assistant-tool:unknown-attempt" } },
  ]);
});
