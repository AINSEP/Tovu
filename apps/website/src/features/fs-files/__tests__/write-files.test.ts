import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import type { SurfaceEmission } from "@jini-ai/core";
import { createSystemClock } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";

import { FS_WRITE_FILES_TOOL_ID, getFsFilesAgentToolCatalog } from "../agent-tools.js";
import { FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION } from "../custom-root-permission.js";
import { buildFsFilesRegistrations, fsFilesDerivedRisk } from "../tool-registrations.js";
import { FS_WRITE_LIMITS, FsWriteInputError, prepareFileWrites, requirePickedFolder, writePreparedFiles } from "../write-files.js";

/**
 * @file `fs_write_files` (owner 2026-10-27): the ONE way an agent writes into the picked folder —
 * a validated batch, approved once on the existing confirmation card, written temp-file-then-rename.
 * Every fixture is a temp dir; the owner's real Desktop is never touched.
 */

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const utf8 = (filePath: string, content: string) => ({ path: filePath, content });

function folderFixture(t: TestContext) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-write-files-")));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const site = path.join(base, "site");
  const folder = path.join(base, "picked");
  fs.mkdirSync(site);
  fs.mkdirSync(folder);
  return { base, site, folder };
}

// ---------------------------------------------------------------------------
// 1. Batch validation — every path checked before any card or byte.
// ---------------------------------------------------------------------------

test("refuses traversal, absolute, drive, backslash, NUL and empty paths before touching disk", (t) => {
  const { folder } = folderFixture(t);
  for (const bad of ["../escape.txt", "a/../../escape.txt", "/etc/passwd", "C:evil.txt", "a\\b.txt", "a\0b", "", "a//b.txt", "./a.txt"]) {
    assert.throws(() => prepareFileWrites({ folder, files: [utf8(bad, "x")] }), FsWriteInputError, JSON.stringify(bad));
  }
  assert.deepEqual(fs.readdirSync(folder), []);
});

test("refuses denied names and symlink components or targets, even ones pointing inside the folder", (t) => {
  const { base, folder } = folderFixture(t);
  fs.mkdirSync(path.join(folder, "real"));
  fs.writeFileSync(path.join(folder, "real", "target.txt"), "keep");
  fs.symlinkSync(path.join(folder, "real"), path.join(folder, "linked-dir"));
  fs.symlinkSync(path.join(folder, "real", "target.txt"), path.join(folder, "linked-file.txt"));
  fs.symlinkSync(base, path.join(folder, "escape"));
  for (const bad of [".env", "secrets/token.txt", "keys/server.pem", "linked-dir/new.txt", "linked-file.txt", "escape/site/x.txt", "real"]) {
    assert.throws(() => prepareFileWrites({ folder, files: [utf8(bad, "x")] }), FsWriteInputError, bad);
  }
  assert.equal(fs.readFileSync(path.join(folder, "real", "target.txt"), "utf8"), "keep");
});

test("caps: file count, per-file bytes, batch total, duplicates and bad encodings are refused", (t) => {
  const { folder } = folderFixture(t);
  const many = Array.from({ length: FS_WRITE_LIMITS.maxFiles + 1 }, (_, i) => utf8(`f${i}.txt`, "x"));
  assert.throws(() => prepareFileWrites({ folder, files: many }), /1 to 50/);
  assert.doesNotThrow(() => prepareFileWrites({ folder, files: many.slice(1) }));
  assert.throws(() => prepareFileWrites({ folder, files: [] }), /1 to 50/);
  const big = "x".repeat(FS_WRITE_LIMITS.maxFileBytes + 1);
  assert.throws(() => prepareFileWrites({ folder, files: [utf8("big.txt", big)] }), /2 MiB/);
  assert.doesNotThrow(() => prepareFileWrites({ folder, files: [utf8("edge.txt", big.slice(1))] }));
  const full = "x".repeat(FS_WRITE_LIMITS.maxFileBytes);
  const sixFull = Array.from({ length: 6 }, (_, i) => utf8(`p${i}.bin`, full));
  assert.throws(() => prepareFileWrites({ folder, files: sixFull }), /10 MiB/);
  assert.doesNotThrow(() => prepareFileWrites({ folder, files: sixFull.slice(1) }));
  assert.throws(() => prepareFileWrites({ folder, files: [utf8("a.txt", "1"), utf8("A.TXT", "2")] }), /more than once/);
  assert.throws(() => prepareFileWrites({ folder, files: [{ path: "a.bin", content: "!!!", encoding: "base64" }] }), /base64/);
  assert.throws(() => prepareFileWrites({ folder, files: [{ path: "a.bin", content: "x", encoding: "latin1" }] }), /encoding/);
  assert.deepEqual(fs.readdirSync(folder), []);
});

test("prepare reports new vs overwrite and size; write creates parents and lands exact bytes", (t) => {
  const { folder } = folderFixture(t);
  fs.writeFileSync(path.join(folder, "index.html"), "old");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
  const writes = prepareFileWrites({ folder, files: [utf8("index.html", "new"), { path: "img/logo.png", content: png.toString("base64"), encoding: "base64" }] });
  assert.deepEqual(writes.map((w) => [w.path, w.overwrite, w.bytes.length]), [["index.html", true, 3], ["img/logo.png", false, 6]]);
  assert.deepEqual(writePreparedFiles({ folder, writes }), { written: ["index.html", "img/logo.png"], notWritten: [] });
  assert.equal(fs.readFileSync(path.join(folder, "index.html"), "utf8"), "new");
  assert.deepEqual(fs.readFileSync(path.join(folder, "img", "logo.png")), png);
  assert.deepEqual(fs.readdirSync(folder).filter((name) => name.endsWith(".tmp")), []);
});

test("a mid-batch failure stops, reports written vs not written, and leaves no temp file", (t) => {
  const { folder } = folderFixture(t);
  const writes = prepareFileWrites({ folder, files: [utf8("a.txt", "A"), utf8("b.txt", "B"), utf8("c.txt", "C")] });
  fs.mkdirSync(path.join(folder, "b.txt"));
  const outcome = writePreparedFiles({ folder, writes });
  assert.deepEqual(outcome.written, ["a.txt"]);
  assert.equal(outcome.failed?.path, "b.txt");
  assert.deepEqual(outcome.notWritten, ["c.txt"]);
  assert.equal(fs.existsSync(path.join(folder, "c.txt")), false);
  assert.deepEqual(fs.readdirSync(folder).filter((name) => name.endsWith(".tmp")), []);
});

test("the picked-folder rule: refuses relative, symlink, file, missing, /, home and site ancestors, the site and inside it", (t) => {
  const { base, site, folder } = folderFixture(t);
  const home = path.join(base, "home");
  fs.mkdirSync(home);
  fs.symlinkSync(folder, path.join(base, "link"));
  fs.writeFileSync(path.join(base, "file.txt"), "x");
  fs.mkdirSync(path.join(site, "themes"));
  assert.equal(requirePickedFolder({ dir: folder, siteDir: site }, { homeDir: home }), folder);
  for (const dir of ["picked", path.join(base, "link"), path.join(base, "file.txt"), path.join(base, "missing"), "/", home, base, site, path.join(site, "themes")]) {
    assert.throws(() => requirePickedFolder({ dir, siteDir: site }, { homeDir: home }), FsWriteInputError, dir);
  }
});

// ---------------------------------------------------------------------------
// 2. The tool: catalog, permission, card, approval.
// ---------------------------------------------------------------------------

function toolHarness(t: TestContext, { folder, site, allowed = true }: { folder: string | undefined; site: string; allowed?: boolean }) {
  const store = createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: { newId: () => "write-card-1" }, defaultChannel: "mcp-ui" });
  const controller = new AbortController();
  t.after(() => controller.abort());
  const permissions: string[] = [];
  const registrations = buildFsFilesRegistrations({ workspaceId: "ws", siteBinding: { dir: site },
    authorize: async (request: { permission: string }) => { permissions.push(request.permission); return { allowed } as never; },
    resolveRoots: () => ({ repo: site, site, custom: folder }),
  } as never, { surfaceExchanges: store });
  const handler = registrations.find((r) => r.descriptor.id === FS_WRITE_FILES_TOOL_ID)!.handler;
  const emitted: SurfaceEmission[] = [];
  const call = (input: unknown, withSurface = true) => handler(
    { executionId: "e1", principal: { id: "owner-1" }, run: { id: "run-1" }, tool: { id: FS_WRITE_FILES_TOOL_ID }, input, signal: controller.signal } as never,
    withSurface ? { emitSurface: async (surface: SurfaceEmission) => { emitted.push(surface); } } : {},
  );
  const answer = (decision: "confirm" | "cancel") => store.deliver({ exchangeId: "write-card-1", principalId: "owner-1", params: { decision } }, { toolId: FS_WRITE_FILES_TOOL_ID });
  const cardText = () => JSON.stringify(emitted[0]?.payload);
  return { call, answer, emitted, cardText, permissions, store };
}

test("catalog: fs_write_files mutates durable state under the folder-manage permission; reads stay read-only", () => {
  const byId = new Map(getFsFilesAgentToolCatalog().map((d) => [d.name, d]));
  const write = byId.get(FS_WRITE_FILES_TOOL_ID);
  assert.equal(write?.sideEffects, "mutates-durable-state");
  assert.equal(write?.authorization.permission, FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION);
  assert.equal(fsFilesDerivedRisk.get(FS_WRITE_FILES_TOOL_ID), "mutates-durable-state");
  assert.deepEqual((write?.inputSchema as { required: string[] }).required, ["files"]);
});

test("without a confirmation channel nothing is written and nothing is asked", async (t) => {
  const { site, folder } = folderFixture(t);
  const h = toolHarness(t, { folder, site });
  await assert.rejects(() => h.call({ files: [utf8("a.txt", "x")] }, false), /NO_CONFIRMATION_CHANNEL/);
  assert.equal(fs.existsSync(path.join(folder, "a.txt")), false);
});

test("a principal without fs_files.custom_root.manage is refused before any card", async (t) => {
  const { site, folder } = folderFixture(t);
  const h = toolHarness(t, { folder, site, allowed: false });
  await assert.rejects(() => h.call({ files: [utf8("a.txt", "x")] }));
  assert.deepEqual(h.permissions, [FS_FILES_CUSTOM_ROOT_MANAGE_PERMISSION]);
  assert.equal(h.emitted.length, 0);
});

test("no picked folder, or one containing the site, is refused before any card", async (t) => {
  const { base, site } = folderFixture(t);
  for (const folder of [undefined, base, site]) {
    const h = toolHarness(t, { folder, site });
    await assert.rejects(() => h.call({ files: [utf8("a.txt", "x")] }));
    assert.equal(h.emitted.length, 0);
  }
  assert.equal(fs.existsSync(path.join(base, "a.txt")), false);
});

test("one card lists every file with new/overwrite, size and total; decline writes nothing", async (t) => {
  const { site, folder } = folderFixture(t);
  fs.writeFileSync(path.join(folder, "index.html"), "old");
  const h = toolHarness(t, { folder, site });
  const pending = h.call({ files: [utf8("index.html", "<h1>new</h1>"), utf8("css/site.css", "body{}")] });
  await turn();
  assert.equal(h.emitted.length, 1);
  const card = h.cardText();
  for (const expected of ["index.html", "overwrite", "css/site.css", "new", "2 file(s)", "6 B", "18 B", folder]) {
    assert.ok(card.includes(expected), `card must show ${expected}`);
  }
  const { resource } = h.emitted[0]!.payload as { resource: { resource: { text: string } } };
  const plan = JSON.parse(/\bvar PLAN = ([^\n]+);/.exec(resource.resource.text)![1]!) as Record<string, unknown>;
  assert.deepEqual(Object.keys(plan).sort(), ["cancel", "confirm"], "no always-allow alternative is offered");
  h.answer("cancel");
  const result = await pending as { applied: boolean; cancelled: boolean };
  assert.equal(result.applied, false);
  assert.equal(result.cancelled, true);
  assert.equal(fs.readFileSync(path.join(folder, "index.html"), "utf8"), "old");
  assert.equal(fs.existsSync(path.join(folder, "css")), false);
});

test("confirm writes exactly the approved batch, even if the model's input object changes after the card", async (t) => {
  const { site, folder } = folderFixture(t);
  const h = toolHarness(t, { folder, site });
  const input = { files: [utf8("a.txt", "approved")] };
  const pending = h.call(input);
  await turn();
  input.files[0]!.content = "swapped";
  input.files.push(utf8("b.txt", "extra"));
  h.answer("confirm");
  assert.deepEqual(await pending, { applied: true, written: ["a.txt"], notWritten: [] });
  assert.equal(fs.readFileSync(path.join(folder, "a.txt"), "utf8"), "approved");
  assert.equal(fs.existsSync(path.join(folder, "b.txt")), false);
});

test("a file that appears after the card was drawn is not overwritten; the rest is reported", async (t) => {
  const { site, folder } = folderFixture(t);
  const h = toolHarness(t, { folder, site });
  const pending = h.call({ files: [utf8("a.txt", "A"), utf8("b.txt", "B"), utf8("c.txt", "C")] });
  await turn();
  fs.writeFileSync(path.join(folder, "b.txt"), "someone else's");
  h.answer("confirm");
  const result = await pending as { applied: boolean; written: string[]; failed: { path: string }; notWritten: string[] };
  assert.equal(result.applied, false);
  assert.deepEqual([result.written, result.failed.path, result.notWritten], [["a.txt"], "b.txt", ["c.txt"]]);
  assert.equal(fs.readFileSync(path.join(folder, "b.txt"), "utf8"), "someone else's");
});
