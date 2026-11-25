import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import type { RouteErrorPorts } from "@jini-ai/core/contracts/server";
import { NOOP_OPERATION_TRACKER } from "@jini-ai/core/errors/reporter";
import { rejectRoute } from "@jini-ai/core/errors/route-refusal";
import { CONTENT_ENTRY_MAX_BODY_BYTES } from "@jini-ai/cms/admin-http/limits";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";
import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
import { registerAdminPostCreateRoute } from "#src/server/runtime/composition/modules/posts";
import { registerAdminMenuUpdateTreeRoute } from "#src/server/runtime/composition/modules/menus";
import { registerAdminApiKeyIssueRoute } from "../routes/api-keys/issue.js";
import { mountChatCleanup } from "#src/server/runtime/composition/modules/assistant-chats";
import { mountStorageRoutes, storageOwnerFrom } from "#src/server/runtime/composition/modules/storage-routes";
import { startServingRoutines } from "#src/server/runtime/composition/modules/serving-routines";
import { ROUTINE_ROUTE_BASE } from "#src/server/runtime/composition/modules/assistant-routines";
import { registerOwnerRecoveryRoutes } from "../owner-recovery-routes.js";
import { registerPublicMemberSignOutRoute } from "#src/server/runtime/composition/modules/public-members";
import { registerHealthRoute } from "#src/server/runtime/composition/modules/core";
import { adminSameOriginWrites, mountAdminJsonRoute } from "../admin-json-route-ports.js";
import { fakeAdminApp, listen } from "./fixtures/port-harness.js";

test("post create rejects over-cap before starting a route operation, and admits the same binding below cap", async (t) => {
  const fixture = createRouteIncidentReporter();
  const operations: unknown[] = [];
  const errors: RouteErrorPorts = { ...fixture.errors, observability: { trackOperation: (input) => { operations.push(input); return NOOP_OPERATION_TRACKER; } } };
  const app = express();
  app.use(express.json({ limit: "15mb" }));
  registerAdminPostCreateRoute({ app, errors, deps: { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }) } as never });
  const server = await listen({ app });
  t.after(server.close);
  const path = "/api/admin/v1/workspaces/local/posts";
  const above = await server.call(path, { method: "POST", body: JSON.stringify({ pad: "x".repeat(CONTENT_ENTRY_MAX_BODY_BYTES) }) });
  assert.deepEqual(above, { status: 413, body: { error: "Content too large to save.", code: "PAYLOAD_TOO_LARGE" } });
  assert.deepEqual(operations, []);
  assert.deepEqual(await server.call("/api/admin/v1/workspaces/other/posts", { method: "POST", body: "{}" }), { status: 404, body: { error: "workspace was not found" } });
  assert.deepEqual(operations, [{ name: "http.route", attributes: { "http.method": "POST", "http.route": "/api/admin/v1/workspaces/:workspaceId/posts" } }]);
});

test("menu update retains its two authorization sources with the site route binding", async (t) => {
  const fixture = createRouteIncidentReporter();
  const operations: unknown[] = [];
  const errors: RouteErrorPorts = { ...fixture.errors, observability: { trackOperation: (input) => { operations.push(input); return NOOP_OPERATION_TRACKER; } } };
  const app = fakeAdminApp();
  app.use((_req, res, next) => { res.locals.publishTrust = { sourceInstallationId: "src", capabilities: ["pages.edit_html"], entityTypes: [], generation: 1 }; next(); });
  const asked: string[] = [];
  registerAdminMenuUpdateTreeRoute({ app, errors, deps: { workspaceId: "local", authorize: async ({ permission }: { permission: string }) => { asked.push(permission); return { allowed: true, reason: "matched" }; }, clock: { nowMs: () => 0 }, idGen: { newId: () => "menu-id" }, outbox: { enqueue: async () => {} }, menuRepo: { findById: async () => null } } as never });
  const server = await listen({ app });
  t.after(server.close);
  const answer = await server.call("/api/admin/v1/workspaces/local/menus/m1", { method: "PUT", body: JSON.stringify({ expectedVersion: 1, mode: "html", html: "<p>test</p>" }) });
  assert.equal(answer.status, 404);
  assert.deepEqual(asked, ["admin.menus.update"]);
  assert.deepEqual(operations, [{ name: "http.route", attributes: { "http.method": "PUT", "http.route": "/api/admin/v1/workspaces/:workspaceId/menus/:menuId" } }]);
  assert.equal(fixture.entries.length, 0);
});

test("API-key issue keeps its refusal and records no credential in the bound route operation", async (t) => {
  const fixture = createRouteIncidentReporter();
  const operations: unknown[] = [];
  const errors: RouteErrorPorts = { ...fixture.errors, observability: { trackOperation: (input) => { operations.push(input); return NOOP_OPERATION_TRACKER; } } };
  const app = fakeAdminApp();
  registerAdminApiKeyIssueRoute({ app, errors, deps: { workspaceId: "local" } as never });
  const server = await listen({ app });
  t.after(server.close);
  const refused = await server.call("/api/admin/v1/api-keys", { method: "POST", headers: { "x-kind": "api_key", authorization: "Bearer inert-test-credential" }, body: "{}" });
  assert.equal(refused.status, 403);
  assert.deepEqual(refused.body, { error: "api-key credentials may not manage api keys; use an admin session", code: "FORBIDDEN", details: { permission: "apikey.manage", reason: "credential_kind_not_permitted" } });
  assert.deepEqual(operations, [{ name: "http.route", attributes: { "http.method": "POST", "http.route": "/api/admin/v1/api-keys" } }]);
  assert.doesNotMatch(JSON.stringify(operations), /inert-test-credential/);
  assert.equal(fixture.entries.length, 0);
});

test("chat cleanup uses the injected route binding and preserves the owner check", async (t) => {
  const fixture = createRouteIncidentReporter();
  const operations: unknown[] = [];
  const errors: RouteErrorPorts = { ...fixture.errors, observability: { trackOperation: (input) => { operations.push(input); return NOOP_OPERATION_TRACKER; } } };
  const app = fakeAdminApp();
  let cleanupCalls = 0;
  mountChatCleanup({ app,
    ownerStoreFor: () => { cleanupCalls += 1; assert.fail("a cross-owner request cannot reach cleanup"); },
    ownerCheck: () => rejectRoute({ status: 404, error: "not found" }),
    openConversations: async () => new Set<string>(),
    previewStore: createCleanupPreviewStore({ randomToken: () => "preview", mono: () => 1 }),
    adminPorts: { mount: mountAdminJsonRoute, errors, deps: { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }) }, origin: adminSameOriginWrites },
  });
  const server = await listen({ app });
  t.after(server.close);
  assert.deepEqual(await server.call("/api/assistant/chats/cleanup/preview", { method: "POST", headers: { origin: server.base }, body: JSON.stringify({ before: 1 }) }), { status: 404, body: { error: "not found" } });
  assert.equal(cleanupCalls, 0);
  assert.deepEqual(operations, [{ name: "http.route", attributes: { "http.method": "POST", "http.route": "/api/assistant/chats/cleanup/preview" } }]);
});

test("storage cleanup keeps the owner-only refusal and uses its injected route binding", async (t) => {
  const fixture = createRouteIncidentReporter();
  const operations: unknown[] = [];
  const errors: RouteErrorPorts = { ...fixture.errors, observability: { trackOperation: (input) => { operations.push(input); return NOOP_OPERATION_TRACKER; } } };
  const app = fakeAdminApp();
  mountStorageRoutes({ app, storage: undefined, authorizeOwner: storageOwnerFrom({ ownerPrincipalId: async () => "owner" }), adminPorts: { mount: mountAdminJsonRoute, errors, deps: { workspaceId: "local", authorize: async () => ({ allowed: true, reason: "ok" }) }, origin: adminSameOriginWrites } });
  const server = await listen({ app });
  t.after(server.close);
  const refused = await server.call("/api/admin/storage/cleanup", { method: "POST", headers: { origin: server.base, "x-kind": "session" }, body: "{}" });
  assert.deepEqual(refused, { status: 403, body: { code: "OWNER_ONLY", error: "Only the site owner can see or clean up this site's storage." } });
  assert.deepEqual(operations, [{ name: "http.route", attributes: { "http.method": "POST", "http.route": "/api/admin/storage/cleanup" } }]);
  assert.equal(fixture.entries.length, 0);
});

test("the routine route uses the serving-site reporter without changing admission", async (t) => {
  const fixture = createRouteIncidentReporter();
  const operations: unknown[] = [];
  const errors: RouteErrorPorts = { ...fixture.errors, observability: { trackOperation: (input) => { operations.push(input); return NOOP_OPERATION_TRACKER; } } };
  const router = express.Router();
  const serving = startServingRoutines({ routeDeps: { workspaceId: "local", adminAssistantEnabled: true, authorize: async () => ({ allowed: true, reason: "ok" }) } as never, router, errors, reporter: fixture.reporter, desktopEligible: false, releaseEnabled: false });
  t.after(serving.stop);
  await serving.ready;
  const app = fakeAdminApp();
  app.use(router);
  const server = await listen({ app });
  t.after(server.close);
  const refused = await server.call(ROUTINE_ROUTE_BASE, { headers: { "x-kind": "api_key" } });
  assert.equal(refused.status, 403);
  assert.equal((refused.body?.details as { reason: string }).reason, "credential_kind_not_permitted");
  assert.deepEqual(operations, [{ name: "http.route", attributes: { "http.method": "GET", "http.route": ROUTINE_ROUTE_BASE } }]);
  assert.equal(fixture.entries.length, 0);
});

test("health keeps visitor-safe copy and records one matching ID when its first write fails", async (t) => {
  const fixture = createRouteIncidentReporter();
  const operations: unknown[] = [];
  const errors: RouteErrorPorts = { ...fixture.errors, observability: { trackOperation: (input) => { operations.push(input); return NOOP_OPERATION_TRACKER; } } };
  const app = express();
  app.use((_req, res, next) => {
    const json = res.json.bind(res);
    let first = true;
    res.json = (body) => { if (first) { first = false; throw new Error("private first-write canary"); } return json(body); };
    next();
  });
  registerHealthRoute({ app, errors });
  const server = await listen({ app });
  t.after(server.close);
  const failed = await server.call("/health");
  assert.equal(failed.status, 500);
  assert.equal(failed.body?.error, "The server couldn’t answer the health check.");
  assert.equal(failed.body?.errorId, fixture.entries[0]?.meta?.errorId);
  assert.equal(fixture.entries.length, 1);
  assert.deepEqual(Object.keys(failed.body ?? {}).sort(), ["error", "errorId"]);
  assert.doesNotMatch(JSON.stringify(failed.body), /private first-write canary/);
  assert.deepEqual(operations, [{ name: "http.route", attributes: { "http.method": "GET", "http.route": "/health" } }]);
});

test("owner recovery raw failure keeps its response and records under the owning auth reporter", async (t) => {
  const fixture = createRouteIncidentReporter();
  const operations: unknown[] = [];
  const errors: RouteErrorPorts = { ...fixture.errors, observability: { trackOperation: (input) => { operations.push(input); return NOOP_OPERATION_TRACKER; } } };
  const app = express();
  app.use((_req, res, next) => {
    const send = res.send.bind(res);
    let first = true;
    res.send = (body) => { if (first) { first = false; throw new Error("private owner write"); } return send(body); };
    next();
  });
  registerOwnerRecoveryRoutes({ app, errors, deps: { workspaceId: "local", ownerPrincipalId: Promise.resolve("owner"), recoveryCodes: {} } as never, authenticate: async () => ({ id: "owner" }), limiter: { check: async () => ({ allowed: true }) }, desktopOwnerReset: false });
  const server = await listen({ app });
  t.after(server.close);
  const response = await server.call("/api/admin/v1/auth/owner-recovery");
  assert.equal(response.status, 500);
  assert.equal(response.body?.code, "RECOVERY_UNAVAILABLE");
  assert.equal(response.body?.errorId, fixture.entries[0]?.meta?.errorId);
  assert.equal(fixture.entries.length, 1);
  assert.deepEqual(operations, [{ name: "http.route", attributes: { "http.method": "GET", "http.route": "/api/admin/v1/auth/owner-recovery" } }]);
});

test("member raw refusal does not record an incident", async (t) => {
  const fixture = createRouteIncidentReporter();
  const app = express();
  registerPublicMemberSignOutRoute({ app, errors: fixture.errors, deps: { workspaceId: "local" } as never });
  const server = await listen({ app });
  t.after(server.close);
  assert.deepEqual(await server.call("/api/members/v1/workspaces/local/sign-out", { method: "POST", headers: { origin: "https://foreign.test" } }), { status: 403, body: { error: "same-origin request required" } });
  assert.equal(fixture.entries.length, 0);
});

