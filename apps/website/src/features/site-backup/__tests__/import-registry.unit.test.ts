/**
 * Pins every branch of the CMS import registry (id gate, record/upload reads, history listing,
 * the transfer lock and expiry) against a real temp directory, with a mocked clock for the
 * one-hour upload and owner-setup boundaries, so refusals and retention stay identical.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { createSitesWorkspace } from "../../../platform/site-dir/sites-home.js";
import { reconcileInterruptedImports, requireStagingBudget } from "../import-backend-steps.js";
import { SiteImportRegistry, type SiteImportRecord, type SiteImportUpload } from "../import-registry.js";

const NOW = Date.UTC(2026, 0, 1);
const HOUR = 3_600_000;
const ID_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ID_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ID_C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const NOT_FOUND = { code: "NOT_FOUND", message: "Import not found." };
const UPLOAD_GONE = { code: "NOT_FOUND", message: "Upload not found or expired. Upload the ZIP again." };

function registryIn(t: TestContext, options: { clock?: boolean } = {}): SiteImportRegistry {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "import-registry-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  if (options.clock !== false) t.mock.timers.enable({ apis: ["Date"], now: NOW });
  return new SiteImportRegistry({ directory });
}
function record(overrides: Partial<SiteImportRecord> = {}): SiteImportRecord {
  return { importId: ID_A, principalId: "owner", source: { uploadId: ID_B }, newSiteId: null, newSiteName: null, displayName: "Site", status: "verifying", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: NOW + HOUR, ...overrides };
}
function upload(overrides: Partial<SiteImportUpload> = {}): SiteImportUpload { return { uploadId: ID_B, principalId: "owner", createdAt: NOW, ...overrides }; }
const mode = (file: string): number => fs.statSync(file).mode & 0o777;
const raw = (registry: SiteImportRegistry, name: string, text: string): void => fs.writeFileSync(path.join(registry.directory, name), text);

test("the registry directory is created private and resolved to an absolute path", t => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "import-registry-parent-"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const relative = path.relative(process.cwd(), path.join(parent, "nested", "imports"));
  const registry = new SiteImportRegistry({ directory: relative });
  assert.deepEqual({ directory: registry.directory, mode: mode(registry.directory) }, { directory: path.join(parent, "nested", "imports"), mode: 0o700 });
});

test("an existing registry directory is tightened to owner-only", t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "import-registry-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.chmodSync(directory, 0o755);
  new SiteImportRegistry({ directory });
  assert.equal(mode(directory), 0o700);
});

for (const id of ["../x", "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA", `${ID_A}x`, ""]) {
  test(`an id that is not a lowercase UUID is refused before touching disk (${JSON.stringify(id)})`, t => {
    assert.throws(() => registryIn(t).get({ importId: id, principalId: "owner" }), { code: "INVALID_INPUT", message: "Invalid import or upload id." });
  });
}

test("upload and stage paths are fixed names inside the registry", t => {
  const registry = registryIn(t);
  assert.deepEqual([registry.uploadPath({ uploadId: ID_B }), registry.stagePath({ importId: ID_A })], [path.join(registry.directory, `${ID_B}.upload.zip`), path.join(registry.directory, `${ID_A}.stage`)]);
});

test("upload and stage paths refuse an invalid id", t => {
  const registry = registryIn(t);
  assert.throws(() => registry.uploadPath({ uploadId: "x" }), { code: "INVALID_INPUT", message: "Invalid import or upload id." });
  assert.throws(() => registry.stagePath({ importId: "x" }), { code: "INVALID_INPUT", message: "Invalid import or upload id." });
});

test("a stored record reads back for its principal and is written owner-only", t => {
  const registry = registryIn(t);
  registry.put({ row: record() });
  assert.deepEqual({ row: registry.get({ importId: ID_A, principalId: "owner" }), mode: mode(path.join(registry.directory, `${ID_A}.json`)) }, { row: record(), mode: 0o600 });
});

test("a missing record is not found", t => {
  assert.throws(() => registryIn(t).get({ importId: ID_A, principalId: "owner" }), NOT_FOUND);
});

test("another principal's record is not found", t => {
  const registry = registryIn(t);
  registry.put({ row: record() });
  assert.throws(() => registry.get({ importId: ID_A, principalId: "intruder" }), NOT_FOUND);
});

test("an unreadable record is refused and left untouched", t => {
  const registry = registryIn(t);
  raw(registry, `${ID_A}.json`, "{");
  assert.throws(() => registry.get({ importId: ID_A, principalId: "owner" }), { code: "REGISTRY_UNREADABLE", message: "Import record is unreadable; it was left untouched." });
  assert.equal(fs.readFileSync(path.join(registry.directory, `${ID_A}.json`), "utf8"), "{");
});

test("history lists only import records, newest first, for every principal by default", t => {
  const registry = registryIn(t);
  registry.put({ row: record({ importId: ID_A, createdAt: "2026-01-01T00:00:00.000Z" }) });
  registry.put({ row: record({ importId: ID_C, principalId: "other", createdAt: "2026-02-01T00:00:00.000Z" }) });
  registry.saveUpload({ row: upload() });
  raw(registry, "notes.json", "{}"); raw(registry, `${ID_B}.upload.zip`, "PK"); fs.mkdirSync(path.join(registry.directory, `${ID_A}.stage`));
  assert.deepEqual(registry.list({}).map(row => row.importId), [ID_C, ID_A]);
});

test("history lists a record once when a non-JSON file shares its id and name length", t => {
  const registry = registryIn(t);
  registry.put({ row: record() });
  raw(registry, `${ID_A}.lock`, "");
  assert.deepEqual(registry.list({}).map(row => row.importId), [ID_A]);
});

test("history filters by principal", t => {
  const registry = registryIn(t);
  registry.put({ row: record({ importId: ID_A }) });
  registry.put({ row: record({ importId: ID_C, principalId: "other" }) });
  assert.deepEqual(registry.list({ principalId: "other" }).map(row => row.importId), [ID_C]);
});

test("a null history record is skipped", t => {
  const registry = registryIn(t);
  raw(registry, `${ID_A}.json`, "null");
  assert.deepEqual(registry.list({}), []);
});

test("a history entry that vanished before it was read (dangling link) is skipped", t => {
  const registry = registryIn(t);
  fs.symlinkSync(path.join(registry.directory, "gone"), path.join(registry.directory, `${ID_A}.json`));
  assert.deepEqual(registry.list({}), []);
});

test("an unreadable history record refuses the listing", t => {
  const registry = registryIn(t);
  raw(registry, `${ID_A}.json`, "{");
  assert.throws(() => registry.list({}), { code: "REGISTRY_UNREADABLE", message: "Import history is unreadable; it was left untouched." });
});

test("a fresh upload reads back for its principal", t => {
  const registry = registryIn(t);
  registry.saveUpload({ row: upload() });
  assert.deepEqual(registry.getUpload({ uploadId: ID_B, principalId: "owner" }), upload());
});

test("an upload exactly one hour old is still available", t => {
  const registry = registryIn(t);
  registry.saveUpload({ row: upload({ createdAt: NOW - HOUR }) });
  assert.deepEqual(registry.getUpload({ uploadId: ID_B, principalId: "owner" }), upload({ createdAt: NOW - HOUR }));
});

test("an upload older than one hour has expired", t => {
  const registry = registryIn(t);
  registry.saveUpload({ row: upload({ createdAt: NOW - HOUR - 1 }) });
  assert.throws(() => registry.getUpload({ uploadId: ID_B, principalId: "owner" }), UPLOAD_GONE);
});

test("another principal's upload is not found", t => {
  const registry = registryIn(t);
  registry.saveUpload({ row: upload() });
  assert.throws(() => registry.getUpload({ uploadId: ID_B, principalId: "intruder" }), UPLOAD_GONE);
});

test("a missing upload is not found", t => {
  assert.throws(() => registryIn(t).getUpload({ uploadId: ID_B, principalId: "owner" }), UPLOAD_GONE);
});

test("an unreadable upload is reported as not found", t => {
  const registry = registryIn(t);
  raw(registry, `${ID_B}.upload.json`, "{");
  assert.throws(() => registry.getUpload({ uploadId: ID_B, principalId: "owner" }), UPLOAD_GONE);
});

test("the transfer lane returns its run's result and releases the lock", async t => {
  const registry = registryIn(t, { clock: false });
  assert.equal(await registry.exclusive({ run: async () => "first" }), "first");
  assert.equal(await registry.exclusive({ run: async () => "second" }), "second");
});

test("the transfer lane runs one transfer at a time", async t => {
  const registry = registryIn(t, { clock: false });
  const order: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const first = registry.exclusive({ run: async () => { order.push("first:start"); await gate; order.push("first:end"); } });
  await new Promise(resolve => setTimeout(resolve, 20));
  const second = registry.exclusive({ run: async () => { order.push("second"); } });
  await new Promise(resolve => setTimeout(resolve, 20));
  release();
  await Promise.all([first, second]);
  assert.deepEqual(order, ["first:start", "first:end", "second"]);
});

test("expiry removes an upload older than one hour with its payload", t => {
  const registry = registryIn(t);
  registry.saveUpload({ row: upload({ createdAt: NOW - HOUR - 1 }) });
  raw(registry, `${ID_B}.upload.zip`, "PK");
  registry.expire({});
  assert.deepEqual(fs.readdirSync(registry.directory), []);
});

test("T25: interrupted verification and orphaned payloads release the staging budget without discarding live owner setup", async t => {
  const registry = registryIn(t);
  const orphanStageId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const liveImportId = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const interrupted = record({ source: { url: "https://public.example/site.zip" } });
  const live = record({ importId: liveImportId, status: "needs-owner" });
  registry.put({ row: interrupted });
  registry.put({ row: live });
  for (const importId of [ID_A, orphanStageId, liveImportId]) {
    fs.mkdirSync(registry.stagePath({ importId }));
    fs.writeFileSync(path.join(registry.stagePath({ importId }), "payload"), "staged");
  }
  // Crash after ZIP publication, before metadata; and a ZIP whose metadata is unreadable.
  raw(registry, `${ID_B}.upload.zip`, "PK");
  raw(registry, `${ID_C}.upload.zip`, "PK");
  raw(registry, `${ID_C}.upload.json`, "{");
  const leakedPaths = [registry.stagePath(interrupted), registry.stagePath({ importId: orphanStageId }),
    registry.uploadPath({ uploadId: ID_B }), registry.uploadPath({ uploadId: ID_C })];
  assert.deepEqual(leakedPaths.map(file => fs.existsSync(file)), [true, true, true, true]);

  // Reopen persisted state, then use the same locked recovery/budget sequence as upload().
  const restarted = new SiteImportRegistry({ directory: registry.directory });
  const workspace = createSitesWorkspace({}, { homeDir: registry.directory, cwd: registry.directory,
    appDataDir: path.join(registry.directory, "profile"), sourceRoots: [],
    env: { TOVU_SITES_HOME: path.join(registry.directory, "sites") } });
  const space = fs.statfsSync(registry.directory);
  t.mock.method(fs, "statfsSync", () => ({ ...space, bsize: 4096, bavail: 1_000_000 }));
  const recover = () => restarted.exclusive({ run: async () => {
    await reconcileInterruptedImports({ registry: restarted, workspace, put: row => restarted.put({ row }) });
    assert.doesNotThrow(() => requireStagingBudget({ registry: restarted }),
      "crash leftovers must not permanently exhaust the four-payload staging budget");
  } });

  await recover();
  assert.equal(restarted.get({ importId: ID_A, principalId: "owner" }).status, "failed");
  assert.deepEqual(leakedPaths.map(file => fs.existsSync(file)), [false, false, false, false]);
  assert.deepEqual(restarted.get({ importId: liveImportId, principalId: "owner" }), live);
  assert.equal(fs.readFileSync(path.join(restarted.stagePath(live), "payload"), "utf8"), "staged");
  await recover();
  assert.equal(fs.readFileSync(path.join(restarted.stagePath(live), "payload"), "utf8"), "staged");
});

test("expiry keeps an upload exactly one hour old", t => {
  const registry = registryIn(t);
  registry.saveUpload({ row: upload({ createdAt: NOW - HOUR }) });
  raw(registry, `${ID_B}.upload.zip`, "PK");
  registry.expire({});
  assert.deepEqual(fs.readdirSync(registry.directory).sort(), [`${ID_B}.upload.json`, `${ID_B}.upload.zip`]);
});

test("expiry keeps an unreadable upload and ignores upload files with a foreign name", t => {
  const registry = registryIn(t);
  raw(registry, `${ID_B}.upload.json`, "{");
  raw(registry, "stray.upload.json", JSON.stringify(upload({ createdAt: 0 })));
  registry.expire({});
  assert.deepEqual(fs.readdirSync(registry.directory).sort(), [`${ID_B}.upload.json`, "stray.upload.json"]);
});

test("expiry fails an owner setup past its deadline and removes its stage", t => {
  const registry = registryIn(t);
  registry.put({ row: record({ status: "needs-owner", expiresAt: NOW - 1 }) });
  fs.mkdirSync(path.join(registry.directory, `${ID_A}.stage`, "inner"), { recursive: true });
  registry.expire({});
  assert.deepEqual({ row: registry.get({ importId: ID_A, principalId: "owner" }), stage: fs.existsSync(registry.stagePath({ importId: ID_A })) },
    { row: record({ status: "failed", expiresAt: NOW - 1, error: "Owner setup expired. Import the archive again." }), stage: false });
});

test("expiry keeps an owner setup at its deadline", t => {
  const registry = registryIn(t);
  registry.put({ row: record({ status: "needs-owner", expiresAt: NOW }) });
  registry.expire({});
  assert.equal(registry.get({ importId: ID_A, principalId: "owner" }).status, "needs-owner");
});

test("expiry leaves a past-deadline record in any other status alone", t => {
  const registry = registryIn(t);
  registry.put({ row: record({ status: "creating", expiresAt: NOW - 1 }) });
  registry.expire({});
  assert.deepEqual(registry.get({ importId: ID_A, principalId: "owner" }), record({ status: "creating", expiresAt: NOW - 1 }));
});

test("expiry skips unreadable records and foreign files", t => {
  const registry = registryIn(t);
  raw(registry, `${ID_A}.json`, "{"); raw(registry, "notes.json", "{}"); raw(registry, ".import.lock", "");
  registry.expire({});
  assert.deepEqual(fs.readdirSync(registry.directory).sort(), [".import.lock", `${ID_A}.json`, "notes.json"]);
});

test("expiry crashes on a null upload row (reported, not fixed)", t => {
  const registry = registryIn(t);
  raw(registry, `${ID_B}.upload.json`, "null");
  assert.throws(() => registry.expire({}), { name: "TypeError", message: /Cannot read properties of null \(reading 'createdAt'\)/ });
});

test("expiry crashes on a null import record (reported, not fixed)", t => {
  const registry = registryIn(t);
  raw(registry, `${ID_A}.json`, "null");
  assert.throws(() => registry.expire({}), { name: "TypeError", message: /Cannot read properties of null \(reading 'status'\)/ });
});
