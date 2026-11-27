import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";
import { createSiteImportPayloadFs } from "#src/server/runtime/composition/site-import-payload-fs";

function tempRoot({ t }: { t: TestContext }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "import-payload-fs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const errno = (code: string) => Object.assign(new Error(`${code}: injected`), { code });

test("kind names files, directories, links and absences without following a link", (t) => {
  const root = tempRoot({ t });
  const payload = createSiteImportPayloadFs({});
  fs.writeFileSync(path.join(root, "file"), "x");
  fs.mkdirSync(path.join(root, "dir"));
  fs.symlinkSync(path.join(root, "dir"), path.join(root, "link"));
  assert.equal(payload.kind({ file: path.join(root, "file") }), "file");
  assert.equal(payload.kind({ file: path.join(root, "dir") }), "directory");
  assert.equal(payload.kind({ file: path.join(root, "link") }), "other");
  assert.equal(payload.kind({ file: path.join(root, "absent") }), "missing");
});

test("kind rethrows every probe error other than absence, so a broken path is never 'missing'", (t) => {
  const root = tempRoot({ t });
  fs.writeFileSync(path.join(root, "file"), "x");
  // A path below a regular file fails with ENOTDIR, not ENOENT.
  assert.throws(() => createSiteImportPayloadFs({}).kind({ file: path.join(root, "file", "child") }), { code: "ENOTDIR" });
});

test("readdir, mkdir, chmod, rename, writeExclusive and rm act on the named paths with the given modes", (t) => {
  const root = tempRoot({ t });
  const payload = createSiteImportPayloadFs({});
  const stage = path.join(root, "stage");
  payload.mkdir({ dir: stage, mode: 0o700 });
  assert.equal(fs.statSync(stage).mode & 0o777, 0o700 & ~process.umask());
  const marker = path.join(stage, "marker");
  payload.writeExclusive({ file: marker, mode: 0o600 });
  assert.throws(() => payload.writeExclusive({ file: marker, mode: 0o600 }), { code: "EEXIST" });
  payload.chmod({ file: marker, mode: 0o640 });
  assert.equal(fs.statSync(marker).mode & 0o777, 0o640);
  assert.deepEqual(payload.readdir({ dir: stage }), ["marker"]);
  const moved = path.join(root, "moved");
  payload.rename({ from: stage, to: moved });
  assert.deepEqual(fs.readdirSync(root), ["moved"]);
  payload.rm({ file: path.join(root, "absent"), recursive: false });
  payload.rm({ file: moved, recursive: true });
  assert.deepEqual(fs.readdirSync(root), []);
});

test("fsyncFile and fsyncDir flush through one descriptor each and always close it", (t) => {
  const root = tempRoot({ t });
  const payload = createSiteImportPayloadFs({});
  const file = path.join(root, "file");
  fs.writeFileSync(file, "x");
  const synced = t.mock.method(fs, "fsyncSync");
  const closed = t.mock.method(fs, "closeSync");
  payload.fsyncFile({ file });
  payload.fsyncDir({ dir: root });
  assert.equal(synced.mock.callCount(), 2);
  assert.deepEqual(closed.mock.calls.map(call => call.arguments[0]), synced.mock.calls.map(call => call.arguments[0]));
});

for (const code of ["EPERM", "EISDIR", "EINVAL", "EACCES", "ENOTSUP"]) {
  test(`fsyncDir tolerates a platform that cannot flush a directory (${code}) and still closes it`, (t) => {
    const root = tempRoot({ t });
    t.mock.method(fs, "fsyncSync", () => { throw errno(code); });
    const closed = t.mock.method(fs, "closeSync");
    createSiteImportPayloadFs({}).fsyncDir({ dir: root });
    assert.equal(closed.mock.callCount(), 1);
  });
}

test("fsyncDir rethrows a real I/O failure and still closes the descriptor", (t) => {
  const root = tempRoot({ t });
  t.mock.method(fs, "fsyncSync", () => { throw errno("EIO"); });
  const closed = t.mock.method(fs, "closeSync");
  assert.throws(() => createSiteImportPayloadFs({}).fsyncDir({ dir: root }), { code: "EIO" });
  assert.equal(closed.mock.callCount(), 1);
});

test("fsyncDir on a missing directory rethrows the open failure without closing anything", (t) => {
  const root = tempRoot({ t });
  const closed = t.mock.method(fs, "closeSync");
  assert.throws(() => createSiteImportPayloadFs({}).fsyncDir({ dir: path.join(root, "absent") }), { code: "ENOENT" });
  assert.equal(closed.mock.callCount(), 0);
});

test("fsyncDir rethrows a failure that carries no errno code", (t) => {
  const root = tempRoot({ t });
  const failure = new Error("flush failed");
  t.mock.method(fs, "fsyncSync", () => { throw failure; });
  assert.throws(() => createSiteImportPayloadFs({}).fsyncDir({ dir: root }), error => error === failure);
});
