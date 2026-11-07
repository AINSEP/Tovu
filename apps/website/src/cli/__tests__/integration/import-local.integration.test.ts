/** `tovu import-local` over the REAL backend, verifier and restore, with an isolated home: no server, no session. */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { importFixture, OWNER_PASSWORD } from "../../../features/site-backup/__tests__/import.fixture.js";
import { leaveSavedKeysOut } from "../../../features/site-backup/saved-keys.js";
import type { SiteImportBackend } from "../../../features/site-backup/import-backend.js";
import { composeSiteImportBackend } from "../../../server/runtime/composition/site-import-backend.js";
import { readRequestLine, runImportLocalCommand } from "../../commands/import-local.js";

const stagedLeftovers = (root: string) => {
  const directory = path.join(root, "profile", "site-imports", "local");
  return fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => name.endsWith(".stage") || name.endsWith(".upload.zip")) : [];
};

test("a .tovu.zip becomes a new registered site with no server and leaves no staged copy", async t => {
  const h = await importFixture(t);
  const file = path.join(h.root, "portable.tovu.zip");
  fs.writeFileSync(file, h.archive);
  const printed: string[] = [];
  const result = await runImportLocalCommand({}, { workspace: h.workspace, mintOwnerPassword: () => OWNER_PASSWORD, readRequest: async () => JSON.stringify({ file }), writeStdout: line => printed.push(line) });
  const entry = h.workspace.registry({}).list({})[0]!;
  assert.equal(result.siteId, entry.id);
  assert.equal(fs.realpathSync(result.dir), fs.realpathSync(entry.path));
  assert.deepEqual(JSON.parse(printed.join("")), result);
  assert.equal(fs.existsSync(path.join(result.dir, ".site-meta.json")), true);
  assert.equal(fs.existsSync(path.join(result.dir, "themes/static/site/index.html")), true);
  // Refused by the importer itself, so a site never quietly gets the shipped default back.
  await h.assertOwnerLogin({ dir: result.dir, rejectedPassword: "tovu-dev" });
  assert.deepEqual(stagedLeftovers(h.root), []);
  assert.ok(result.warnings.some(warning => /kept off|switched off|quarantine|plugin/i.test(warning)), JSON.stringify(result.warnings));
});

test("with no injected password the command still finishes, and its output carries no password", async t => {
  const h = await importFixture(t);
  const file = path.join(h.root, "portable.tovu.zip");
  fs.writeFileSync(file, h.archive);
  const printed: string[] = [];
  const result = await runImportLocalCommand({}, { workspace: h.workspace, readRequest: async () => JSON.stringify({ file }), writeStdout: line => printed.push(line) });
  assert.deepEqual(Object.keys(JSON.parse(printed.join(""))).sort(), ["dir", "name", "siteId", "warnings"]);
  assert.equal(fs.existsSync(result.dir), true);
});

test("a damaged archive makes no site, keeps no staged copy, and says so", async t => {
  const h = await importFixture(t);
  const file = path.join(h.root, "broken.tovu.zip");
  fs.writeFileSync(file, Buffer.from("this is not a zip"));
  // Said in plain words for a person, with no library jargon from the zip reader.
  await assert.rejects(runImportLocalCommand({}, { workspace: h.workspace, readRequest: async () => JSON.stringify({ file }), writeStdout: () => {} }),
    { name: "ValidationError", message: "That file is not a usable .tovu.zip. It is damaged, cut short, or not a zip file. No website was created." });
  assert.deepEqual(h.workspace.registry({}).list({}), []);
  assert.deepEqual(fs.readdirSync(path.join(h.root, "sites")).filter(name => !name.startsWith(".")), []);
  assert.deepEqual(stagedLeftovers(h.root), []);
});

test("a tampered archive is refused in the importer's own words", async t => {
  const h = await importFixture(t);
  const tampered = Buffer.from(h.archive);
  // Flip stored bytes in the middle: the inventory hash check, not this command, has to catch it.
  tampered[Math.floor(tampered.length / 2)]! ^= 0xff;
  const file = path.join(h.root, "tampered.tovu.zip");
  fs.writeFileSync(file, tampered);
  await assert.rejects(runImportLocalCommand({}, { workspace: h.workspace, readRequest: async () => JSON.stringify({ file }), writeStdout: () => {} }));
  assert.deepEqual(h.workspace.registry({}).list({}), []);
  assert.deepEqual(stagedLeftovers(h.root), []);
});

test("a file over the archive cap is refused before any of it is read", async t => {
  const h = await importFixture(t);
  const file = path.join(h.root, "huge.tovu.zip");
  fs.closeSync(fs.openSync(file, "w"));
  fs.truncateSync(file, 301 * 1024 * 1024);
  await assert.rejects(runImportLocalCommand({}, { workspace: h.workspace, readRequest: async () => JSON.stringify({ file }), writeStdout: () => {} }), { name: "ValidationError", message: /300 MiB/ });
});

for (const [name, request, message] of [
  ["both sources", { file: "/a.zip", url: "https://example.com/a.tovu.zip" }, /exactly one/],
  ["no source", {}, /exactly one/],
  ["a relative path", { file: "a.zip" }, /absolute/],
  ["an unknown field", { file: "/a.zip", adminPassword: "x" }, /exactly one/],
] as const) test(`refuses ${name}`, async () => {
  await assert.rejects(runImportLocalCommand({}, { readRequest: async () => JSON.stringify(request), writeStdout: () => {} }), { name: "ValidationError", message });
});

test("a plain-http share link is refused by the existing source check, not fetched", async t => {
  const h = await importFixture(t);
  await assert.rejects(runImportLocalCommand({}, { workspace: h.workspace, readRequest: async () => JSON.stringify({ url: "http://127.0.0.1:9/a.tovu.zip" }), writeStdout: () => {} }), { name: "ValidationError", message: /HTTPS/ });
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});

test("a loopback https share link is refused by the guarded client, and nothing is created", async t => {
  const h = await importFixture(t);
  await assert.rejects(runImportLocalCommand({}, { workspace: h.workspace, readRequest: async () => JSON.stringify({ url: "https://127.0.0.1:9/a.tovu.zip" }), writeStdout: () => {} }));
  assert.deepEqual(h.workspace.registry({}).list({}), []);
  assert.deepEqual(stagedLeftovers(h.root), []);
});

test("stopping the import (the app quitting) after the archive is staged creates no site and keeps no staged copy", async t => {
  const h = await importFixture(t);
  const file = path.join(h.root, "portable.tovu.zip");
  fs.writeFileSync(file, h.archive);
  const stop = new AbortController();
  const real = composeSiteImportBackend({ workspaceId: "local", workspace: h.workspace, savedKeys: { restore: leaveSavedKeysOut }, startSite: async () => ({ adminUrl: null, status: "stopped" }) });
  // The app quits right after verification, before the site is made.
  const backend: SiteImportBackend = { ...real, importBackup: async (required, options) => { const view = await real.importBackup(required, options); stop.abort(); return view; } };
  await assert.rejects(runImportLocalCommand({}, { workspace: h.workspace, backend, signal: stop.signal, readRequest: async () => JSON.stringify({ file }), writeStdout: () => {} }));
  assert.deepEqual(h.workspace.registry({}).list({}), []);
  assert.deepEqual(fs.readdirSync(path.join(h.root, "sites")).filter(name => !name.startsWith(".")), []);
  assert.deepEqual(stagedLeftovers(h.root), []);
});

test("the request is the first line of stdin, read without waiting for stdin to end", async () => {
  const input = new PassThrough();
  const stop = new AbortController();
  const line = readRequestLine({ input, stop });
  input.write('{"file":');
  input.write('"/a.zip"}\nignored later bytes');
  assert.equal(await line, '{"file":"/a.zip"}');
  assert.equal(stop.signal.aborted, false);
});

test("stdin ending after the request stops the import in plain words, and lets the process exit", async () => {
  const input = Object.assign(new PassThrough(), { unrefCalls: 0, unref() { this.unrefCalls += 1; } });
  const stop = new AbortController();
  const line = readRequestLine({ input, stop });
  input.write('{"file":"/a.zip"}\n');
  await line;
  assert.equal(input.unrefCalls, 1);
  const aborted = new Promise(resolve => stop.signal.addEventListener("abort", resolve));
  input.end();
  await aborted;
  assert.equal((stop.signal.reason as Error).name, "ValidationError");
  assert.equal((stop.signal.reason as Error).message, "The import was stopped. No website was created.");
});

for (const [name, finish] of [["closed", (i: EventEmitter) => i.emit("close")], ["broken", (i: EventEmitter) => i.emit("error", new Error("EPIPE"))]] as const) {
  test(`stdin that is ${name} after the request also stops the import`, async () => {
    const input = new EventEmitter();
    const stop = new AbortController();
    const line = readRequestLine({ input: input as never, stop });
    input.emit("data", Buffer.from('{"file":"/a.zip"}\n'));
    await line;
    finish(input);
    assert.equal(stop.signal.aborted, true);
  });
}

test("input that ends with no newline is still the request, with nothing to stop", async () => {
  const input = new PassThrough();
  const stop = new AbortController();
  const line = readRequestLine({ input, stop });
  input.end('{"file":"/a.zip"}');
  assert.equal(await line, '{"file":"/a.zip"}');
  // Both `end` and `close` have fired by now.
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(input.destroyed, true);
  assert.equal(stop.signal.aborted, false);
});

test("empty stdin is refused in plain words", async () => {
  const input = new PassThrough();
  const stop = new AbortController();
  const line = readRequestLine({ input, stop });
  input.end();
  await assert.rejects(runImportLocalCommand({}, { readRequest: () => line, writeStdout: () => {} }), { name: "ValidationError", message: /one JSON request object/ });
});

for (const [name, chunks] of [["with no newline", ["x".repeat(16 * 1024 + 1)]], ["whose newline comes past the cap", ["x".repeat(16 * 1024 + 1) + "\n"]]] as const) {
  test(`a request ${name} is refused`, async () => {
    const input = new PassThrough();
    const line = readRequestLine({ input, stop: new AbortController() });
    for (const chunk of chunks) input.write(chunk);
    await assert.rejects(line, { name: "ValidationError", message: /too large/ });
  });
}

test("a request exactly at the cap is read", async () => {
  const input = new PassThrough();
  const line = readRequestLine({ input, stop: new AbortController() });
  input.write("x".repeat(16 * 1024) + "\n");
  assert.equal((await line).length, 16 * 1024);
});

test("displayName is no longer part of the request", async () => {
  await assert.rejects(runImportLocalCommand({}, { readRequest: async () => JSON.stringify({ file: "/a.zip", displayName: "x" }), writeStdout: () => {} }), { name: "ValidationError", message: /exactly one/ });
});

test("a tidy request clears what a killed import left, makes no site and prints nothing", async t => {
  const h = await importFixture(t);
  const directory = path.join(h.root, "profile", "site-imports", "local");
  const real = composeSiteImportBackend({ workspaceId: "local", workspace: h.workspace, savedKeys: { restore: leaveSavedKeysOut }, startSite: async () => ({ adminUrl: null, status: "stopped" }) });
  // As a process killed mid-verify leaves it: a row still "verifying", its stage, and an upload with no metadata.
  const importId = "00000000-0000-4000-8000-000000000001";
  fs.writeFileSync(path.join(directory, `${importId}.json`), JSON.stringify({ importId, principalId: "local-operator", source: { uploadId: importId }, newSiteId: null, newSiteName: null, displayName: "x", status: "verifying", createdAt: new Date().toISOString(), expiresAt: Date.now() + 3600_000 }));
  fs.mkdirSync(path.join(directory, `${importId}.stage`));
  fs.writeFileSync(path.join(directory, "00000000-0000-4000-8000-000000000002.upload.zip"), "partial");
  const printed: string[] = [];
  assert.equal(await runImportLocalCommand({}, { workspace: h.workspace, backend: real, readRequest: async () => '{"tidy":true}', writeStdout: line => printed.push(line) }), null);
  assert.deepEqual(stagedLeftovers(h.root), []);
  assert.deepEqual(printed, []);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, `${importId}.json`), "utf8")).status, "failed");
  assert.deepEqual(h.workspace.registry({}).list({}), []);
});
