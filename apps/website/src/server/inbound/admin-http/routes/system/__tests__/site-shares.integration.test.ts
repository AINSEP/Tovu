import assert from "node:assert/strict";
import test from "node:test";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { registerAdminSiteShareRoutes } from "../site-shares.js";
import { registerPublicShareRoutes } from "#src/server/inbound/public-http/routes/site-share";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";
import { SiteShareRegistry } from "#src/features/site-backup/share-registry";
import { createSiteShare } from "#src/features/site-backup/share-service";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";

test("share routes validate sources and authorize before effects, preserve downloads, and sanitize every backend failure", async t => {
  const directory = fs.mkdtempSync(path.join(tmpdir(), "share-route-gaps-")); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const registry = new SiteShareRegistry({ directory }), calls: unknown[] = [];
  let available = true, allowed = true, trusted = false, failure: unknown;
  const record = await createSiteShare({ registry, site: "ws", name: "site", archive: Buffer.from("PK ZIP artifact") });
  const backend = { registry,
    list: async (input: unknown) => { calls.push(["list", input]); if (failure) throw failure; return []; },
    create: async (input: { principalId: string; jobId?: string; signal: AbortSignal }) => { calls.push(["create", { ...input, signal: input.signal instanceof AbortSignal }]); if (failure) throw failure; return { status: "active" }; },
    revoke: async (input: { shareId: string }) => { calls.push(["revoke", input]); if (failure) throw failure; return { status: "revoked" }; },
  };
  const app = express(); app.use(express.json({ strict: false }));
  registerPublicShareRoutes({ app, registry });
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; if (trusted) res.locals.publishTrust = { sourceInstallationId: "source", capabilities: ["publish_content.apply"], entityTypes: [], generation: 1 }; next(); });
  registerAdminSiteShareRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed, reason: "test" }), get siteShareBackend() { return available ? backend : undefined; } } as unknown as RouteDeps });
  const base = await startTestServer(app, t), root = base + "/api/admin/v1/workspaces/ws/site-shares";
  const post = (body: unknown) => fetch(root, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await fetch(root.replace("workspaces/ws/", "workspaces/other/"))).status, 404);
  available = false; assert.equal((await fetch(root)).status, 503); available = true;
  allowed = false; assert.equal((await fetch(root)).status, 403); assert.equal((await post({})).status, 403); allowed = true;
  trusted = true; assert.equal((await fetch(root)).status, 403); assert.equal((await post({})).status, 403); trusted = false;
  assert.deepEqual(calls, []);
  assert.deepEqual(await (await fetch(root)).json(), { shares: [] });
  assert.deepEqual(calls.pop(), ["list", {}]);
  for (const body of [[], "text", 1, { other: true }, { jobId: 1 }, { jobId: "bad-id" }, { jobId: "A".repeat(36) }]) { const result = await post(body); assert.equal(result.status, 400); assert.equal((await result.json()).code, "INVALID_INPUT"); }
  assert.deepEqual(calls, []);
  const jobId = randomUUID(); assert.deepEqual(await (await post({ jobId })).json(), { status: "active" });
  assert.deepEqual(calls.pop(), ["create", { principalId: "owner", jobId, signal: true }]);
  assert.equal((await fetch(root, { method: "POST" })).status, 200);
  assert.deepEqual(calls.pop(), ["create", { principalId: "owner", signal: true }]);
  assert.deepEqual(await (await fetch(root + "/" + record.shareId, { method: "DELETE" })).json(), { status: "revoked" });
  assert.deepEqual(calls.pop(), ["revoke", { shareId: record.shareId }]);
  const download = await fetch(root + "/" + record.shareId + "/download");
  assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), Buffer.from("PK ZIP artifact"));
  assert.equal(download.headers.get("content-disposition"), 'attachment; filename="site.tovu.zip"');
  assert.equal(download.headers.get("cache-control"), "no-store");
  assert.equal((await fetch(root + "/" + randomUUID() + "/download")).status, 404);
  const missing = await createSiteShare({ registry, site: "ws", name: "missing", archive: Buffer.from("PK zip") }); await registry.deleteArtifact(missing);
  assert.equal((await fetch(root + "/" + missing.shareId + "/download")).status, 404);
  await registry.disable({ shareId: record.shareId, site: "ws" });
  assert.equal((await fetch(root + "/" + record.shareId + "/download")).status, 404);
  for (const fault of [new Error("SECRET disk details"), new SiteShareRefusal({ code: "NOT_FOUND", message: "Share not found." }), new SiteShareRefusal({ code: "BUSY", message: "Export busy" })]) {
    failure = fault;
    for (const response of [await fetch(root), await post({}), await fetch(root + "/" + record.shareId, { method: "DELETE" })]) {
      assert.equal(response.status, fault instanceof SiteShareRefusal && fault.code === "NOT_FOUND" ? 404 : 400);
      assert.deepEqual(await response.json(), fault instanceof SiteShareRefusal ? { code: fault.code, message: fault.message } : { code: "SHARE_FAILED", message: "Share operation failed. Check storage configuration and retry." });
    }
  }
  failure = undefined;
  const token = "a".repeat(16), artifact = root + "/artifacts/" + token + "/received.tovu.zip";
  for (const [url, body, type] of [[artifact.replace(token, "bad"), Buffer.from([80, 75, 3, 4]), "application/zip"], [artifact.replace("received.tovu.zip", "bad.zip"), Buffer.from([80, 75, 3, 4]), "application/zip"], [artifact, "{}", "application/json"], [artifact, "PK", "application/zip"], [artifact, "BAD ZIP", "application/zip"]] as const) {
    const response = await fetch(url, { method: "PUT", headers: { "content-type": type }, body }); assert.equal(response.status, 400); assert.equal((await response.json()).code, "INVALID_INPUT");
  }
  assert.equal((await fetch(artifact, { method: "DELETE" })).status, 404);
  const zip = Buffer.from([80, 75, 3, 4, 5, 6]);
  const received = await fetch(artifact, { method: "PUT", headers: { "content-type": "application/zip" }, body: zip });
  assert.equal(received.status, 201); const payload = await received.json(); assert.equal(payload.bytes, zip.length); assert.match(payload.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(fs.readFileSync(registry.artifactPath({ shareId: payload.shareId })), zip);
  assert.equal((await fetch(artifact, { method: "PUT", headers: { "content-type": "application/zip" }, body: zip })).status, 400, "token replay cannot replace an artifact");
  assert.equal((await fetch(artifact, { method: "DELETE" })).status, 204);
  assert.equal(await registry.findToken({ token, file: "received.tovu.zip" }), null);
  assert.equal(fs.existsSync(registry.artifactPath({ shareId: payload.shareId })), false);
  const external = await createSiteShare({ registry, site: "ws", name: "remote", archive: zip });
  await registry.put({ record: { ...external, storage: { provider: "s3-compatible", key: "private" } } });
  assert.equal((await fetch(`${base}/_share/${external.token}/${external.file}`)).status, 404, "public runtime must not proxy a remote storage export");
});

test("public share namespace terminates safely when no registry is configured", async t => {
  const app = express(); registerPublicShareRoutes({ app });
  const base = await startTestServer(app, t);
  for (const method of ["GET", "HEAD", "POST"]) {
    const response = await fetch(`${base}/_share/${"a".repeat(16)}/site.tovu.zip`, { method });
    assert.equal(response.status, 404); assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("share creation accepts a non-UUID job id (reported, not fixed)", async t => {
  const created: Array<{ principalId: string; jobId?: string; signal: AbortSignal }> = [];
  const create: NonNullable<RouteDeps["siteShareBackend"]>["create"] = async input => {
    created.push(input);
    return { status: "active" };
  };
  const app = express(); app.use(express.json({ strict: false }));
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  const ports = { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "fixture" }) } satisfies Pick<RouteDeps, "workspaceId" | "authorize">;
  registerAdminSiteShareRoutes({ app, deps: { ...ports, siteShareBackend: { create } } as RouteDeps });
  const base = await startTestServer(app, t), root = `${base}/api/admin/v1/workspaces/ws/site-shares`;
  for (const body of [null, {}, { jobId: "-".repeat(36) }]) {
    const response = await fetch(root, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { status: "active" });
  }
  assert.deepEqual(created.map(({ principalId, jobId, signal }) => ({ principalId, jobId, signal: signal instanceof AbortSignal })), [
    { principalId: "owner", jobId: undefined, signal: true }, { principalId: "owner", jobId: undefined, signal: true },
    { principalId: "owner", jobId: "-".repeat(36), signal: true },
  ]);
});

test("share artifact routes admit a connected-computer grant, and every route refuses or sanitizes before effects", async t => {
  let allowed = true, trusted = false, authorizeFault: unknown, registryFault: unknown;
  const effects: string[] = [];
  const registry = portFake<SiteShareRegistry>({
    directory: "/nonexistent",
    get: async () => { effects.push("get"); if (registryFault) throw registryFault; return null; },
    list: async () => { effects.push("list"); if (registryFault) throw registryFault; return []; },
  });
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; if (trusted) res.locals.publishTrust = { sourceInstallationId: "source", capabilities: ["publish_content.apply"], entityTypes: [], generation: 1 }; next(); });
  registerAdminSiteShareRoutes({ app, deps: portFake<RouteDeps>({ workspaceId: "ws", siteShareBackend: { registry },
    authorize: async () => { if (authorizeFault) throw authorizeFault; return { allowed, reason: "test" }; } }) });
  const root = (await startTestServer(app, t)) + "/api/admin/v1/workspaces/ws/site-shares";
  const artifact = root + "/artifacts/" + "a".repeat(16) + "/received.tovu.zip";
  const sanitized = { code: "SHARE_FAILED", message: "Share operation failed. Check storage configuration and retry." };

  // A publishing grant (not RBAC) answers for the artifact routes: it reaches the registry.
  trusted = true;
  assert.equal((await fetch(artifact, { method: "DELETE" })).status, 404);
  assert.deepEqual(effects.splice(0), ["list"]);
  trusted = false;

  allowed = false;
  assert.equal((await fetch(root + "/share-1/download")).status, 403);
  assert.equal((await fetch(artifact, { method: "DELETE" })).status, 403);
  assert.deepEqual(effects, []);
  allowed = true;

  authorizeFault = new Error("SECRET authorizer detail");
  const put = await fetch(artifact, { method: "PUT", headers: { "content-type": "application/zip" }, body: Buffer.from([80, 75, 3, 4]) });
  assert.equal(put.status, 400); assert.deepEqual(await put.json(), sanitized);
  authorizeFault = undefined;

  registryFault = new Error("SECRET disk detail");
  for (const response of [await fetch(root + "/share-1/download"), await fetch(artifact, { method: "DELETE" })]) {
    assert.equal(response.status, 400); assert.deepEqual(await response.json(), sanitized);
  }
  assert.deepEqual(effects, ["get", "list"]);
});
