/**
 * Pins the import backend's input contract and every refusal/recovery text the backend records,
 * so its steps can move without changing what a caller or a stored import row says.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { createSiteImportBackend, parseSiteImportInput } from "../import-backend.js";
import { SHARE_LIMITS } from "../share-policy.js";
import type { HttpResponse } from "../../../platform/http/index.js";
import { importFixture, OWNER_PASSWORD } from "./import.fixture.js";
import { createTracker } from "@jini-ai/diagnostics/observability/node";
import type { ProductEvent } from "@jini-ai/analytics/product";

const UPLOAD_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const INPUT = (message: string) => ({ code: "INVALID_INPUT", message });
const SOURCE = INPUT("Provide exactly one source: url or uploadId; optional displayName and requestId only.");

// parseSiteImportInput ------------------------------------------------------------------------

for (const [label, input] of [
  ["null", null], ["a string", "https://a.example/x.zip"], ["an array", [UPLOAD_ID]], ["an unknown key", { uploadId: UPLOAD_ID, path: "/etc" }],
  ["both sources", { uploadId: UPLOAD_ID, url: "https://a.example/x.zip" }], ["no source", { displayName: "Copy" }],
] as const) {
  test(`input with ${label} is refused as a source error`, () => { assert.throws(() => parseSiteImportInput({ input }), SOURCE); });
}
test("an array carrying a url property is refused as a source error", () => {
  assert.throws(() => parseSiteImportInput({ input: Object.assign([], { url: "https://a.example/x.zip" }) }), SOURCE);
});
for (const displayName of [42, "  ", "x".repeat(201)]) {
  test(`displayName ${JSON.stringify(displayName).slice(0, 12)} is refused`, () => {
    assert.throws(() => parseSiteImportInput({ input: { uploadId: UPLOAD_ID, displayName } }), INPUT("displayName must be 1..200 characters."));
  });
}
for (const requestId of [7, "", "has space", "x".repeat(129)]) {
  test(`requestId ${JSON.stringify(requestId).slice(0, 12)} is refused`, () => {
    assert.throws(() => parseSiteImportInput({ input: { uploadId: UPLOAD_ID, requestId } }), INPUT("requestId must be 1..128 letters, digits, dashes or underscores."));
  });
}
for (const url of [42, "https://a.example/" + "x".repeat(4096), "not a url"]) {
  test(`url ${JSON.stringify(url).slice(0, 16)} is refused as not an HTTPS share URL`, () => {
    assert.throws(() => parseSiteImportInput({ input: { url } }), INPUT("url must be an HTTPS share URL."));
  });
}
for (const url of ["http://a.example/x.zip", "https://user@a.example/x.zip", "https://:pw@a.example/x.zip", "https://a.example/x.zip#frag"]) {
  test(`url ${url} is refused for scheme, credentials or fragment`, () => {
    assert.throws(() => parseSiteImportInput({ input: { url } }), INPUT("Import URLs require HTTPS without credentials or fragments."));
  });
}
for (const uploadId of [7, "../../etc/passwd", UPLOAD_ID.toUpperCase()]) {
  test(`uploadId ${JSON.stringify(uploadId).slice(0, 16)} is refused`, () => {
    assert.throws(() => parseSiteImportInput({ input: { uploadId } }), INPUT("uploadId must come from the authenticated ZIP upload endpoint."));
  });
}
test("a URL source is normalised to its href and optional fields are kept only when given", () => {
  assert.deepEqual(parseSiteImportInput({ input: { url: "https://A.example/x.zip" } }), { source: { url: "https://a.example/x.zip" } });
  assert.deepEqual(parseSiteImportInput({ input: { uploadId: UPLOAD_ID, displayName: "x".repeat(200), requestId: "r-1_A" } }), { source: { uploadId: UPLOAD_ID }, displayName: "x".repeat(200), requestId: "r-1_A" });
});

// Backend refusals and recorded errors -------------------------------------------------------

const response = (overrides: Partial<HttpResponse>): HttpResponse => ({ status: 200, headers: { "content-type": "application/zip" }, bodyText: "", bodyBytes: Buffer.alloc(0), bodyBytesTruncated: false, ...overrides });
const URL_SOURCE = { url: "https://public.example/site.tovu.zip" };

test("an upload over the archive cap is refused with the upload cap message", async t => {
  const h = await importFixture(t);
  await assert.rejects(h.backend.upload({ principalId: "owner", archive: Buffer.alloc(SHARE_LIMITS.maxArchiveBytes + 1) }), { code: "LIMIT_EXCEEDED", message: "Upload exceeds the 300 MiB ZIP cap." });
});
test("a fifth staged payload is refused with the staging budget message", async t => {
  const h = await importFixture(t);
  for (let n = 0; n < 4; n++) { const uploadId = randomUUID(); fs.writeFileSync(h.registry.uploadPath({ uploadId }), "staged"); h.registry.saveUpload({ row: { uploadId, principalId: "owner", createdAt: Date.now() } }); }
  await assert.rejects(h.backend.upload({ principalId: "owner", archive: h.archive }), { code: "BUSY", message: "Four imports are staged. Complete owner setup or wait for expiry before uploading another." });
});
test("low private staging space is refused with the staging space message", async t => {
  const h = await importFixture(t), space = fs.statfsSync(h.registry.directory);
  t.mock.method(fs, "statfsSync", () => ({ ...space, bavail: 0 }));
  await assert.rejects(h.backend.upload({ principalId: "owner", archive: h.archive }), { code: "INSUFFICIENT_STORAGE", message: "Import requires 900 MiB of free private staging space." });
});
test("a URL import checks the staging budget; an upload import does not", async t => {
  const h = await importFixture(t), upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  for (let n = 0; n < 4; n++) { const uploadId = randomUUID(); fs.writeFileSync(h.registry.uploadPath({ uploadId }), "staged"); h.registry.saveUpload({ row: { uploadId, principalId: "owner", createdAt: Date.now() } }); }
  await assert.rejects(h.backend.importBackup({ principalId: "owner", source: URL_SOURCE }), { code: "BUSY", message: "Four imports are staged. Complete owner setup or wait for expiry before uploading another." });
  assert.equal((await h.backend.importBackup({ principalId: "owner", source: upload })).state, "needs-owner");
});
test("a request id reused for another source is refused", async t => {
  const h = await importFixture(t), upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  await h.backend.importBackup({ principalId: "owner", source: upload, requestId: "retry" });
  await assert.rejects(h.backend.importBackup({ principalId: "owner", source: URL_SOURCE, requestId: "retry" }), { code: "REQUEST_CONFLICT", message: "requestId already belongs to another source." });
});
test("a consumed upload is refused and recorded on the failed row", async t => {
  const h = await importFixture(t), upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  await h.backend.importBackup({ principalId: "owner", source: upload });
  const message = "This upload was already imported. Use the original requestId or upload again for a separate site.";
  await assert.rejects(h.backend.importBackup({ principalId: "owner", source: upload }), { code: "UPLOAD_USED", message });
  assert.deepEqual((await h.backend.list({ principalId: "owner" })).filter(row => row.state === "failed").map(row => row.error), [message]);
});
test("an already-aborted caller signal fails the import before anything is fetched", async t => {
  const h = await importFixture(t); let fetched = false;
  const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async () => { fetched = true; return response({}); } } });
  await assert.rejects(backend.importBackup({ principalId: "owner", source: URL_SOURCE }, { signal: AbortSignal.abort(new Error("caller cancelled")) }), { message: "caller cancelled" });
  assert.equal(fetched, false);
  assert.equal((await backend.list({ principalId: "owner" }))[0]?.error, "Archive verification failed. No site was created.");
});
test("the download request is a bounded identity GET of the share URL", async t => {
  const h = await importFixture(t); const sent: unknown[] = [];
  const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async request => { sent.push({ ...request, signal: request.signal instanceof AbortSignal }); return response({ bodyBytes: h.archive }); } } });
  await backend.importBackup({ principalId: "owner", source: URL_SOURCE });
  assert.deepEqual(sent, [{ method: "GET", url: URL_SOURCE.url, headers: { Accept: "application/zip", "Accept-Encoding": "identity" }, idleTimeoutMs: 30_000, totalDeadlineMs: 120_000, maxResponseBytes: SHARE_LIMITS.maxArchiveBytes, signal: true }]);
});
for (const [label, overrides] of [["a non-200 status", { status: 206 }], ["no body", { bodyBytes: undefined }], ["a truncated body", { bodyBytesTruncated: true }]] as const) {
  test(`a download with ${label} is refused as a failed download`, async t => {
    const h = await importFixture(t);
    const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async () => response({ bodyBytes: h.archive, ...overrides }) } });
    await assert.rejects(backend.importBackup({ principalId: "owner", source: URL_SOURCE }), { code: "DOWNLOAD_FAILED", message: "Share download failed or exceeded the 300 MiB archive cap." });
  });
}
const REFUSED_CONTENT_TYPES: Record<string, string>[] = [{}, { "content-type": "" }, { "content-type": "text/html" }];
for (const headers of REFUSED_CONTENT_TYPES) {
  test(`a download with content type ${JSON.stringify(headers)} is refused`, async t => {
    const h = await importFixture(t);
    const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async () => response({ headers, bodyBytes: h.archive }) } });
    await assert.rejects(backend.importBackup({ principalId: "owner", source: URL_SOURCE }), { code: "INVALID_CONTENT_TYPE", message: "Share download must have a ZIP or binary Content-Type." });
  });
}
test("an archive reader error that is not a share refusal is recorded with the generic message", async t => {
  const h = await importFixture(t);
  const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async () => response({ bodyBytes: Buffer.from("not a zip") }) } });
  await assert.rejects(backend.importBackup({ principalId: "owner", source: URL_SOURCE }), { message: /not a zip file/ });
  assert.equal((await backend.list({ principalId: "owner" }))[0]?.error, "Archive verification failed. No site was created.");
});
test("the imported site name comes from the archive unless a display name was given", async t => {
  const h = await importFixture(t);
  const first = await h.backend.importBackup({ principalId: "owner", source: await h.backend.upload({ principalId: "owner", archive: h.archive }) });
  const named = await h.backend.importBackup({ principalId: "owner", source: await h.backend.upload({ principalId: "owner", archive: h.archive }), displayName: "My Copy!" });
  const ready = await h.backend.completeOwner({ principalId: "owner", importId: named.importId, adminPassword: OWNER_PASSWORD });
  assert.equal(ready.newSiteName, "my-copy");
  assert.equal(h.registry.get({ principalId: "owner", importId: first.importId }).displayName, "Portable");
});

// Owner setup ---------------------------------------------------------------------------------

test("site_imported fires exactly once after owner commit, including a repeated completion", async t => {
  const h = await importFixture(t), events: ProductEvent[] = [];
  const tracker = createTracker({ productAnalytics: { capture: event => { events.push(event); }, identify() {} } });
  const backend = createSiteImportBackend({ ...h.backendPorts, tracker });
  const pending = await backend.importBackup({ principalId: "owner", source: await backend.upload({ principalId: "owner", archive: h.archive }) });
  assert.deepEqual(events, []);
  const input = { principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD };
  const ready = await backend.completeOwner(input);
  assert.equal(ready.state, "ready");
  // Warnings are read from the import stage, which the commit removes (they never enter import
  // history), so only the first ready response carries them; everything else repeats exactly.
  const { warnings, ...committed } = ready;
  assert.deepEqual(warnings, ["Plugin 'custom' isn't code this Tovu recognises. It was imported and kept switched off.", "Skill 'custom' isn't code this Tovu recognises. It was imported and kept switched off.", "Theme 'executable' isn't code this Tovu recognises. It was imported and kept switched off."]);
  assert.deepEqual(await backend.completeOwner(input), committed);
  assert.deepEqual(events, [{ name: "site_imported", userId: "owner", properties: {
    targetSiteId: ready.newSiteId!, operationId: pending.importId, eventId: `import:${pending.importId}`, source: "admin",
  } }]);
});

test("site_imported stays silent when creating the imported site fails", async t => {
  const h = await importFixture(t), events: ProductEvent[] = [];
  const failure = new Error("creation failed");
  const tracker = createTracker({ productAnalytics: { capture: event => { events.push(event); }, identify() {} } });
  const backend = createSiteImportBackend({ ...h.backendPorts, tracker }, { createSite: async () => { throw failure; } });
  const pending = await backend.importBackup({ principalId: "owner", source: await backend.upload({ principalId: "owner", archive: h.archive }) });
  await assert.rejects(backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD }), error => error === failure);
  assert.equal(backend.get({ principalId: "owner", importId: pending.importId }).state, "failed");
  assert.deepEqual(events, []);
});

async function pendingImport(t: test.TestContext) {
  const h = await importFixture(t);
  const pending = await h.backend.importBackup({ principalId: "owner", source: await h.backend.upload({ principalId: "owner", archive: h.archive }) });
  return { h, pending };
}
test("owner setup on a failed import is refused as not awaiting setup", async t => {
  const { h, pending } = await pendingImport(t);
  h.registry.put({ row: { ...h.registry.get({ principalId: "owner", importId: pending.importId }), status: "failed" } });
  await assert.rejects(h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD }), { code: "INVALID_STATE", message: "This import is not awaiting owner setup. Import the archive again if it failed or expired." });
});
for (const adminPassword of [undefined, "tovu-dev"]) {
  test(`owner password ${String(adminPassword)} is refused`, async t => {
    const { h, pending } = await pendingImport(t);
    await assert.rejects(h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword }), { code: "INVALID_PASSWORD", message: "Choose a new owner password; the development default cannot be used for an import." });
  });
}
test("low sites-home space is refused with the sites-home message", async t => {
  const { h, pending } = await pendingImport(t), space = fs.statfsSync(h.registry.directory);
  t.mock.method(fs, "statfsSync", () => ({ ...space, bavail: 0 }));
  await assert.rejects(h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD }), { code: "INSUFFICIENT_STORAGE", message: "Import requires 900 MiB of free space on the sites-home volume." });
});
test("an already-aborted owner setup is refused before the row is marked creating", async t => {
  const { h, pending } = await pendingImport(t);
  await assert.rejects(h.backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD }, { signal: AbortSignal.abort(new Error("owner cancelled")) }), { message: "owner cancelled" });
  assert.equal(h.backend.get({ principalId: "owner", importId: pending.importId }).state, "needs-owner");
});
test("a failed site creation is rolled back and recorded", async t => {
  const { h, pending } = await pendingImport(t), failure = new Error("create failed");
  const backend = createSiteImportBackend(h.backendPorts, { createSite: async () => { throw failure; } });
  await assert.rejects(backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD }), error => error === failure);
  const row = backend.get({ principalId: "owner", importId: pending.importId });
  assert.deepEqual([row.state, row.newSiteId, row.error], ["failed", null, "Site creation failed and was rolled back. Import the archive again."]);
  assert.equal(fs.existsSync(h.registry.stagePath(pending)), false);
});
for (const [mode, startSite, error] of [
  ["no admin URL", async () => ({ adminUrl: null, status: "stopped" }), "Site created; start it from Sites to open admin."],
  ["a supervisor error", async () => { throw new Error("offline"); }, "Site created with its owner. Start it from Sites to open admin."],
  ["an admin URL", async () => ({ adminUrl: "http://localhost:1/admin", status: "running" }), undefined],
] as const) {
  test(`a created site started with ${mode} records its start outcome`, async t => {
    const { h, pending } = await pendingImport(t);
    const backend = createSiteImportBackend({ ...h.backendPorts, startSite });
    const ready = await backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
    assert.deepEqual([ready.state, ready.error, ready.instructions], ["ready", error, "Open adminUrl when available. Imported extensions remain quarantined and need explicit review before activation."]);
  });
}
test("a pending import view carries the default setup URL and owner instructions", async t => {
  const { pending } = await pendingImport(t);
  assert.equal(pending.setupUrl, `/api/admin/v1/site-imports/${pending.importId}/owner`);
  assert.equal(pending.instructions, "Open setupUrl while signed in as the importing principal and choose a new owner password privately. The site is unavailable until setup completes.");
});
test("progress reports every stored status in order", async t => {
  const h = await importFixture(t), reports: string[] = [];
  const backend = createSiteImportBackend(h.backendPorts, { report: ({ status }) => reports.push(status) });
  const pending = await backend.importBackup({ principalId: "owner", source: await backend.upload({ principalId: "owner", archive: h.archive }) });
  await backend.completeOwner({ principalId: "owner", importId: pending.importId, adminPassword: OWNER_PASSWORD });
  assert.deepEqual(reports, ["verifying", "needs-owner", "creating", "creating", "ready", "ready"]);
});
test("a replayed request id returns the original import without starting another", async t => {
  const h = await importFixture(t), upload = await h.backend.upload({ principalId: "owner", archive: h.archive });
  const first = await h.backend.importBackup({ principalId: "owner", source: upload, requestId: "replay" });
  assert.deepEqual(await h.backend.importBackup({ principalId: "owner", source: upload, requestId: "replay" }), first);
  assert.equal((await h.backend.list({ principalId: "owner" })).length, 1);
});
test("a second operation while one holds the import lane is refused as busy", async t => {
  const h = await importFixture(t); let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const backend = createSiteImportBackend({ ...h.backendPorts, http: { send: async () => { await held; return response({ status: 500 }); } } });
  const first = assert.rejects(backend.importBackup({ principalId: "owner", source: URL_SOURCE }), { code: "DOWNLOAD_FAILED" });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(backend.list({ principalId: "owner" }), { code: "BUSY", message: "Another import is running. Retry after it finishes." });
  release(); await first;
});
