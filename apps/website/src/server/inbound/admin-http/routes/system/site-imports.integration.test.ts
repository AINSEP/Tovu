/** Approved round17 B: principal/session/Origin setup boundary, raw authenticated upload.
 * Baseline RED: route family and needs-owner handoff absent. Never executes source markup.
 */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSiteImportRoutes } from "./site-imports.js";
import type { SiteImportBackend } from "#src/features/site-backup/import-backend";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";

test("B raw upload and setup routes reject unauthorized principals, machine credentials and foreign origins", async t => {
  const calls: string[] = [];
  let allowed = true;
  const id = "00000000-0000-4000-8000-000000000001";
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (!req.get("x-principal")) { res.sendStatus(401); return; }
    res.locals.principal = { id: req.get("x-principal") };
    res.locals.authCredentialKind = req.get("x-kind") ?? "session";
    next();
  });
  const backend = {
    upload: async ({ archive, principalId }: { archive: Buffer; principalId: string }) => { assert.ok(Buffer.isBuffer(archive)); calls.push("upload:" + principalId); return { uploadId: id }; },
    get: ({ principalId }: { principalId: string }) => {
      if (principalId !== "recipient") throw new SiteShareRefusal({ code: "NOT_FOUND", message: "Import not found." });
      return { importId: id, state: "needs-owner" };
    },
    completeOwner: async ({ principalId, adminPassword }: { principalId: string; adminPassword: string }) => { assert.equal(adminPassword, "new-password"); calls.push("owner:" + principalId); return { state: "ready" }; },
  } as unknown as SiteImportBackend;
  registerAdminSiteImportRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed, reason: "test" }), siteImportBackend: backend } });
  const origin = await startTestServer(app, t), root = origin + "/api/admin/v1/workspaces/ws/site-imports";
  const headers = { "x-principal": "recipient", "content-type": "application/zip" };
  assert.equal((await fetch(root + "/uploads", { method: "POST", body: Buffer.from("zip") })).status, 401);
  allowed = false;
  assert.equal((await fetch(root + "/uploads", { method: "POST", headers, body: Buffer.from("zip") })).status, 403);
  assert.deepEqual(calls, []);
  allowed = true;
  assert.equal((await fetch(root + "/uploads", { method: "POST", headers, body: Buffer.from("zip") })).status, 201);
  assert.equal((await fetch(root + "/" + id + "/owner", { headers: { "x-principal": "other" } })).status, 404);
  assert.equal((await fetch(root + "/" + id + "/owner", { headers: { "x-principal": "recipient", "x-kind": "api_key" } })).status, 403);
  const setup = await fetch(root + "/" + id + "/owner", { headers: { "x-principal": "recipient" } });
  assert.equal(setup.headers.get("cache-control"), "no-store");
  assert.equal((await setup.json()).ownerSetup.field, "adminPassword");
  const finish = (originHeader: string) => fetch(root + "/" + id + "/owner", { method: "POST", headers: { "x-principal": "recipient", origin: originHeader, "content-type": "application/json" }, body: JSON.stringify({ adminPassword: "new-password" }) });
  assert.equal((await finish("https://foreign.example")).status, 403);
  assert.deepEqual(calls, ["upload:recipient"]);
  assert.equal((await finish(origin)).status, 200);
  assert.deepEqual(calls, ["upload:recipient", "owner:recipient"]);
});
