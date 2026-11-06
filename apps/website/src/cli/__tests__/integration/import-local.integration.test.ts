/** `tovu import-local` over the REAL backend, verifier and restore, with an isolated home: no server, no session. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { importFixture, OWNER_PASSWORD } from "../../../features/site-backup/__tests__/import.fixture.js";
import { runImportLocalCommand } from "../../commands/import-local.js";

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

test("the default owner password is a strong one nobody chose, and never reaches stdout", async t => {
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
  await assert.rejects(runImportLocalCommand({}, { workspace: h.workspace, readRequest: async () => JSON.stringify({ file }), writeStdout: () => {} }));
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
