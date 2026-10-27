/** Approved round17 B: principal/session/Origin setup boundary, raw authenticated upload.
 * Baseline RED: route family and needs-owner handoff absent. Never executes source markup.
 */
import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { registerAdminSiteImportRoutes } from "./site-imports.js";
import type { SiteImportBackend } from "#src/features/site-backup/import-backend";
import { SiteShareRefusal } from "#src/features/site-backup/share-policy";

// Narrow route probes override only the exercised operation; unexpected backend calls must fail.
const unexpectedBackend: SiteImportBackend = {
  upload: async () => assert.fail("unexpected upload"),
  importBackup: async () => assert.fail("unexpected import"),
  completeOwner: async () => assert.fail("unexpected owner completion"),
  list: async () => assert.fail("unexpected import listing"),
  get: () => assert.fail("unexpected import lookup"),
};

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

test("import routes preserve principal/source contracts and sanitize failures across endpoints", async t => {
  const calls: unknown[] = [];
  let allowed = true, available = true, failure: unknown;
  const view = { importId: "00000000-0000-4000-8000-000000000001", source: { url: "https://share.example/site.zip" }, newSiteId: null, newSiteName: null, state: "needs-owner" as const, status: "needs-owner" as const, createdAt: "2026-10-19", instructions: "Choose an owner password" };
  const backend: SiteImportBackend = {
    list: async input => { calls.push(input); if (failure) throw failure; return [view]; },
    get: input => { calls.push(input); if (failure) throw failure; return view; },
    upload: async input => { calls.push(input); if (failure) throw failure; return { uploadId: view.importId }; },
    importBackup: async (input, options) => { calls.push({ input, signal: options?.signal instanceof AbortSignal }); if (failure) throw failure; return view; },
    completeOwner: async (input, options) => { calls.push({ input, signal: options?.signal instanceof AbortSignal }); if (failure) throw failure; return { ...view, state: "ready", status: "ready" }; },
  };
  const app = express(); app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "recipient" }; res.locals.authCredentialKind = "session"; next(); });
  const deps = { workspaceId: "ws", authorize: async () => ({ allowed, reason: "test" }), get siteImportBackend() { return available ? backend : undefined; } };
  registerAdminSiteImportRoutes({ app, deps });
  const origin = await startTestServer(app, t), root = origin + "/api/admin/v1/workspaces/ws/site-imports";
  const post = (suffix: string, body: unknown) => fetch(root + suffix, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await fetch(root.replace("workspaces/ws/", "workspaces/other/"))).status, 404);
  available = false; assert.equal((await fetch(root)).status, 503); available = true;
  allowed = false; assert.equal((await fetch(root + "/" + view.importId + "/owner")).status, 403);
  assert.equal((await post("", view.source)).status, 403); allowed = true;
  assert.deepEqual(calls, []);
  const listed = await fetch(root); assert.deepEqual(await listed.json(), { imports: [view] });
  for (const [name, value] of [["cache-control", "no-store"], ["x-content-type-options", "nosniff"], ["x-robots-tag", "noindex, nofollow"], ["referrer-policy", "no-referrer"]]) assert.equal(listed.headers.get(name!), value);
  assert.deepEqual(calls.pop(), { principalId: "recipient" });
  assert.deepEqual(await (await post("", { ...view.source, displayName: "Copy", requestId: "retry" })).json(), view);
  assert.deepEqual(calls.pop(), { input: { principalId: "recipient", source: view.source, displayName: "Copy", requestId: "retry" }, signal: true });
  assert.equal((await post("", { path: "/tmp/private.zip" })).status, 400);
  assert.equal((await post("/uploads", { path: "/tmp/private.zip" })).status, 400);
  const owner = "/" + view.importId + "/owner";
  assert.equal((await post(owner, { adminPassword: "new-password", extra: "forbidden" })).status, 400);
  const completed = await fetch(root + owner, { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body: "adminPassword=new-password" });
  assert.equal(completed.status, 200);
  assert.deepEqual(calls.pop(), { input: { principalId: "recipient", importId: view.importId, adminPassword: "new-password" }, signal: true });
  for (const fault of [new Error("SECRET private disk path"), new SiteShareRefusal({ code: "NOT_FOUND", message: "Import not found." }), new SiteShareRefusal({ code: "INVALID_INPUT", message: "Bad archive" })]) {
    failure = fault;
    for (const response of [await fetch(root), await post("", view.source), await fetch(root + owner), await post(owner, { adminPassword: "new-password" }), await fetch(root + "/uploads", { method: "POST", headers: { "content-type": "application/zip" }, body: "PK zip" })]) {
      assert.equal(response.status, fault instanceof SiteShareRefusal && fault.code === "NOT_FOUND" ? 404 : 400);
      assert.deepEqual(await response.json(), fault instanceof SiteShareRefusal ? { code: fault.code, message: fault.message } : { code: "IMPORT_FAILED", message: "Import operation failed. No existing site was changed." });
    }
  }
});

test("upload admission rejects a concurrent body and releases the lane when the first response closes", async t => {
  let release!: () => void, entered!: () => void;
  const holding = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  let uploads = 0;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "recipient" }; next(); });
  const backend: SiteImportBackend = { ...unexpectedBackend, upload: async ({ archive, principalId }) => { assert.deepEqual(archive, Buffer.from("zip")); assert.equal(principalId, "recipient"); uploads++; if (uploads === 1) { entered(); await holding; } return { uploadId: String(uploads) }; } };
  registerAdminSiteImportRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }), siteImportBackend: backend } });
  const root = await startTestServer(app, t) + "/api/admin/v1/workspaces/ws/site-imports/uploads";
  const post = () => fetch(root, { method: "POST", headers: { "content-type": "application/zip" }, body: "zip" });
  const first = post(); await started;
  const concurrent = await post(); assert.equal(concurrent.status, 409); assert.equal((await concurrent.json()).code, "BUSY"); assert.equal(uploads, 1);
  release(); assert.equal((await first).status, 201);
  assert.equal((await post()).status, 201); assert.equal(uploads, 2);
});

test("raw parser refuses compressed uploads, clears admission and reports the real byte cap", { timeout: 30000 }, async t => {
  const { request } = await import("node:http");
  const { SHARE_LIMITS } = await import("#src/features/site-backup/share-policy");
  let uploads = 0;
  const app = express(); app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminSiteImportRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }), siteImportBackend: { ...unexpectedBackend, upload: async () => { uploads++; return { uploadId: "uploaded" }; } } } });
  const root = await startTestServer(app, t) + "/api/admin/v1/workspaces/ws/site-imports/uploads";
  const compressed = await fetch(root, { method: "POST", headers: { "content-type": "application/zip", "content-encoding": "gzip" }, body: "invalid gzip" });
  assert.equal(compressed.status, 400); assert.equal((await compressed.json()).code, "IMPORT_FAILED");
  const length = SHARE_LIMITS.maxArchiveBytes + 1;
  // Stream a repeated chunk rather than allocating a 300 MiB fixture. body-parser drains
  // rejected bodies before responding, so the declared length alone cannot test the cap.
  let response!: Promise<{ status: number; body: string }>;
  const pending = request(root, { method: "POST", headers: { "content-type": "application/zip", "content-length": length } });
  t.after(() => pending.destroy());
  response = new Promise((resolve, reject) => { pending.once("error", reject); pending.once("response", res => { const chunks: Buffer[] = []; res.on("data", chunk => chunks.push(Buffer.from(chunk))); res.once("error", reject); res.once("end", () => resolve({ status: res.statusCode!, body: Buffer.concat(chunks).toString() })); }); });
  const chunk = Buffer.alloc(1024 * 1024);
  for (let sent = 0; sent < length;) { const bytes = chunk.subarray(0, Math.min(chunk.length, length - sent)); sent += bytes.length; if (!pending.write(bytes)) await once(pending, "drain"); }
  pending.end();
  const refused = await response; assert.equal(refused.status, 413);
  assert.deepEqual(JSON.parse(refused.body), { code: "LIMIT_EXCEEDED", message: "ZIP upload exceeds the 300 MiB cap." });
  assert.equal(uploads, 0);
  const accepted = await fetch(root, { method: "POST", headers: { "content-type": "application/zip" }, body: "zip" });
  assert.equal(accepted.status, 201); assert.equal(uploads, 1);
});

test("disconnecting during import cancels the backend signal", async t => {
  let entered!: () => void, cancelled!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), aborted = new Promise<void>(resolve => { cancelled = resolve; });
  let observed: AbortSignal | undefined;
  const backend: SiteImportBackend = { ...unexpectedBackend, importBackup: async (_input, options) => {
    const signal = options?.signal;
    assert.ok(signal, "the route must supply its cancellation signal");
    observed = signal; entered();
    return new Promise<never>((_resolve, reject) => { signal.addEventListener("abort", () => { cancelled(); reject(new SiteShareRefusal({ code: "CANCELLED", message: "Import cancelled" })); }, { once: true }); });
  } };
  const app = express(); app.use(express.json()); app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
  registerAdminSiteImportRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }), siteImportBackend: backend } });
  const root = await startTestServer(app, t) + "/api/admin/v1/workspaces/ws/site-imports";
  const controller = new AbortController();
  const rejected = assert.rejects(fetch(root, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "https://share.example/site.zip" }), signal: controller.signal }), { name: "AbortError" });
  await started; assert.equal(observed?.aborted, false); controller.abort(); await rejected; await aborted; assert.equal(observed?.aborted, true);
});

/** Sends headers plus part of a declared body, then stalls; resolves when the server drops the socket. */
async function stallUpload(url: string): Promise<void> {
  const { request } = await import("node:http");
  const pending = request(url, { method: "POST", headers: { "content-type": "application/zip", "content-length": 10 } });
  const dropped = new Promise<void>(resolve => { pending.once("error", () => resolve()); pending.once("response", res => { res.resume(); res.once("close", () => resolve()); }); });
  pending.write("PK\u0003");
  await dropped;
}

for (const [limit, timings] of [
  ["idle timeout", { uploadIdleMs: 50, uploadDeadlineMs: 60_000 }],
  ["whole-upload deadline", { uploadIdleMs: 60_000, uploadDeadlineMs: 50 }],
] as const) {
  test(`a stalled upload is dropped by the ${limit} and frees the single upload lane`, { timeout: 10_000 }, async t => {
    let uploads = 0;
    const app = express(); app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; next(); });
    registerAdminSiteImportRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }),
      siteImportBackend: { ...unexpectedBackend, upload: async () => { uploads++; return { uploadId: "uploaded" }; } } } }, timings);
    const root = await startTestServer(app, t) + "/api/admin/v1/workspaces/ws/site-imports/uploads";
    await stallUpload(root);
    assert.equal(uploads, 0);
    const next = await fetch(root, { method: "POST", headers: { "content-type": "application/zip" }, body: "zip" });
    assert.equal(next.status, 201); assert.equal(uploads, 1);
  });
}

test("a client that aborts mid-body during owner setup cancels the backend signal", { timeout: 10_000 }, async t => {
  const { request } = await import("node:http");
  let entered!: () => void, cancelled!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), aborted = new Promise<void>(resolve => { cancelled = resolve; });
  const backend: SiteImportBackend = { ...unexpectedBackend, get: () => ({ importId: "00000000-0000-4000-8000-000000000001", source: { url: "https://share.example/site.zip" }, newSiteId: null, newSiteName: null, state: "needs-owner", status: "needs-owner", createdAt: "2026-10-19", instructions: "Choose an owner password" }),
    completeOwner: async (_input, options) => {
      const signal = options?.signal; assert.ok(signal);
      entered();
      return new Promise<never>((_resolve, reject) => { signal.addEventListener("abort", () => { cancelled(); reject(new SiteShareRefusal({ code: "CANCELLED", message: "cancelled" })); }, { once: true }); });
    } };
  const app = express(); app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  registerAdminSiteImportRoutes({ app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }), siteImportBackend: backend } });
  const origin = await startTestServer(app, t);
  // A non-form body is left unparsed by the urlencoded parser, so the handler runs while the request is still incomplete.
  const pending = request(origin + "/api/admin/v1/workspaces/ws/site-imports/00000000-0000-4000-8000-000000000001/owner",
    { method: "POST", headers: { origin, "content-type": "text/plain", "content-length": 64 } });
  pending.once("error", () => {});
  pending.write("partial");
  await started;
  pending.destroy();
  await aborted;
});

test("upload admission failures and a refused owner gate on POST answer without reaching the backend", async t => {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = req.get("x-kind") ?? "session"; next(); });
  registerAdminSiteImportRoutes({ app, deps: { workspaceId: "ws", authorize: async () => { throw new Error("authorizer down at /private/db"); }, siteImportBackend: unexpectedBackend } });
  const origin = await startTestServer(app, t), root = origin + "/api/admin/v1/workspaces/ws/site-imports";
  const upload = await fetch(root + "/uploads", { method: "POST", headers: { "content-type": "application/zip" }, body: "zip" });
  assert.equal(upload.status, 400);
  assert.deepEqual(await upload.json(), { code: "IMPORT_FAILED", message: "Import operation failed. No existing site was changed." });
  const machine = await fetch(root + "/00000000-0000-4000-8000-000000000001/owner", { method: "POST", headers: { origin, "x-kind": "api_key", "content-type": "application/x-www-form-urlencoded" }, body: "adminPassword=x" });
  assert.equal(machine.status, 403);
});
