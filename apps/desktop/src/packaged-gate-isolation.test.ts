import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync,
  rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { assertPackagedGateIsolation, PackagedGateIsolationError, withIsolatedSmokeTargets } from "./packaged-gate-isolation.ts";

test("ancestor check allows a clean temp path and refuses node_modules above it, also via a symlink alias", t => {
  const root = mkdtempSync(path.join(tmpdir(), "gate-ancestor-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "checkout", "nested", "gate");
  mkdirSync(directory, { recursive: true });
  const alias = path.join(root, "alias");
  symlinkSync(directory, alias);
  assert.doesNotThrow(() => assertPackagedGateIsolation({ directory }));
  mkdirSync(path.join(root, "checkout", "node_modules"));
  assert.throws(() => assertPackagedGateIsolation({ directory }), {
    name: "Error", message: `Packaged gate isolation refused: ${path.join(realpathSync(root), "checkout", "node_modules")} exists above ${directory}`,
  });
  assert.throws(() => assertPackagedGateIsolation({ directory: alias }), PackagedGateIsolationError);
});

for (const layout of ["mac", "windows"] as const) {
  test(`${layout} copy cannot resolve a missing peer from the source checkout and is removed after success`, async t => {
    const root = mkdtempSync(path.join(tmpdir(), "gate-copy-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const checkout = path.join(root, "checkout");
    const appRoot = path.join(checkout, "release", layout === "mac" ? "Tovu.app" : "win-unpacked");
    const executablePath = path.join(appRoot, ...(layout === "mac" ? ["Contents", "MacOS", "Tovu"] : ["Tovu.exe"]));
    const nodeModulesDir = path.join(appRoot, ...(layout === "mac" ? ["Contents", "Resources"] : ["resources"]), "tovu", "node_modules");
    mkdirSync(path.dirname(executablePath), { recursive: true });
    mkdirSync(nodeModulesDir, { recursive: true });
    writeFileSync(executablePath, "shipped executable", { mode: 0o755 });
    writeFileSync(path.join(appRoot, "app.asar"), "signed bytes");
    const peer = path.join(checkout, "node_modules", "gate-peer");
    mkdirSync(peer, { recursive: true });
    writeFileSync(path.join(peer, "index.js"), "module.exports = 'checkout-only';");
    // The bug: in place, the packaged app silently borrows the checkout's copy.
    assert.equal(createRequire(path.join(nodeModulesDir, "probe.js")).resolve("gate-peer"), realpathSync(path.join(peer, "index.js")));
    if (process.platform !== "win32") symlinkSync("app.asar", path.join(appRoot, "relative-link"));
    // A symlinked temp root (macOS /var -> /private/var) must still hand the gate a real path.
    const tempRoot = process.platform === "win32" ? root : path.join(root, "tmp-alias");
    if (process.platform !== "win32") symlinkSync(root, tempRoot);
    let copiedDirectory = "";
    await withIsolatedSmokeTargets({ targets: { executablePath, nodeModulesDir }, run(targets, directory) {
      copiedDirectory = directory;
      assert.equal(path.dirname(directory), realpathSync(root));
      assert.notEqual(targets.executablePath, executablePath);
      assert.equal(readFileSync(targets.executablePath, "utf8"), "shipped executable");
      assert.ok(existsSync(targets.nodeModulesDir));
      assert.throws(() => createRequire(path.join(targets.nodeModulesDir, "probe.js")).resolve("gate-peer"), { code: "MODULE_NOT_FOUND" });
      const copiedRoot = path.join(directory, path.basename(appRoot));
      assert.equal(readFileSync(path.join(copiedRoot, "app.asar"), "utf8"), "signed bytes");
      if (process.platform !== "win32") assert.equal(readlinkSync(path.join(copiedRoot, "relative-link")), "app.asar");
    } }, { tempRoot });
    assert.equal(existsSync(copiedDirectory), false);
    assert.equal(readFileSync(executablePath, "utf8"), "shipped executable");
  });
}

test("the win32 copier keeps relative symlinks verbatim, whatever host runs it", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "gate-win32-copier-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const appRoot = path.join(root, "win-unpacked");
  const targets = { executablePath: path.join(appRoot, "Tovu.exe"), nodeModulesDir: path.join(appRoot, "resources", "tovu", "node_modules") };
  mkdirSync(targets.nodeModulesDir, { recursive: true });
  writeFileSync(targets.executablePath, "shipped executable");
  writeFileSync(path.join(appRoot, "app.asar"), "signed bytes");
  symlinkSync("app.asar", path.join(appRoot, "relative-link"));
  let seen = "";
  await withIsolatedSmokeTargets({ targets, run(copied, directory) {
    seen = readFileSync(copied.executablePath, "utf8");
    assert.equal(readlinkSync(path.join(directory, "win-unpacked", "relative-link")), "app.asar", "not rewritten to an absolute path into the source");
    assert.ok(existsSync(copied.nodeModulesDir));
  } }, { tempRoot: root, platform: "win32" });
  assert.equal(seen, "shipped executable");
  assert.deepEqual(readdirSync(root), ["win-unpacked"], "the copy is removed afterwards");
});

test("the ancestor walk reaches the filesystem root itself", t => {
  // A temp directory whose every ancestor is clean passes; the walk must also stop at "/" rather than loop.
  const root = mkdtempSync(path.join(tmpdir(), "gate-walk-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.doesNotThrow(() => assertPackagedGateIsolation({ directory: path.parse(root).root }));
});

test("a contaminated temp root never runs the gate, and copy or gate failures still remove the copy", async t => {
  const root = mkdtempSync(path.join(tmpdir(), "gate-failed-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const appRoot = path.join(root, "app");
  const targets = { executablePath: path.join(appRoot, "Tovu.exe"), nodeModulesDir: path.join(appRoot, "resources/tovu/node_modules") };
  await assert.rejects(withIsolatedSmokeTargets({ targets, run() { assert.fail("copy must fail first"); } }, { tempRoot: root }));
  assert.deepEqual(readdirSync(root), []);
  mkdirSync(appRoot);
  const failure = new Error("gate failed");
  await assert.rejects(withIsolatedSmokeTargets({ targets, run() { throw failure; } }, { tempRoot: root }), error => error === failure);
  assert.deepEqual(readdirSync(root), ["app"]);
  mkdirSync(path.join(root, "node_modules"));
  await assert.rejects(withIsolatedSmokeTargets({ targets, run() { assert.fail("a contaminated gate must never launch"); } },
    { tempRoot: root }), PackagedGateIsolationError);
  assert.deepEqual(readdirSync(root).sort(), ["app", "node_modules"]);
});
