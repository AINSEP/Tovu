import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createSiteImportBackend, parseSiteImportInput } from "../import-backend.js";
import type { SiteImportRecord } from "../import-registry.js";
import { importFixture, OWNER_PASSWORD } from "./import.fixture.js";

const uploadId = "00000000-0000-4000-8000-000000000001";
for (const input of [null, undefined, [], false, "url", { url: 1 }, { url: "x".repeat(4097) }, { url: "not a URL" }, { url: "https://:password@example.com" }, { url: "https://example.com/#fragment" },
  ...[null, 4, "", " ", "x".repeat(201)].map(displayName => ({ uploadId, displayName })),
  ...[null, 4, "", "bad space", "x".repeat(129)].map(requestId => ({ uploadId, requestId })),
  ...[null, 1, "bad-id", "A".repeat(36)].map(uploadId => ({ uploadId })),
]) test(`input boundary refuses malformed source/options ${JSON.stringify(input)?.slice(0, 75)}`, () => {
  assert.throws(() => parseSiteImportInput({ input }), { code: "INVALID_INPUT" });
});
test("source boundary accepts bounded optional metadata and normalizes HTTPS URLs", () => {
  assert.deepEqual(parseSiteImportInput({ input: { url: "https://EXAMPLE.com", displayName: "Copy", requestId: "retry_1-2" } }), { source: { url: "https://example.com/" }, displayName: "Copy", requestId: "retry_1-2" });
  assert.deepEqual(parseSiteImportInput({ input: { uploadId } }), { source: { uploadId } });
  assert.equal(parseSiteImportInput({ input: { uploadId, displayName: "x".repeat(200), requestId: "x".repeat(128) } }).displayName?.length, 200);
});

test("registry protects principal boundaries, invalid identifiers, unreadable history and private permissions", async t => {
  const h = await importFixture(t), registry = h.registry;
  for (const id of ["../outside", "a".repeat(36), "ABCDEFAB-0000-4000-8000-000000000001"]) assert.throws(() => registry.stagePath({ importId: id }), { code: "INVALID_INPUT" });
  assert.throws(() => registry.get({ importId: randomUUID(), principalId: "owner" }), { code: "NOT_FOUND" });
  const first: SiteImportRecord = { importId: randomUUID(), principalId: "owner", source: { uploadId }, displayName: "Copy", newSiteId: null, newSiteName: null, status: "needs-owner", createdAt: "2020-01-01", expiresAt: Date.now() + 3600000 };
  const second = { ...first, importId: randomUUID(), principalId: "other", createdAt: "2021-01-01" };
  registry.put({ row: first }); registry.put({ row: second });
  assert.deepEqual(registry.list({}).map(row => row.importId), [second.importId, first.importId]);
  assert.deepEqual(registry.list({ principalId: "owner" }), [first]);
  assert.throws(() => registry.get({ importId: first.importId, principalId: "other" }), { code: "NOT_FOUND" });
  assert.equal(fs.statSync(registry.directory).mode & 0o777, 0o700);
  const file = path.join(registry.directory, first.importId + ".json");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  fs.writeFileSync(file, "{");
  assert.throws(() => registry.get({ importId: first.importId, principalId: "owner" }), { code: "REGISTRY_UNREADABLE" });
  assert.throws(() => registry.list({}), { code: "REGISTRY_UNREADABLE" });
  assert.equal(fs.readFileSync(file, "utf8"), "{");
});
test("registry expires only old staged payloads and pending owner rows, retaining ready history and corrupt evidence", async t => {
  const h = await importFixture(t), r = h.registry, now = 10_000_000;
  t.mock.method(Date, "now", () => now);
  const old = randomUUID(), fresh = randomUUID(), edge = randomUUID(), corrupt = randomUUID();
  for (const [id, createdAt] of [[old, now - 3600001], [fresh, now], [edge, now - 3600000]] as const) {
    r.saveUpload({ row: { uploadId: id, principalId: "owner", createdAt } });
    fs.writeFileSync(r.uploadPath({ uploadId: id }), "zip");
  }
  fs.writeFileSync(path.join(r.directory, corrupt + ".upload.json"), "{");
  fs.writeFileSync(path.join(r.directory, "invalid.upload.json"), "{}");
  assert.throws(() => r.getUpload({ uploadId: old, principalId: "owner" }), { code: "NOT_FOUND" });
  assert.throws(() => r.getUpload({ uploadId: fresh, principalId: "other" }), { code: "NOT_FOUND" });
  assert.throws(() => r.getUpload({ uploadId: randomUUID(), principalId: "owner" }), { code: "NOT_FOUND" });
  assert.equal(r.getUpload({ uploadId: edge, principalId: "owner" }).uploadId, edge);
  const row: SiteImportRecord = { importId: randomUUID(), principalId: "owner", source: { uploadId }, displayName: "Copy", newSiteId: null, newSiteName: null, status: "needs-owner", createdAt: "2020", expiresAt: now - 1 };
  const ready = { ...row, importId: randomUUID(), status: "ready" as const };
  r.put({ row }); r.put({ row: ready }); fs.mkdirSync(r.stagePath(row)); fs.writeFileSync(path.join(r.stagePath(row), "private"), "bytes");
  const broken = randomUUID(); fs.writeFileSync(path.join(r.directory, broken + ".json"), "{");
  r.expire({});
  assert.equal(fs.existsSync(r.uploadPath({ uploadId: old })), false);
  assert.equal(fs.existsSync(path.join(r.directory, old + ".upload.json")), false);
  for (const id of [fresh, edge]) assert.equal(fs.existsSync(r.uploadPath({ uploadId: id })), true);
  assert.equal(fs.existsSync(r.stagePath(row)), false);
  assert.deepEqual(r.get({ importId: row.importId, principalId: "owner" }), { ...row, status: "failed", error: "Owner setup expired. Import the archive again." });
  assert.equal(r.get({ importId: ready.importId, principalId: "owner" }).status, "ready");
  assert.equal(fs.readFileSync(path.join(r.directory, broken + ".json"), "utf8"), "{");
  assert.equal(fs.readFileSync(path.join(r.directory, corrupt + ".upload.json"), "utf8"), "{");
});
test("upload budget refuses a fifth payload and low disk space before retaining bytes", async t => {
  const h = await importFixture(t);
  for (let n = 0; n < 4; n++) { const uploadId = randomUUID(); fs.writeFileSync(h.registry.uploadPath({ uploadId }), "staged"); h.registry.saveUpload({ row: { uploadId, principalId: "owner", createdAt: Date.now() } }); }
  await assert.rejects(h.backend.upload({ principalId: "owner", archive: h.archive }), { code: "BUSY", message: /Four imports/ });
  for (const file of fs.readdirSync(h.registry.directory).filter(name => name.endsWith(".upload.zip"))) fs.rmSync(path.join(h.registry.directory, file));
  const space = fs.statfsSync(h.registry.directory);
  t.mock.method(fs, "statfsSync", () => ({ ...space, bavail: 0 }));
  await assert.rejects(h.backend.upload({ principalId: "owner", archive: h.archive }), { code: "INSUFFICIENT_STORAGE" });
  assert.equal(fs.readdirSync(h.registry.directory).some(name => name.endsWith(".upload.zip")), false);
});
test("upload metadata failure removes the private ZIP and releases the transfer lock", async t => {
  const h = await importFixture(t), failure = new Error("registry write failed");
  const fault = t.mock.method(h.registry, "saveUpload", () => { throw failure; });
  await assert.rejects(h.backend.upload({ principalId: "owner", archive: h.archive }), error => error === failure);
  assert.equal(fs.readdirSync(h.registry.directory).some(name => name.endsWith(".upload.zip")), false);
  fault.mock.restore();
  const uploaded = await h.backend.upload({ principalId: "owner", archive: h.archive });
  assert.deepEqual(fs.readFileSync(h.registry.uploadPath(uploaded)), h.archive);
});
test("in-flight import rejects another operation, then releases its lane on verification failure", async t => {
  const h = await importFixture(t); let release!: () => void, entered!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { entered = resolve; });
  const failure = new Error("isolated verifier failed");
  const backend = createSiteImportBackend({ ...h.backendPorts, sanitize: async () => { entered(); await held; throw failure; } });
  const upload = await backend.upload({ principalId: "owner", archive: h.archive });
  const pending = backend.importBackup({ principalId: "owner", source: upload });
  const rejected = assert.rejects(pending, error => error === failure);
  await started;
  await assert.rejects(backend.list({ principalId: "owner" }), { code: "BUSY", message: /Another import/ });
  release(); await rejected;
  const rows = await backend.list({ principalId: "owner" });
  assert.equal(rows[0]?.state, "failed");
  assert.equal(rows[0]?.error, "Archive verification failed. No site was created.");
  assert.equal(fs.existsSync(h.registry.uploadPath(upload)), false);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});
test("a consumed upload cannot create a second import, while request replay is idempotent and source-bound", async t => {
  const h = await importFixture(t), upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  const request = { principalId: "owner", source: upload, requestId: "retry" };
  const pending = await h.backend.importBackup(request);
  assert.deepEqual(await h.backend.importBackup(request), pending);
  assert.deepEqual(h.backend.get({ principalId: "owner", importId: pending.importId }), pending);
  await assert.rejects(h.backend.importBackup({ ...request, source: { url: "https://different.example/site.zip" } }), { code: "REQUEST_CONFLICT" });
  await assert.rejects(h.backend.importBackup({ principalId: "owner", source: upload }), { code: "UPLOAD_USED" });
  assert.equal((await h.backend.list({ principalId: "owner" })).filter(row => row.state === "needs-owner").length, 1);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});
test("unfinished creation without an allocation is classified as failed only under the lane lock", async t => {
  const h = await importFixture(t), row: SiteImportRecord = { importId: randomUUID(), principalId: "owner", source: { uploadId }, displayName: "Copy", newSiteId: "orphan", newSiteName: "orphan", status: "creating", createdAt: "2020", expiresAt: Date.now() + 3600000 };
  h.registry.put({ row }); fs.mkdirSync(h.registry.stagePath(row));
  const rows = await h.backend.list({ principalId: "owner" });
  assert.equal(rows[0]?.state, "failed"); assert.equal(rows[0]?.newSiteId, null); assert.equal(rows[0]?.newSiteName, null);
  assert.equal(rows[0]?.error, "Site creation was interrupted and rolled back. Import the archive again.");
  assert.equal(fs.existsSync(h.registry.stagePath(row)), false);
});
for (const mode of ["no URL", "supervisor error"] as const) test(`owner creation remains ready and idempotent after ${mode}`, async t => {
  const h = await importFixture(t); let starts = 0;
  const backend = createSiteImportBackend({ ...h.backendPorts, setupBase: "/private/setup", startSite: async () => { starts++; if (mode === "supervisor error") throw new Error("supervisor offline"); return { adminUrl: null, status: "stopped" }; } });
  const upload = await backend.upload({ principalId: "owner", archive: h.archive });
  const pending = await backend.importBackup({ principalId: "owner", source: upload, displayName: "中文" });
  assert.equal(pending.setupUrl, `/private/setup/${pending.importId}/owner`);
  for (const password of [undefined, "tovu-dev"]) await assert.rejects(backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: password }), { code: "INVALID_PASSWORD" });
  assert.deepEqual(h.workspace.registry({}).list({}), []);
  const ready = await backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.state, "ready"); assert.equal(ready.newSiteName, "imported-site"); assert.match(ready.error!, /Start it from Sites|start it from Sites/);
  assert.equal(fs.existsSync(h.registry.stagePath(pending)), false);
  // Warnings are read from the import stage, which the commit removes (they never enter import
  // history), so only the first ready response carries them; everything else repeats exactly.
  const { warnings, ...committed } = ready;
  assert.deepEqual(warnings, ["Plugin 'custom' isn't code this Tovu recognises. It was imported and kept switched off.", "Skill 'custom' isn't code this Tovu recognises. It was imported and kept switched off.", "Theme 'executable' isn't code this Tovu recognises. It was imported and kept switched off."]);
  assert.deepEqual(await backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD }), committed);
  assert.equal(starts, 1); assert.equal(h.workspace.registry({}).list({}).length, 1);
});
test("owner creation checks volume space before allocating and keeps staged data for retry", async t => {
  const h = await importFixture(t), upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  const pending = await h.backend.importBackup({ principalId: "owner", source: upload });
  fs.rmSync(h.workspace.home({}), { recursive: true });
  const space = fs.statfsSync(h.registry.directory); t.mock.method(fs, "statfsSync", () => ({ ...space, bavail: 0 }));
  await assert.rejects(h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD }), { code: "INSUFFICIENT_STORAGE" });
  assert.equal(h.backend.get({ principalId: "owner", importId: pending.importId }).state, "needs-owner");
  assert.equal(fs.existsSync(h.registry.stagePath(pending)), true);
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});
