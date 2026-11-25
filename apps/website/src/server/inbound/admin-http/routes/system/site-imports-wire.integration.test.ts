import { createNoopTracker } from "@jini-ai/diagnostics/observability";
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSiteImportRoutes } from "./site-imports.js";
import { type SiteImportBackend } from "@jini-ai/devops/backup/site/import-backend";

/**
 * @file Pins the exact status and body of every refusal and gate answer on the site-import routes
 * (`site-imports.ts`), so the split of the framework-neutral decisions into `@jini-ai/cms` cannot
 * remap one. The sibling integration test covers the success paths and the redacted incident body.
 */

const id = "00000000-0000-4000-8000-000000000001";
const unexpected = (name: string) => () => assert.fail(`unexpected ${name}`);
const view = { importId: id, hasEncryptedKeys: true, state: "needs-owner" };

function appWith(backend: SiteImportBackend | undefined, workspaceId = "ws") {
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "recipient" }; res.locals.authCredentialKind = "session"; next(); });
  registerAdminSiteImportRoutes({ app, deps: { workspaceId, tracker: createNoopTracker({}), authorize: async () => ({ allowed: true, reason: "test" }), siteImportBackend: backend } });
  return app;
}

const backend = {
  tidy: unexpected("tidy"), listPage: unexpected("list"), list: unexpected("list"), importBackup: unexpected("import"), completeOwner: unexpected("owner completion"), upload: unexpected("upload"),
  get: () => view,
} as unknown as SiteImportBackend;

async function answer(response: Response) { return { status: response.status, body: await response.json() }; }

test("site-import gate refusals answer fixed bodies: foreign workspace 404 and missing backend 503, per step", async t => {
  const origin = await startTestServer(appWith(backend), t), root = origin + "/api/admin/v1/workspaces/other/site-imports";
  assert.deepEqual(await answer(await fetch(root)), { status: 404, body: { code: "NOT_FOUND", message: "Import history failed: this workspace is not available." } });
  assert.deepEqual(await answer(await fetch(root + "/uploads", { method: "POST", headers: { "content-type": "application/zip" }, body: "zip" })), { status: 404, body: { code: "NOT_FOUND", message: "ZIP upload failed: this workspace is not available." } });
  const noBackend = await startTestServer(appWith(undefined), t), ownRoot = noBackend + "/api/admin/v1/workspaces/ws/site-imports";
  assert.deepEqual(await answer(await fetch(ownRoot)), { status: 503, body: { code: "UNAVAILABLE", message: "Import history requires local site creation and a configured sites home." } });
  assert.deepEqual(await answer(await fetch(`${ownRoot}/${id}/owner`)), { status: 503, body: { code: "UNAVAILABLE", message: "Import owner setup requires local site creation and a configured sites home." } });
});

test("site-import owner setup: GET answers the contract incl. saved-keys field; POST refuses extra fields with the fixed 400", async t => {
  const origin = await startTestServer(appWith(backend), t), root = origin + "/api/admin/v1/workspaces/ws/site-imports/" + id + "/owner";
  assert.deepEqual(await answer(await fetch(root)), { status: 200, body: { ...view, ownerSetup: { method: "POST", field: "adminPassword", username: "admin", sessionRequired: true, savedKeysPasswordField: "savedKeysPassword" } } });
  const post = (body: string) => fetch(root, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body });
  assert.deepEqual(await answer(await post("adminPassword=x&extra=1")), { status: 400, body: { code: "INVALID_INPUT", message: "Imported site creation failed: Only the new owner password and optional saved keys password are accepted." } });
  assert.deepEqual(await answer(await fetch(root, { method: "POST", headers: { origin: "https://foreign.example", "content-type": "application/x-www-form-urlencoded" }, body: "adminPassword=x" })), { status: 403, body: { code: "FORBIDDEN", message: "Import owner setup failed: submit this form from the same signed-in Tovu site." } });
});

test("site-import upload refusals: compressed body 400 and second concurrent upload 409 carry their fixed bodies", async t => {
  let release!: () => void, entered!: () => void;
  const holding = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  let uploads = 0;
  const slow = { ...backend, upload: async () => { uploads++; if (uploads === 1) { entered(); await holding; } return { uploadId: "u" }; } } as unknown as SiteImportBackend;
  const origin = await startTestServer(appWith(slow), t), root = origin + "/api/admin/v1/workspaces/ws/site-imports/uploads";
  const post = (extra: Record<string, string> = {}) => fetch(root, { method: "POST", headers: { "content-type": "application/zip", ...extra }, body: "zip" });
  assert.deepEqual(await answer(await post({ "content-encoding": "gzip" })), { status: 400, body: { code: "IMPORT_FAILED", message: "ZIP upload failed: send an uncompressed request body." } });
  const first = post(); await started;
  assert.deepEqual(await answer(await post()), { status: 409, body: { code: "BUSY", message: "Another ZIP upload is running." } });
  release(); assert.equal((await first).status, 201);
});


test("site import paging preserves gate precedence and private response headers", async t => {
  let allowed = false;
  let publishTrust = false;
  let available = true;
  const calls: unknown[] = [];
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "recipient" }; if (publishTrust) res.locals.publishTrust = { sourceInstallationId: "source", capabilities: [], entityTypes: [], generation: 1 }; next(); });
  registerAdminSiteImportRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed, reason: "test" }), get siteImportBackend() { return available ? { ...backend, listPage: async input => { calls.push(input); return { imports: [], nextCursor: "next" }; } } : undefined; } } });
  const origin = await startTestServer(app, t);
  const root = origin + "/api/admin/v1/workspaces/ws/site-imports";
  for (const [url, status] of [[root.replace("/ws/", "/foreign/") + "?extra=1", 404], [root + "?extra=1", 403]] as const) {
    const response = await fetch(url);
    assert.equal(response.status, status);
    for (const [name, value] of [["cache-control", "no-store"], ["x-content-type-options", "nosniff"], ["x-robots-tag", "noindex, nofollow"], ["referrer-policy", "no-referrer"]]) assert.equal(response.headers.get(name!), value);
  }
  allowed = true; available = false;
  assert.equal((await fetch(root + "?extra=1")).status, 503);
  available = true;
  publishTrust = true;
  const grantRefusal = await fetch(root + "?extra=1");
  assert.equal(grantRefusal.status, 403, "a publishing grant cannot inherit the principal's system.read permission");
  assert.equal(grantRefusal.headers.get("cache-control"), "no-store");
  publishTrust = false;
  for (const query of ["extra=1", "cursor=a&cursor=b", "cursor[]=a", "cursor="]) {
    const response = await fetch(root + "?" + query);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: "INVALID_CURSOR", message: "Import history failed: This list of imports changed. Reload it to see the newest imports." });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.deepEqual(calls, []);
  const response = await fetch(root + "?cursor=abc");
  assert.deepEqual(await response.json(), { imports: [], nextCursor: "next" });
  assert.deepEqual(calls, [{ principalId: "recipient", cursor: "abc" }]);
});
